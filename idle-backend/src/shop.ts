import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import {
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel
} from "@maxidle/shared/shop";
import { calculateElapsedSeconds } from "./time.js";
import { calculateIdleSecondsGain, getIdleSecondsRate } from "./idleRate.js";
import type { AuthClaims } from "./types.js";

export {
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel
} from "@maxidle/shared/shop";

type ShopRouteIdentity = {
  claims: AuthClaims;
};

type RegisterShopRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<ShopRouteIdentity>;
  toNumber: (value: unknown) => number;
  getAchievementBonusMultiplier: (achievementCount: number) => number;
  normalizeCompletedAchievementIds: (currentValue: unknown, idsToAdd?: string[]) => string[];
};

export function registerShopRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  getAchievementBonusMultiplier,
  normalizeCompletedAchievementIds
}: RegisterShopRoutesOptions): void {
  app.post("/shop/purchase", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);

      const upgradeType = String(req.body?.upgradeType ?? "");
      const quantity = Number(req.body?.quantity);
      if (upgradeType !== "seconds_multiplier") {
        res.status(400).json({ error: "Unsupported upgrade type" });
        return;
      }
      if (![1, 5, 10].includes(quantity)) {
        res.status(400).json({ error: "Invalid purchase quantity" });
        return;
      }

      const userId = identity.claims.sub;
      await client.query("BEGIN");
      const rowResult = await client.query<{
        total_seconds_collected: string;
        spendable_idle_seconds: string;
        achievement_count: string;
        completed_achievements: unknown;
        upgrades_purchased: number | string;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        seconds_multiplier: number | string;
      }>(
        `
        SELECT
          total_seconds_collected,
          spendable_idle_seconds,
          achievement_count,
          completed_achievements,
          upgrades_purchased,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          seconds_multiplier
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );

      const row = rowResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const now = new Date();
      const secondsMultiplier = Number(row.seconds_multiplier);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const elapsedSinceCurrentUpdate = calculateElapsedSeconds(row.current_seconds_last_updated, now);
      const incrementalBaseGain = calculateIdleSecondsGain(elapsedSinceCurrentUpdate);
      const incrementalBoostedGain = Math.floor(incrementalBaseGain * secondsMultiplier * achievementBonusMultiplier);
      const syncedCurrentSeconds = toNumber(row.current_seconds) + incrementalBoostedGain;

      const currentLevel = multiplierToLevel(secondsMultiplier);
      const totalCost = getSecondsMultiplierPurchaseCost(currentLevel, quantity);
      const spendableIdleSeconds = toNumber(row.spendable_idle_seconds);
      if (spendableIdleSeconds < totalCost) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough funds",
          code: "INSUFFICIENT_FUNDS"
        });
        return;
      }

      const nextLevel = currentLevel + quantity;
      const nextMultiplier = levelToMultiplier(nextLevel);
      const nextUpgradesPurchased = toNumber(row.upgrades_purchased) + quantity;
      const nextCompletedAchievementIds =
        nextUpgradesPurchased >= 4
          ? normalizeCompletedAchievementIds(row.completed_achievements, [ACHIEVEMENT_IDS.BEGINNER_SHOPPER])
          : normalizeCompletedAchievementIds(row.completed_achievements);
      const nextAchievementCount = nextCompletedAchievementIds.length;
      const nextAchievementBonusMultiplier = getAchievementBonusMultiplier(nextAchievementCount);
      const updateResult = await client.query<{
        total_seconds_collected: string;
        spendable_idle_seconds: string;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        seconds_multiplier: number | string;
      }>(
        `
        UPDATE player_states
        SET
          spendable_idle_seconds = $2,
          current_seconds = $3,
          current_seconds_last_updated = $4,
          seconds_multiplier = $5,
          upgrades_purchased = $6,
          completed_achievements = $7::jsonb,
          achievement_count = $8
        WHERE user_id = $1
        RETURNING
          total_seconds_collected,
          spendable_idle_seconds,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          seconds_multiplier
        `,
        [
          userId,
          spendableIdleSeconds - totalCost,
          syncedCurrentSeconds,
          now,
          nextMultiplier,
          nextUpgradesPurchased,
          JSON.stringify(nextCompletedAchievementIds),
          nextAchievementCount
        ]
      );
      const updated = updateResult.rows[0];
      await client.query("COMMIT");

      if (!updated) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      res.json({
        totalIdleSeconds: toNumber(updated.total_seconds_collected),
        collectedIdleSeconds: toNumber(updated.spendable_idle_seconds),
        currentSeconds: toNumber(updated.current_seconds),
        secondsMultiplier: toNumber(updated.seconds_multiplier),
        achievementBonusMultiplier: nextAchievementBonusMultiplier,
        idleSecondsRate: getIdleSecondsRate({ secondsSinceLastCollection: elapsedSinceLastCollection }),
        currentSecondsLastUpdated: updated.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updated.last_collected_at.toISOString(),
        serverTime: now.toISOString(),
        purchase: {
          upgradeType,
          quantity,
          totalCost
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });
}
