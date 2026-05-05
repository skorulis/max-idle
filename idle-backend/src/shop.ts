import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS, GEM_HOARDER_MIN_AVAILABLE_GEMS } from "@maxidle/shared/achievements";
import type { AchievementId } from "@maxidle/shared/achievements";
import {
  getPurchasedShopUpgradeLevelCount,
  getShopCurrencyTierPurchaseCostSum,
  getShopPurchaseRefundTotals,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier,
  hasRefundableIdleShopPurchases,
  hasRefundableRealShopPurchases,
  withIdleCurrencyShopUpgradesReset,
  withRealCurrencyShopUpgradesReset,
  withShopUpgradeLevel,
} from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import {
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  REALTIME_WAIT_EXTENSION_SECONDS,
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  ShopUpgradeDefinition,
  getShopUpgradeDefinition,
} from "@maxidle/shared/shopUpgrades";
import { getPlayerLevelUpgradeCostFromLevel } from "@maxidle/shared/playerLevelCosts";
import { safeNaturalNumber } from "@maxidle/shared/safeNumber";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import {
  getAchievementLevelForValue,
  isAchievementMaxed,
  mergeAchievementLevels,
  normalizeAchievementLevels,
  sumAchievementLevels,
  updatePlayerAchievementLevels
} from "./achievementUpdates.js";
import { calculateElapsedSeconds } from "./time.js";
import { getEffectiveIdleSecondsRate } from "./idleRate.js";
import type { AuthClaims } from "./types.js";
import type { AnalyticsService } from "./analytics.js";
import { getOrCreateCurrentDailyBonus, toDailyBonusResponse } from "./routes/dailyBonus.js";
import { parseObligationsCompleted } from "./obligationsState.js";
import { getPlayerCollectionCount } from "./playerCollectionCount.js";

export {
  getDefaultShopState,
  getLuckEnabled,
  getShopPurchaseRefundTotals,
  hasRefundableShopPurchases,
  getSecondsMultiplier,
  multiplierToLevel,
  withShopUpgradeLevel
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
  analytics: AnalyticsService;
};

function wouldExceedUpgradeMaxLevel(upgrade: ShopUpgradeDefinition, shop: ShopState, quantity: number): boolean {
  const safeQuantity = safeNaturalNumber(quantity)
  return upgrade.currentLevel(shop) + safeQuantity > upgrade.maxLevel();
}

function getUpgradePurchaseCost(
  upgrade: ShopUpgradeDefinition,
  shop: ShopState,
  currentLevel: number,
  quantity: number
): number {
  const safeQuantity = safeNaturalNumber(quantity);
  if (upgrade.currencyType === SHOP_CURRENCY_TYPES.GEM) {
    let totalCost = 0;
    for (let i = 0; i < safeQuantity; i += 1) {
      totalCost += upgrade.costAtLevel(currentLevel + i);
    }
    return totalCost;
  }
  const currency = upgrade.currencyType;
  const globalStart = getPurchasedShopUpgradeLevelCount(shop, currency);
  return getShopCurrencyTierPurchaseCostSum(currency, globalStart, safeQuantity);
}

