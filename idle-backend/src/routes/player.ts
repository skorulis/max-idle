import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS, GEM_HOARDER_MIN_AVAILABLE_GEMS } from "@maxidle/shared/achievements";
import { getSecondsMultiplier, getWorthwhileAchievementsMultiplier, withShopUpgradeLevel } from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import { SHOP_UPGRADE_IDS } from "@maxidle/shared/shopUpgrades";
import { boostedUncollectedIdleSeconds } from "../boostedUncollectedIdle.js";
import { calculateElapsedSeconds } from "../time.js";
import { getEffectiveIdleSecondsRate, isIdleCollectionBlockedByRestraint, shouldPreserveIdleTimerOnCollect } from "../idleRate.js";
import { normalizeCompletedAchievements, parseCompletedAchievementIds, updateCompletedAchievements } from "../achievementUpdates.js";
import type { AuthClaims } from "../types.js";
import type { AnalyticsService } from "../analytics.js";
import { canCollectDailyReward, getOrCreateCurrentDailyBonus, toDailyBonusResponse } from "./dailyBonus.js";

const REAL_TIME_COLLECT_65_MINUTES_SECONDS = 65 * 60;
const IDLE_TIME_COLLECT_3H_7M_SECONDS = 3 * 60 * 60 + 7 * 60;
const REAL_TIME_STREAK_59_MINUTES_SECONDS = 59 * 60;
const REAL_TIME_STREAK_2D_14H_SECONDS = (2 * 24 + 14) * 60 * 60;
const REWARD_SKIPPER_GAP_MS = 48 * 60 * 60 * 1000;

type RegisterPlayerRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
  analytics: AnalyticsService;
};

