import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import {
  getSecondsMultiplier,
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel,
  withSecondsMultiplier
} from "@maxidle/shared/shop";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { normalizeCompletedAchievementIds } from "./achievementUpdates.js";
import { calculateElapsedSeconds } from "./time.js";
import { getIdleSecondsRate } from "./idleRate.js";
import type { AuthClaims } from "./types.js";

export {
  getSecondsMultiplier,
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel,
  withSecondsMultiplier
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
};

export function registerShopRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  getAchievementBonusMultiplier
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
        idle_time_total: string;
        idle_time_available: string;
        real_time_total: string;
        real_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        achievement_count: string;
        has_unseen_achievements: boolean;
        completed_achievements: unknown;
        upgrades_purchased: number | string;
        shop: unknown;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        SELECT
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          achievement_count,
          has_unseen_achievements,
          completed_achievements,
          upgrades_purchased,
          shop,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          last_daily_reward_collected_at
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
      const secondsMultiplier = getSecondsMultiplier(row.shop);

      const currentLevel = multiplierToLevel(secondsMultiplier);
      const totalCost = getSecondsMultiplierPurchaseCost(currentLevel, quantity);
      const idleTimeAvailable = toNumber(row.idle_time_available);
      if (idleTimeAvailable < totalCost) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough funds",
          code: "INSUFFICIENT_FUNDS"
        });
        return;
      }

      const nextLevel = currentLevel + quantity;
      const nextMultiplier = levelToMultiplier(nextLevel);
      const nextShopState = withSecondsMultiplier(row.shop, nextMultiplier);
      const nextUpgradesPurchased = toNumber(row.upgrades_purchased) + quantity;
      const nextCompletedAchievementIds =
        nextUpgradesPurchased >= 4
          ? normalizeCompletedAchievementIds(row.completed_achievements, [ACHIEVEMENT_IDS.BEGINNER_SHOPPER])
          : normalizeCompletedAchievementIds(row.completed_achievements);
      const hasNewAchievement = nextCompletedAchievementIds.length > toNumber(row.achievement_count);
      const nextAchievementCount = nextCompletedAchievementIds.length;
      const nextAchievementBonusMultiplier = getAchievementBonusMultiplier(nextAchievementCount);
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        now,
        nextMultiplier,
        nextAchievementBonusMultiplier
      );
      const updateResult = await client.query<{
        idle_time_total: string;
        idle_time_available: string;
        has_unseen_achievements: boolean;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        shop: unknown;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          idle_time_available = $2,
          current_seconds = $3,
          current_seconds_last_updated = $4,
          shop = $5::jsonb,
          upgrades_purchased = $6,
          completed_achievements = $7::jsonb,
          achievement_count = $8,
          has_unseen_achievements = has_unseen_achievements OR $9::boolean
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          has_unseen_achievements,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          shop,
          last_daily_reward_collected_at
        `,
        [
          userId,
          idleTimeAvailable - totalCost,
          syncedCurrentSeconds,
          now,
          JSON.stringify(nextShopState),
          nextUpgradesPurchased,
          JSON.stringify(nextCompletedAchievementIds),
          nextAchievementCount,
          hasNewAchievement
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
        idleTime: {
          total: toNumber(updated.idle_time_total),
          available: toNumber(updated.idle_time_available)
        },
        realTime: {
          total: toNumber(row.real_time_total),
          available: toNumber(row.real_time_available)
        },
        timeGems: {
          total: toNumber(row.time_gems_total),
          available: toNumber(row.time_gems_available)
        },
        upgradesPurchased: nextUpgradesPurchased,
        currentSeconds: toNumber(updated.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updated.shop),
        achievementBonusMultiplier: nextAchievementBonusMultiplier,
        hasUnseenAchievements: updated.has_unseen_achievements,
        idleSecondsRate: getIdleSecondsRate({ secondsSinceLastCollection: elapsedSinceLastCollection }),
        currentSecondsLastUpdated: updated.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updated.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updated.last_daily_reward_collected_at?.toISOString() ?? null,
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
