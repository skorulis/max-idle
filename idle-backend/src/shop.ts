import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import {
  getDefaultShopState,
  getLuckLevel,
  getLuckMaxLevel,
  getLuckUpgradeCostAtLevel,
  getShopPurchaseRefundTotals,
  hasRefundableShopPurchases,
  getRestraintLevel,
  getRestraintMaxLevel,
  getRestraintUpgradeCostAtLevel,
  getSecondsMultiplierLevel,
  getSecondsMultiplierMaxLevel,
  getSecondsMultiplier,
  getSecondsMultiplierPurchaseCost,
  getCollectGemBoostLevel,
  withCollectGemBoostLevel,
  withLuckLevel,
  withRestraintLevel,
  withSecondsMultiplier
} from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import {
  getCollectGemTimeBoostMaxLevel,
  getCollectGemTimeBoostUpgradeCostAtLevel,
  REALTIME_WAIT_EXTENSION_SECONDS,
  SHOP_UPGRADE_IDS
} from "@maxidle/shared/shopUpgrades";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { normalizeCompletedAchievementIds } from "./achievementUpdates.js";
import { calculateElapsedSeconds } from "./time.js";
import { getEffectiveIdleSecondsRate } from "./idleRate.js";
import type { AuthClaims } from "./types.js";

export {
  getDefaultShopState,
  getCollectGemBoostLevel,
  getLuckEnabled,
  getLuckUpgradeCost,
  getShopPurchaseRefundTotals,
  hasRefundableShopPurchases,
  getRestraintUpgradeCost,
  getSecondsMultiplier,
  getSecondsMultiplierPurchaseCost,
  getSecondsMultiplierUpgradeCost,
  levelToMultiplier,
  multiplierToLevel,
  withCollectGemBoostLevel,
  withLuck,
  withRestraint,
  withRestraintLevel,
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
  isProduction: boolean;
};

