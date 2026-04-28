import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import {
  getDefaultShopState,
  getShopPurchaseRefundTotals,
  hasRefundableShopPurchases,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier,
  withCollectGemBoostLevel,
  withIdleHoarderLevel,
  withLuckLevel,
  withRestraintLevel,
  withSecondsMultiplier,
  withWorthwhileAchievementsLevel
} from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import {
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  IDLE_HOARDER_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  getShopUpgradeDefinition,
  REALTIME_WAIT_EXTENSION_SECONDS,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS
} from "@maxidle/shared/shopUpgrades";
import type { ShopUpgradeDefinition } from "@maxidle/shared/shopUpgrades";
import { safeNaturalNumber } from "@maxidle/shared/safeNumber";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { normalizeCompletedAchievementIds } from "./achievementUpdates.js";
import { calculateElapsedSeconds } from "./time.js";
import { getEffectiveIdleSecondsRate } from "./idleRate.js";
import type { AuthClaims } from "./types.js";

export {
  getDefaultShopState,
  getLuckEnabled,
  getShopPurchaseRefundTotals,
  hasRefundableShopPurchases,
  getSecondsMultiplier,
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
  isProduction: boolean;
};

function wouldExceedUpgradeMaxLevel(upgrade: ShopUpgradeDefinition, shop: ShopState, quantity: number): boolean {
  const safeQuantity = safeNaturalNumber(quantity)
  return upgrade.currentLevel(shop) + safeQuantity > upgrade.maxLevel();
}

function getUpgradePurchaseCost(upgrade: ShopUpgradeDefinition, currentLevel: number, quantity: number): number {
  const safeQuantity = safeNaturalNumber(quantity)
  let totalCost = 0;
  for (let i = 0; i < safeQuantity; i += 1) {
    totalCost += upgrade.costAtLevel(currentLevel + i);
  }
  return totalCost;
}

export function registerShopRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  isProduction
}: RegisterShopRoutesOptions): void {
  app.post("/shop/purchase", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);

      const upgradeType = String(req.body?.upgradeType ?? "");
      const requestedQuantity = Number(req.body?.quantity);
      const boundedUpgrade = getShopUpgradeDefinition(upgradeType);
      if (!boundedUpgrade) {
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
      const isIdleHoarder = upgradeType === SHOP_UPGRADE_IDS.IDLE_HOARDER;
      const isWorthwhileAchievements = upgradeType === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS;
      const worthwhileAchievementsLevel = WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.currentLevel(row.shop);
      const isGemPurchase = boundedUpgrade.currencyType === SHOP_CURRENCY_TYPES.GEM;
      const isMaxLevelBoundedUpgrade = !isExtraRealtimeWait && !isPurchaseRefund;
      const collectGemLevel = COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentLevel(row.shop);
      const quantity = isGemPurchase
        ? 1
        : upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
          ? requestedQuantity
          : 1;
      const restraintLevel = RESTRAINT_SHOP_UPGRADE.currentLevel(row.shop);
      const idleHoarderLevel = IDLE_HOARDER_SHOP_UPGRADE.currentLevel(row.shop);
      const luckLevel = LUCK_SHOP_UPGRADE.currentLevel(row.shop);

      const currentLevel = SECONDS_MULTIPLIER_SHOP_UPGRADE.currentLevel(row.shop);
      if (isPurchaseRefund && !hasRefundableShopPurchases(row.shop)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No idle or real purchases to refund", code: "NO_REFUNDABLE_PURCHASES" });
        return;
      }
      
      if (isMaxLevelBoundedUpgrade && wouldExceedUpgradeMaxLevel(boundedUpgrade, row.shop, quantity)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upgrade already maxed", code: "ALREADY_OWNED" });
        return;
      }
      const totalCost = getUpgradePurchaseCost(boundedUpgrade, boundedUpgrade.currentLevel(row.shop), quantity);
      const idleTimeAvailable = toNumber(row.idle_time_available);
      const realTimeAvailable = toNumber(row.real_time_available);
      const timeGemsAvailable = toNumber(row.time_gems_available);
      const availableForUpgrade =
        boundedUpgrade.currencyType === "gem"
          ? timeGemsAvailable
          : boundedUpgrade.currencyType === "real"
            ? realTimeAvailable
            : idleTimeAvailable;
      if (availableForUpgrade < totalCost) {
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
              : isIdleHoarder
                ? withIdleHoarderLevel(row.shop, idleHoarderLevel + quantity)
                : isWorthwhileAchievements
                  ? withWorthwhileAchievementsLevel(row.shop, worthwhileAchievementsLevel + quantity)
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
      const nextAchievementBonusMultiplier = getWorthwhileAchievementsMultiplier(nextShopState, nextAchievementCount);
      const nextIdleTimeAvailable =
        boundedUpgrade.currencyType === SHOP_CURRENCY_TYPES.IDLE ? idleTimeAvailable - totalCost : idleTimeAvailable;
      const nextIdleTimeAvailableWithRefund = nextIdleTimeAvailable + refundTotals.idle;
      const nextRealTimeAvailable = boundedUpgrade.currencyType === SHOP_CURRENCY_TYPES.REAL
        ? realTimeAvailable - totalCost + refundTotals.real
        : realTimeAvailable + refundTotals.real;
      const nextTimeGemsAvailable =
        boundedUpgrade.currencyType === SHOP_CURRENCY_TYPES.GEM ? timeGemsAvailable - totalCost : timeGemsAvailable;
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(
        nextLastCollectedAt,
        now,
        nextShopState,
        nextAchievementCount,
        nextRealTimeAvailable
      );
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
        achievementCount: nextAchievementCount,
        realTimeAvailable: toNumber(updated.real_time_available)
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
        achievementCount: nextAchievementCount,
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
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        now,
        row.shop,
        toNumber(row.achievement_count),
        toNumber(row.real_time_available)
      );
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
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(
        updated.shop,
        toNumber(row.achievement_count)
      );
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementCount: toNumber(row.achievement_count),
        realTimeAvailable: toNumber(updated.real_time_available)
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
        achievementCount: toNumber(row.achievement_count),
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
