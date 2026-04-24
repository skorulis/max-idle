import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { getSecondsMultiplier } from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import { boostedUncollectedIdleSeconds } from "../boostedUncollectedIdle.js";
import { calculateElapsedSeconds } from "../time.js";
import { getEffectiveIdleSecondsRate, shouldPreserveIdleTimerOnCollect } from "../idleRate.js";
import { normalizeCompletedAchievementIds, updateCompletedAchievements } from "../achievementUpdates.js";
import type { AuthClaims } from "../types.js";

const REAL_TIME_COLLECT_65_MINUTES_SECONDS = 65 * 60;
const IDLE_TIME_COLLECT_3H_7M_SECONDS = 3 * 60 * 60 + 7 * 60;
const REAL_TIME_STREAK_59_MINUTES_SECONDS = 59 * 60;
const REAL_TIME_STREAK_2D_14H_SECONDS = (2 * 24 + 14) * 60 * 60;

function getUtcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function canCollectDailyReward(lastCollectedAt: Date | null, now: Date): boolean {
  if (!lastCollectedAt) {
    return true;
  }
  return lastCollectedAt.getTime() < getUtcDayStartMs(now);
}

type RegisterPlayerRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
  getAchievementBonusMultiplier: (achievementCount: number) => number;
};

export function registerPlayerRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  getAchievementBonusMultiplier
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

      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const currentIdleSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        row.server_time,
        row.shop,
        achievementBonusMultiplier
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
        achievementBonusMultiplier
      });

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
        achievementBonusMultiplier,
        hasUnseenAchievements: row.has_unseen_achievements,
        currentSecondsLastUpdated: row.server_time.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
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
        upgrades_purchased: number | string;
        achievement_count: number | string;
        completed_achievements: unknown;
        has_unseen_achievements: boolean;
        shop: ShopState;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        SELECT
          upgrades_purchased,
          achievement_count,
          completed_achievements,
          has_unseen_achievements,
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at
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
      const collectionAchievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(lockedRow.achievement_count));
      const collectedSeconds = boostedUncollectedIdleSeconds(
        lockedRow.last_collected_at,
        collectedAt,
        lockedRow.shop,
        collectionAchievementBonusMultiplier
      );
      const realSecondsCollected = calculateElapsedSeconds(lockedRow.last_collected_at, collectedAt);
      const preserveTimer = shouldPreserveIdleTimerOnCollect(lockedRow.shop);
      const nextCurrentSeconds = preserveTimer ? collectedSeconds : 0;
      const nextLastCollectedAt = preserveTimer ? lockedRow.last_collected_at : collectedAt;
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
        [userId, collectedSeconds, realSecondsCollected, nextCurrentSeconds, collectedAt, nextLastCollectedAt]
      );

      const row = updateResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const completedAchievementIds = normalizeCompletedAchievementIds(lockedRow.completed_achievements);
      if (
        toNumber(row.real_time_total) >= REAL_TIME_COLLECT_65_MINUTES_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES);
      }
      if (
        toNumber(row.idle_time_total) >= IDLE_TIME_COLLECT_3H_7M_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_59_MINUTES_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_2D_14H_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H);
      }
      if (completedAchievementIds.length !== toNumber(lockedRow.achievement_count)) {
        await updateCompletedAchievements(client, userId, completedAchievementIds);
      }
      const hasUnseenAchievements =
        lockedRow.has_unseen_achievements || completedAchievementIds.length !== toNumber(lockedRow.achievement_count);

      const achievementBonusMultiplier = getAchievementBonusMultiplier(completedAchievementIds.length);
      const elapsedSinceLastCollectionAfterCollect = calculateElapsedSeconds(nextLastCollectedAt, collectedAt);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollectionAfterCollect,
        shop: row.shop,
        achievementBonusMultiplier
      });
      await client.query("COMMIT");
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
        achievementBonusMultiplier,
        hasUnseenAchievements,
        idleSecondsRate,
        currentSecondsLastUpdated: row.current_seconds_last_updated.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
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
        has_unseen_achievements: boolean;
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
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at
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
      }>(
        `
        UPDATE player_states
        SET
          time_gems_total = time_gems_total + 1,
          time_gems_available = time_gems_available + 1,
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
          last_daily_reward_collected_at
        `,
        [userId, now]
      );
      const updatedPlayer = updateResult.rows[0];
      if (!updatedPlayer) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updatedPlayer.last_collected_at, now);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(updatedPlayer.achievement_count));
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updatedPlayer.shop,
        achievementBonusMultiplier
      });
      await client.query("COMMIT");

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
        achievementBonusMultiplier,
        hasUnseenAchievements: updatedPlayer.has_unseen_achievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updatedPlayer.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updatedPlayer.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updatedPlayer.last_daily_reward_collected_at?.toISOString() ?? null,
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