export function registerShopRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  isProduction,
  analytics
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
        achievement_levels: unknown;
        upgrades_purchased: number;
        shop: ShopState;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        tutorial_progress: string;
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
          achievement_levels,
          shop,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          last_daily_reward_collected_at,
          tutorial_progress
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
      const isIdleRefund = upgradeType === SHOP_UPGRADE_IDS.IDLE_REFUND;
      const isRealRefund = upgradeType === SHOP_UPGRADE_IDS.REAL_REFUND;
      const isPurchaseRefund = isIdleRefund || isRealRefund;
      const isGemPurchase = boundedUpgrade.currencyType === SHOP_CURRENCY_TYPES.GEM;
      const isMaxLevelBoundedUpgrade = !isExtraRealtimeWait && !isPurchaseRefund;
      const collectGemLevel = COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentLevel(row.shop);
      const quantity = isGemPurchase
        ? 1
        : upgradeType === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER
          ? requestedQuantity
          : 1;

      const currentLevel = boundedUpgrade.currentLevel(row.shop);
      if (isIdleRefund && !hasRefundableIdleShopPurchases(row.shop)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No idle time purchases to refund", code: "NO_REFUNDABLE_PURCHASES" });
        return;
      }
      if (isRealRefund && !hasRefundableRealShopPurchases(row.shop)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No real time purchases to refund", code: "NO_REFUNDABLE_PURCHASES" });
        return;
      }
      
      if (isMaxLevelBoundedUpgrade && wouldExceedUpgradeMaxLevel(boundedUpgrade, row.shop, quantity)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upgrade already maxed", code: "ALREADY_OWNED" });
        return;
      }
      const totalCost = getUpgradePurchaseCost(boundedUpgrade, row.shop, currentLevel, quantity);
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

      const refundTotalsFull = getShopPurchaseRefundTotals(row.shop);
      const refundTotals = isIdleRefund
        ? { idle: refundTotalsFull.idle, real: 0 }
        : isRealRefund
          ? { idle: 0, real: refundTotalsFull.real }
          : { idle: 0, real: 0 };
      const shouldRecordLastPurchase = boundedUpgrade.currencyType !== SHOP_CURRENCY_TYPES.GEM;
      const nextShopStateBase = isExtraRealtimeWait
        ? row.shop
        : isCollectGemTimeBoost
          ? withShopUpgradeLevel(row.shop, SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST, collectGemLevel + quantity)
          : isIdleRefund
            ? withIdleCurrencyShopUpgradesReset(row.shop)
            : isRealRefund
              ? withRealCurrencyShopUpgradesReset(row.shop)
              : withShopUpgradeLevel(row.shop, boundedUpgrade.id, currentLevel + quantity);
      const nextShopState = shouldRecordLastPurchase
        ? { ...nextShopStateBase, last_purchase: Math.floor(now.getTime() / 1000) }
        : nextShopStateBase;
      const nextLastCollectedAt = isExtraRealtimeWait
        ? new Date(row.last_collected_at.getTime() - REALTIME_WAIT_EXTENSION_SECONDS * 1000)
        : row.last_collected_at;
      const nextUpgradesPurchased = toNumber(row.upgrades_purchased) + quantity;
      const beginnerShopperLevel = getAchievementLevelForValue(
        ACHIEVEMENT_IDS.BEGINNER_SHOPPER,
        nextUpgradesPurchased
      );
      const nextAchievementLevels =
        beginnerShopperLevel > 0
          ? mergeAchievementLevels(
              row.achievement_levels,
              new Map([[ACHIEVEMENT_IDS.BEGINNER_SHOPPER, beginnerShopperLevel]]),
              now
            )
          : normalizeAchievementLevels(row.achievement_levels, now);
      const nextAchievementCount = sumAchievementLevels(nextAchievementLevels);
      const hasNewAchievement = nextAchievementCount > toNumber(row.achievement_count);
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
        last_daily_bonus_claimed_at: Date | null;
        tutorial_progress: string;
        obligations_completed: unknown;
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
          achievement_levels = $9::jsonb,
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
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at,
          tutorial_progress,
          obligations_completed
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
          JSON.stringify(nextAchievementLevels),
          nextAchievementCount,
          hasNewAchievement,
          nextRealTimeAvailable
        ]
      );
      const updated = updateResult.rows[0];

      if (!updated) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const shopCollectionCount = await getPlayerCollectionCount(client, userId);
      await client.query("COMMIT");

      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementCount: nextAchievementCount,
        realTimeAvailable: toNumber(updated.real_time_available),
        wallClockMs: now.getTime()
      });
      analytics.trackShopPurchase(
        { userId, isAnonymous: identity.claims.isAnonymous },
        {
          upgrade_type: upgradeType,
          quantity,
          total_cost: totalCost
        }
      );
      const currentDailyBonusAfterPurchase = await getOrCreateCurrentDailyBonus(client, now);
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
        dailyBonus: toDailyBonusResponse(currentDailyBonusAfterPurchase, updated.last_daily_bonus_claimed_at),
        serverTime: now.toISOString(),
        tutorialProgress: updated.tutorial_progress ?? "",
        obligationsCompleted: parseObligationsCompleted(updated.obligations_completed),
        collectionCount: shopCollectionCount,
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

  app.post("/shop/upgradeLevel", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;

      await client.query("BEGIN");
      const rowResult = await client.query<{
        level: string;
        idle_time_total: string;
        idle_time_available: string;
        real_time_total: string;
        real_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        achievement_count: string;
        has_unseen_achievements: boolean;
        achievement_levels: unknown;
        upgrades_purchased: number;
        shop: ShopState;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        tutorial_progress: string;
      }>(
        `
        SELECT
          level,
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          achievement_count,
          has_unseen_achievements,
          achievement_levels,
          shop,
          current_seconds,
          current_seconds_last_updated,
          last_collected_at,
          last_daily_reward_collected_at,
          tutorial_progress
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

      const currentLevel = Math.floor(toNumber(row.level));
      const cost = getPlayerLevelUpgradeCostFromLevel(currentLevel);
      if (!cost) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Player level is already maxed", code: "MAX_LEVEL" });
        return;
      }

      const idleTimeAvailable = toNumber(row.idle_time_available);
      const realTimeAvailable = toNumber(row.real_time_available);
      if (idleTimeAvailable < cost.idleSeconds || realTimeAvailable < cost.realSeconds) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough funds",
          code: "INSUFFICIENT_FUNDS"
        });
        return;
      }

      const now = new Date();
      const achievementCount = toNumber(row.achievement_count);
      const nextIdleTimeAvailable = idleTimeAvailable - cost.idleSeconds;
      const nextRealTimeAvailable = realTimeAvailable - cost.realSeconds;
      const syncedCurrentSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        now,
        row.shop,
        achievementCount,
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
        last_daily_bonus_claimed_at: Date | null;
        tutorial_progress: string;
        obligations_completed: unknown;
        level: string;
      }>(
        `
        UPDATE player_states
        SET
          level = $2,
          idle_time_available = $3,
          real_time_available = $4,
          current_seconds = $5,
          current_seconds_last_updated = $6
        WHERE user_id = $1
        RETURNING
          level,
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
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at,
          tutorial_progress,
          obligations_completed
        `,
        [userId, currentLevel + 1, nextIdleTimeAvailable, nextRealTimeAvailable, syncedCurrentSeconds, now]
      );

      const updated = updateResult.rows[0];
      if (!updated) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const shopCollectionCount = await getPlayerCollectionCount(client, userId);
      await client.query("COMMIT");

      const nextAchievementCount = achievementCount;
      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementCount: nextAchievementCount,
        realTimeAvailable: toNumber(updated.real_time_available),
        wallClockMs: now.getTime()
      });
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(updated.shop, nextAchievementCount);
      const currentDailyBonusAfter = await getOrCreateCurrentDailyBonus(client, now);

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
        level: toNumber(updated.level),
        currentSeconds: toNumber(updated.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updated.shop),
        shop: updated.shop,
        achievementCount: nextAchievementCount,
        achievementBonusMultiplier,
        hasUnseenAchievements: updated.has_unseen_achievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updated.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updated.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updated.last_daily_reward_collected_at?.toISOString() ?? null,
        dailyBonus: toDailyBonusResponse(currentDailyBonusAfter, updated.last_daily_bonus_claimed_at),
        serverTime: now.toISOString(),
        tutorialProgress: updated.tutorial_progress ?? "",
        obligationsCompleted: parseObligationsCompleted(updated.obligations_completed),
        collectionCount: shopCollectionCount,
        levelUpgrade: {
          previousLevel: currentLevel,
          newLevel: toNumber(updated.level),
          idleSecondsCost: cost.idleSeconds,
          realSecondsCost: cost.realSeconds
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
        achievement_levels: unknown;
        has_unseen_achievements: boolean;
        shop: ShopState;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        tutorial_progress: string;
        obligations_completed: unknown;
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
          achievement_levels,
          has_unseen_achievements,
          shop,
          last_collected_at,
          last_daily_reward_collected_at,
          tutorial_progress,
          obligations_completed
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
        tutorial_progress: string;
        obligations_completed: unknown;
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
          last_daily_reward_collected_at,
          tutorial_progress,
          obligations_completed
        `,
        [userId, syncedCurrentSeconds, now]
      );
      const updated = updateResult.rows[0];
      if (!updated) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const debugShopCollectionCount = await getPlayerCollectionCount(client, userId);

      const achievementLevels = normalizeAchievementLevels(row.achievement_levels, now);
      const currentLevelById = new Map(achievementLevels.map((entry) => [entry.id, entry.level] as const));
      const idsToGrant: string[] = [];
      if (
        toNumber(updated.time_gems_available) >= GEM_HOARDER_MIN_AVAILABLE_GEMS &&
        !isAchievementMaxed(currentLevelById.get(ACHIEVEMENT_IDS.GEM_HOARDER) ?? 0, ACHIEVEMENT_IDS.GEM_HOARDER)
      ) {
        idsToGrant.push(ACHIEVEMENT_IDS.GEM_HOARDER);
      }
      let achievementCountAfter = toNumber(row.achievement_count);
      let hasUnseenAchievements = updated.has_unseen_achievements;
      if (idsToGrant.length > 0) {
        const nextAchievementLevels = mergeAchievementLevels(
          row.achievement_levels,
          new Map<AchievementId, number>(idsToGrant.map((id) => [id as AchievementId, 1])),
          now
        );
        await updatePlayerAchievementLevels(client, userId, nextAchievementLevels);
        achievementCountAfter = sumAchievementLevels(nextAchievementLevels);
        hasUnseenAchievements =
          row.has_unseen_achievements || achievementCountAfter !== toNumber(row.achievement_count);
      }

      await client.query("COMMIT");

      const elapsedSinceLastCollection = calculateElapsedSeconds(updated.last_collected_at, now);
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(updated.shop, achievementCountAfter);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updated.shop,
        achievementCount: achievementCountAfter,
        realTimeAvailable: toNumber(updated.real_time_available),
        wallClockMs: now.getTime()
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
        achievementCount: achievementCountAfter,
        achievementBonusMultiplier,
        hasUnseenAchievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updated.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updated.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updated.last_daily_reward_collected_at?.toISOString() ?? null,
        serverTime: now.toISOString(),
        tutorialProgress: updated.tutorial_progress ?? "",
        obligationsCompleted: parseObligationsCompleted(updated.obligations_completed),
        collectionCount: debugShopCollectionCount
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });
}