export function registerShopRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  getAchievementBonusMultiplier,
  isProduction
}: RegisterShopRoutesOptions): void {
  app.post("/shop/purchase", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);

      const upgradeType = String(req.body?.upgradeType ?? "");
      const requestedQuantity = Number(req.body?.quantity);
      if (
        upgradeType !== SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER &&
        upgradeType !== SHOP_UPGRADE_IDS.RESTRAINT &&
        upgradeType !== SHOP_UPGRADE_IDS.LUCK &&
        upgradeType !== SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT &&
        upgradeType !== SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST &&
        upgradeType !== SHOP_UPGRADE_IDS.PURCHASE_REFUND
      ) {
        res.status(400).json({ error: "Unsupported upgrade type" });
        return;
      }
      if (upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER && ![1, 5, 10].includes(requestedQuantity)) {
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
        shop: ShopState;
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
          upgrades_purchased,
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
      const isExtraRealtimeWait = upgradeType === SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT;
      const isCollectGemTimeBoost = upgradeType === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST;
      const isPurchaseRefund = upgradeType === SHOP_UPGRADE_IDS.PURCHASE_REFUND;
      const isGemPurchase = isExtraRealtimeWait || isCollectGemTimeBoost || isPurchaseRefund;
      const collectGemLevel = getCollectGemBoostLevel(row.shop);
      const quantity = isGemPurchase
        ? 1
        : upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
          ? requestedQuantity
          : 1;
      const restraintLevel = getRestraintLevel(row.shop);
      const luckLevel = getLuckLevel(row.shop);

      const currentLevel = getSecondsMultiplierLevel(row.shop);
      if (isPurchaseRefund && !hasRefundableShopPurchases(row.shop)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No idle or real purchases to refund", code: "NO_REFUNDABLE_PURCHASES" });
        return;
      }
      if (isCollectGemTimeBoost && collectGemLevel >= getCollectGemTimeBoostMaxLevel()) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upgrade already maxed", code: "ALREADY_OWNED" });
        return;
      }
      if (upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER && currentLevel + quantity > getSecondsMultiplierMaxLevel()) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid purchase quantity" });
        return;
      }
      if (upgradeType === SHOP_UPGRADE_IDS.RESTRAINT && restraintLevel + quantity > getRestraintMaxLevel()) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upgrade already maxed", code: "ALREADY_OWNED" });
        return;
      }
      if (upgradeType === SHOP_UPGRADE_IDS.LUCK && luckLevel + quantity > getLuckMaxLevel()) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upgrade already maxed", code: "ALREADY_OWNED" });
        return;
      }
      const totalCost = isExtraRealtimeWait
        ? 1
        : isCollectGemTimeBoost
          ? getCollectGemTimeBoostUpgradeCostAtLevel(collectGemLevel)
          : isPurchaseRefund
            ? 1
            : upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
            ? getSecondsMultiplierPurchaseCost(currentLevel, quantity)
            : upgradeType === SHOP_UPGRADE_IDS.RESTRAINT
              ? getRestraintUpgradeCostAtLevel(restraintLevel)
              : getLuckUpgradeCostAtLevel(luckLevel);
      const idleTimeAvailable = toNumber(row.idle_time_available);
      const realTimeAvailable = toNumber(row.real_time_available);
      const timeGemsAvailable = toNumber(row.time_gems_available);
      if (isGemPurchase) {
        if (timeGemsAvailable < totalCost) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error: "Not enough funds",
            code: "INSUFFICIENT_FUNDS"
          });
          return;
        }
      } else if (idleTimeAvailable < totalCost) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough funds",
          code: "INSUFFICIENT_FUNDS"
        });
        return;
      }

      const refundTotals = isPurchaseRefund ? getShopPurchaseRefundTotals(row.shop) : { idle: 0, real: 0 };
      const nextLevel = upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER ? currentLevel + quantity : currentLevel;
      const nextShopState = isExtraRealtimeWait
        ? row.shop
        : isCollectGemTimeBoost
          ? withCollectGemBoostLevel(row.shop, collectGemLevel + quantity)
          : isPurchaseRefund
            ? getDefaultShopState()
            : upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
            ? withSecondsMultiplier(row.shop, nextLevel)
            : upgradeType === SHOP_UPGRADE_IDS.RESTRAINT
              ? withRestraintLevel(row.shop, restraintLevel + quantity)
              : withLuckLevel(row.shop, luckLevel + quantity);
      const nextLastCollectedAt = isExtraRealtimeWait
        ? new Date(row.last_collected_at.getTime() - REALTIME_WAIT_EXTENSION_SECONDS * 1000)
        : row.last_collected_at;
      const nextUpgradesPurchased = toNumber(row.upgrades_purchased) + quantity;
      const nextCompletedAchievementIds =
        nextUpgradesPurchased >= 4
          ? normalizeCompletedAchievementIds(row.completed_achievements, [ACHIEVEMENT_IDS.BEGINNER_SHOPPER])
          : normalizeCompletedAchievementIds(row.completed_achievements);
      const hasNewAchievement = nextCompletedAchievementIds.length > toNumber(row.achievement_count);
      const nextAchievementCount = nextCompletedAchievementIds.length;
      const nextAchievementBonusMultiplier = getAchievementBonusMultiplier(nextAchievementCount);
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(
        nextLastCollectedAt,
        now,
        nextShopState,
        nextAchievementBonusMultiplier
      );
      const nextIdleTimeAvailable = isGemPurchase ? idleTimeAvailable : idleTimeAvailable - totalCost;
      const nextIdleTimeAvailableWithRefund = nextIdleTimeAvailable + refundTotals.idle;
      const nextRealTimeAvailable = realTimeAvailable + refundTotals.real;
      const nextTimeGemsAvailable = isGemPurchase ? timeGemsAvailable - totalCost : timeGemsAvailable;
      const updateResult = await client.query<{
        idle_time_total: string;
        idle_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        upgrades_purchased: string;
        real_time_total: string;
        real_time_available: string;
        has_unseen_achievements: boolean;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        shop: ShopState;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          idle_time_available = $2,
          time_gems_available = $3,
          last_collected_at = $4,
          current_seconds = $5,
          current_seconds_last_updated = $6,
          shop = $7::jsonb,
          upgrades_purchased = $8,
          completed_achievements = $9::jsonb,
          achievement_count = $10,
          has_unseen_achievements = has_unseen_achievements OR $11::boolean,
          real_time_available = $12
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          real_time_total,
          real_time_available,
          has_unseen_achievements,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          shop,
          last_daily_reward_collected_at
        `,
        [
          userId,
          nextIdleTimeAvailableWithRefund,
          nextTimeGemsAvailable,
          nextLastCollectedAt,
          syncedCurrentSeconds,
          now,
          JSON.stringify(nextShopState),
          nextUpgradesPurchased,
          JSON.stringify(nextCompletedAchievementIds),
          nextAchievementCount,
          hasNewAchievement,
          nextRealTimeAvailable
        ]
      );
      const updated = updateResult.rows[0];
      await client.query("COMMIT");

      if (!updated) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementBonusMultiplier: nextAchievementBonusMultiplier
      });
      res.json({
        idleTime: {
          total: toNumber(updated.idle_time_total),
          available: toNumber(updated.idle_time_available)
        },
        realTime: {
          total: toNumber(updated.real_time_total),
          available: toNumber(updated.real_time_available)
        },
        timeGems: {
          total: toNumber(updated.time_gems_total),
          available: toNumber(updated.time_gems_available)
        },
        upgradesPurchased: nextUpgradesPurchased,
        currentSeconds: toNumber(updated.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updated.shop),
        shop: updated.shop,
        achievementBonusMultiplier: nextAchievementBonusMultiplier,
        hasUnseenAchievements: updated.has_unseen_achievements,
        idleSecondsRate,
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

  if (isProduction) {
    return;
  }

  app.post("/shop/debug/add-gems", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);
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
        shop: ShopState;
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
          shop,
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
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(row.last_collected_at, now, row.shop, achievementBonusMultiplier);
      const updateResult = await client.query<{
        idle_time_total: string;
        idle_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        upgrades_purchased: string;
        real_time_total: string;
        real_time_available: string;
        has_unseen_achievements: boolean;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        shop: ShopState;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          time_gems_total = time_gems_total + 5,
          time_gems_available = time_gems_available + 5,
          current_seconds = $2,
          current_seconds_last_updated = $3
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          real_time_total,
          real_time_available,
          has_unseen_achievements,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          shop,
          last_daily_reward_collected_at
        `,
        [userId, syncedCurrentSeconds, now]
      );
      const updated = updateResult.rows[0];
      await client.query("COMMIT");

      if (!updated) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementBonusMultiplier
      });
      res.json({
        idleTime: {
          total: toNumber(updated.idle_time_total),
          available: toNumber(updated.idle_time_available)
        },
        realTime: {
          total: toNumber(updated.real_time_total),
          available: toNumber(updated.real_time_available)
        },
        timeGems: {
          total: toNumber(updated.time_gems_total),
          available: toNumber(updated.time_gems_available)
        },
        upgradesPurchased: toNumber(updated.upgrades_purchased),
        currentSeconds: toNumber(updated.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updated.shop),
        shop: updated.shop,
        achievementBonusMultiplier,
        hasUnseenAchievements: updated.has_unseen_achievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updated.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updated.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updated.last_daily_reward_collected_at?.toISOString() ?? null,
        serverTime: now.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });
}