export function registerPlayerRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  analytics
}: RegisterPlayerRoutesOptions): void {
  app.get("/player", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;

      const userId = identity.claims.sub;
      const result = await pool.query<{
        idle_time_total: string;
        idle_time_available: string;
        real_time_total: string;
        real_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        upgrades_purchased: string;
        achievement_count: string;
        has_unseen_achievements: boolean;
        shop: ShopState;
        last_collected_at: Date;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
        server_time: Date;
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
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at,
          NOW() AS server_time
        FROM player_states
        WHERE user_id = $1
        `,
        [userId]
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const achievementCount = toNumber(row.achievement_count);
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(row.shop, achievementCount);
      const currentIdleSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        row.server_time,
        row.shop,
        achievementCount,
        toNumber(row.real_time_available)
      );
      await pool.query(
        `
        UPDATE player_states
        SET
          current_seconds = $2,
          current_seconds_last_updated = $3
        WHERE user_id = $1
        `,
        [userId, currentIdleSeconds, row.server_time]
      );
      const elapsedSinceLastCollection = calculateElapsedSeconds(row.last_collected_at, row.server_time);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: row.shop,
        achievementCount,
        realTimeAvailable: toNumber(row.real_time_available)
      });
      const dailyBonus = await getOrCreateCurrentDailyBonus(pool, row.server_time);

      res.json({
        idleTime: {
          total: toNumber(row.idle_time_total),
          available: toNumber(row.idle_time_available)
        },
        realTime: {
          total: toNumber(row.real_time_total),
          available: toNumber(row.real_time_available)
        },
        timeGems: {
          total: toNumber(row.time_gems_total),
          available: toNumber(row.time_gems_available)
        },
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: currentIdleSeconds,
        idleSecondsRate,
        secondsMultiplier: getSecondsMultiplier(row.shop),
        shop: row.shop,
        achievementCount,
        achievementBonusMultiplier,
        hasUnseenAchievements: row.has_unseen_achievements,
        currentSecondsLastUpdated: row.server_time.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
        dailyBonus: toDailyBonusResponse(dailyBonus, row.last_daily_bonus_claimed_at),
        serverTime: row.server_time.toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/collect", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      await client.query("BEGIN");
      const result = await client.query<{
        idle_time_available: number | string;
        real_time_available: number | string;
        upgrades_purchased: number | string;
        achievement_count: number | string;
        completed_achievements: unknown;
        has_unseen_achievements: boolean;
        shop: ShopState;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
      }>(
        `
        SELECT
          upgrades_purchased,
          idle_time_available,
          real_time_available,
          achievement_count,
          completed_achievements,
          has_unseen_achievements,
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );

      const lockedRow = result.rows[0];
      if (!lockedRow) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const collectedAt = new Date();
      const currentDailyBonus = await getOrCreateCurrentDailyBonus(client, collectedAt);
      const collectionAchievementCount = toNumber(lockedRow.achievement_count);
      const baseCollectedSeconds = boostedUncollectedIdleSeconds(
        lockedRow.last_collected_at,
        collectedAt,
        lockedRow.shop,
        collectionAchievementCount,
        toNumber(lockedRow.real_time_available)
      );
      const baseRealSecondsCollected = calculateElapsedSeconds(lockedRow.last_collected_at, collectedAt);
      const collectedSeconds =
        currentDailyBonus.bonus_type === "collect_idle_percent"
          ? Math.floor(baseCollectedSeconds * (1 + currentDailyBonus.bonus_value / 100))
          : baseCollectedSeconds;
      const realSecondsCollected =
        currentDailyBonus.bonus_type === "collect_real_percent"
          ? Math.floor(baseRealSecondsCollected * (1 + currentDailyBonus.bonus_value / 100))
          : baseRealSecondsCollected;
      if (isIdleCollectionBlockedByRestraint({ secondsSinceLastCollection: realSecondsCollected, shop: lockedRow.shop })) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Restraint blocks collection until at least 1 hour of realtime has passed",
          code: "RESTRAINT_BLOCKED"
        });
        return;
      }
      const preserveTimer = shouldPreserveIdleTimerOnCollect(lockedRow.shop);
      const nextCurrentSeconds = preserveTimer ? collectedSeconds : 0;
      const nextLastCollectedAt = preserveTimer ? lockedRow.last_collected_at : collectedAt;
      const nextShop = withShopUpgradeLevel(lockedRow.shop, SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST, 0);
      const updateResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: ShopState;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + $2::BIGINT,
          idle_time_available = idle_time_available + $2::BIGINT,
          real_time_total = real_time_total + $3::BIGINT,
          real_time_available = real_time_available + $3::BIGINT,
          current_seconds = $4::BIGINT,
          current_seconds_last_updated = $5,
          last_collected_at = $6,
          shop = $7::jsonb,
          updated_at = $5
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          shop,
          last_daily_reward_collected_at
        `,
        [userId, collectedSeconds, realSecondsCollected, nextCurrentSeconds, collectedAt, nextLastCollectedAt, JSON.stringify(nextShop)]
      );

      const row = updateResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      await client.query(
        `
        INSERT INTO player_collection_history (
          user_id,
          collection_date,
          real_time,
          idle_time
        )
        VALUES ($1, $2, $3::BIGINT, $4::BIGINT)
        `,
        [userId, collectedAt, realSecondsCollected, collectedSeconds]
      );
      const collectionCountResult = await client.query<{ collection_count: string | number }>(
        `
        SELECT COUNT(*) AS collection_count
        FROM player_collection_history
        WHERE user_id = $1
        `,
        [userId]
      );
      const collectionCount = toNumber(collectionCountResult.rows[0]?.collection_count ?? 0);

      const completedAchievements = normalizeCompletedAchievements(lockedRow.completed_achievements);
      const completedAchievementIds = new Set(parseCompletedAchievementIds(completedAchievements));
      const idsToGrant: string[] = [];
      if (
        toNumber(row.real_time_total) >= REAL_TIME_COLLECT_65_MINUTES_SECONDS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES);
        idsToGrant.push(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES);
      }
      if (
        toNumber(row.idle_time_total) >= IDLE_TIME_COLLECT_3H_7M_SECONDS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M);
        idsToGrant.push(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_59_MINUTES_SECONDS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES);
        idsToGrant.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_2D_14H_SECONDS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H);
        idsToGrant.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H);
      }
      if (
        collectionCount >= 15 &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.COLLECTION_COUNT_15)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.COLLECTION_COUNT_15);
        idsToGrant.push(ACHIEVEMENT_IDS.COLLECTION_COUNT_15);
      }
      const nextCompletedAchievements =
        idsToGrant.length > 0
          ? normalizeCompletedAchievements(completedAchievements, idsToGrant, collectedAt)
          : completedAchievements;
      if (nextCompletedAchievements.length !== toNumber(lockedRow.achievement_count)) {
        await updateCompletedAchievements(client, userId, nextCompletedAchievements);
      }
      const hasUnseenAchievements =
        lockedRow.has_unseen_achievements || nextCompletedAchievements.length !== toNumber(lockedRow.achievement_count);

      const achievementCountAfter = nextCompletedAchievements.length;
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(row.shop, achievementCountAfter);
      const elapsedSinceLastCollectionAfterCollect = calculateElapsedSeconds(nextLastCollectedAt, collectedAt);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollectionAfterCollect,
        shop: row.shop,
        achievementCount: achievementCountAfter,
        realTimeAvailable: toNumber(row.real_time_available)
      });
      await client.query("COMMIT");
      analytics.trackPlayerCollect(
        { userId, isAnonymous: identity.claims.isAnonymous },
        {
          collected_seconds: collectedSeconds,
          real_seconds_collected: realSecondsCollected
        }
      );
      res.json({
        collectedSeconds,
        realSecondsCollected,
        idleTime: {
          total: toNumber(row.idle_time_total),
          available: toNumber(row.idle_time_available)
        },
        realTime: {
          total: toNumber(row.real_time_total),
          available: toNumber(row.real_time_available)
        },
        timeGems: {
          total: toNumber(row.time_gems_total),
          available: toNumber(row.time_gems_available)
        },
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: toNumber(row.current_seconds),
        secondsMultiplier: getSecondsMultiplier(row.shop),
        shop: row.shop,
        achievementCount: achievementCountAfter,
        achievementBonusMultiplier,
        hasUnseenAchievements,
        idleSecondsRate,
        currentSecondsLastUpdated: row.current_seconds_last_updated.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
        dailyBonus: toDailyBonusResponse(currentDailyBonus, lockedRow.last_daily_bonus_claimed_at),
        serverTime: row.last_collected_at.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/player/daily-reward/collect", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      await client.query("BEGIN");
      const playerResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: ShopState;
        achievement_count: number | string;
        completed_achievements: unknown;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
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
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          completed_achievements,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
      const player = playerResult.rows[0];
      if (!player) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const now = new Date();
      const currentDailyBonus = await getOrCreateCurrentDailyBonus(client, now);
      if (!canCollectDailyReward(player.last_daily_reward_collected_at, now)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Daily reward already collected today",
          code: "DAILY_REWARD_NOT_AVAILABLE"
        });
        return;
      }

      const updateResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: ShopState;
        achievement_count: number | string;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          time_gems_total = time_gems_total + $3::BIGINT,
          time_gems_available = time_gems_available + $3::BIGINT,
          last_daily_reward_collected_at = $2,
          updated_at = $2
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at
        `,
        [userId, now, currentDailyBonus.bonus_type === "double_gems_daily_reward" ? 2 : 1]
      );
      const updatedPlayer = updateResult.rows[0];
      if (!updatedPlayer) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const completedAchievements = normalizeCompletedAchievements(player.completed_achievements);
      const completedAchievementIds = new Set(parseCompletedAchievementIds(completedAchievements));
      const idsToGrant: string[] = [];
      const previousDailyRewardAt = player.last_daily_reward_collected_at;
      if (
        previousDailyRewardAt !== null &&
        now.getTime() - previousDailyRewardAt.getTime() > REWARD_SKIPPER_GAP_MS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.REWARD_SKIPPER)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.REWARD_SKIPPER);
        idsToGrant.push(ACHIEVEMENT_IDS.REWARD_SKIPPER);
      }
      const gemsAvailableAfterReward = toNumber(updatedPlayer.time_gems_available);
      if (
        gemsAvailableAfterReward >= GEM_HOARDER_MIN_AVAILABLE_GEMS &&
        !completedAchievementIds.has(ACHIEVEMENT_IDS.GEM_HOARDER)
      ) {
        completedAchievementIds.add(ACHIEVEMENT_IDS.GEM_HOARDER);
        idsToGrant.push(ACHIEVEMENT_IDS.GEM_HOARDER);
      }
      const nextCompletedAchievements =
        idsToGrant.length > 0
          ? normalizeCompletedAchievements(completedAchievements, idsToGrant, now)
          : completedAchievements;
      if (nextCompletedAchievements.length !== toNumber(player.achievement_count)) {
        await updateCompletedAchievements(client, userId, nextCompletedAchievements);
      }
      const hasUnseenAchievements =
        player.has_unseen_achievements ||
        nextCompletedAchievements.length !== toNumber(player.achievement_count);

      const elapsedSinceLastCollection = calculateElapsedSeconds(updatedPlayer.last_collected_at, now);
      const achievementCountAfter = nextCompletedAchievements.length;
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(updatedPlayer.shop, achievementCountAfter);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updatedPlayer.shop,
        achievementCount: achievementCountAfter,
        realTimeAvailable: toNumber(updatedPlayer.real_time_available)
      });
      await client.query("COMMIT");
      const rewardMultiplier = currentDailyBonus.bonus_type === "double_gems_daily_reward" ? 2 : 1;
      analytics.trackDailyRewardCollect(
        { userId, isAnonymous: identity.claims.isAnonymous },
        {
          reward_multiplier: rewardMultiplier,
          awarded_gems: rewardMultiplier
        }
      );

      res.json({
        idleTime: {
          total: toNumber(updatedPlayer.idle_time_total),
          available: toNumber(updatedPlayer.idle_time_available)
        },
        realTime: {
          total: toNumber(updatedPlayer.real_time_total),
          available: toNumber(updatedPlayer.real_time_available)
        },
        timeGems: {
          total: toNumber(updatedPlayer.time_gems_total),
          available: toNumber(updatedPlayer.time_gems_available)
        },
        upgradesPurchased: toNumber(updatedPlayer.upgrades_purchased),
        currentSeconds: toNumber(updatedPlayer.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updatedPlayer.shop),
        shop: updatedPlayer.shop,
        achievementCount: achievementCountAfter,
        achievementBonusMultiplier,
        hasUnseenAchievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updatedPlayer.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updatedPlayer.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updatedPlayer.last_daily_reward_collected_at?.toISOString() ?? null,
        dailyBonus: toDailyBonusResponse(currentDailyBonus, updatedPlayer.last_daily_bonus_claimed_at),
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
