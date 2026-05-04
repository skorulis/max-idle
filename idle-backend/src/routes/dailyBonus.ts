import express from "express";
import type { Pool, PoolClient } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { DAILY_BONUS_ACTIVATION_IDLE_SECONDS } from "@maxidle/shared/dailyBonus";
import {
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier,
  isDailyBonusFeatureUnlocked
} from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import {
  getAchievementLevelForValue,
  mergeAchievementLevels,
  normalizeAchievementLevels,
  sumAchievementLevels
} from "../achievementUpdates.js";
import { getEffectiveIdleSecondsRate } from "../idleRate.js";
import { calculateElapsedSeconds } from "../time.js";
import type { AuthClaims } from "../types.js";
import type { AnalyticsService } from "../analytics.js";

/** Types that can be chosen by {@link rollDailyBonus} (excludes legacy types no longer rolled). */
const DAILY_BONUS_ROLL_TYPES = [
  "collect_idle_percent",
  "collect_real_percent",
  "free_time_gem",
  "free_real_time_hours",
  "free_idle_time_hours"
] as const;

/** All `bonus_type` values that may exist in `daily_bonuses` (including legacy / no longer rolled). */
const DAILY_BONUS_TYPES = [...DAILY_BONUS_ROLL_TYPES, "double_gems_daily_reward"] as const;

type DailyBonusType = (typeof DAILY_BONUS_TYPES)[number];

type DailyBonusRow = {
  bonus_date_utc: Date;
  bonus_type: DailyBonusType;
  bonus_value: number;
};

export type DailyBonusResponse = {
  type: DailyBonusType;
  value: number;
  date: string;
  /** True for all types: the daily bonus is activated via POST /player/daily-bonus/collect. */
  isCollectable: boolean;
  isClaimed: boolean;
  activationCostIdleSeconds: number;
};

export type DailyBonusHistoryItemResponse = {
  type: DailyBonusType;
  value: number;
  date: string;
};

type Queryable = Pool | PoolClient;

type RegisterDailyBonusRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
  isProduction: boolean;
  analytics: AnalyticsService;
};

function getUtcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function canCollectDailyReward(lastCollectedAt: Date | null, now: Date): boolean {
  if (!lastCollectedAt) {
    return true;
  }
  return lastCollectedAt.getTime() < getUtcDayStartMs(now);
}

function getCurrentUtcDayStart(date: Date): Date {
  return new Date(getUtcDayStartMs(date));
}

function getRandomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollDailyBonus(now: Date): DailyBonusRow {
  const type =
    DAILY_BONUS_ROLL_TYPES[getRandomIntInclusive(0, DAILY_BONUS_ROLL_TYPES.length - 1)];
  let value = 2;
  switch (type) {
    case "collect_idle_percent":
    case "collect_real_percent":
      value = getRandomIntInclusive(10, 25);
      break;
    case "free_time_gem":
      value = 1;
      break;
    case "free_real_time_hours":
      value = getRandomIntInclusive(2, 6);
      break;
    case "free_idle_time_hours":
      value = getRandomIntInclusive(16, 48);
      break;
  }
  return {
    bonus_date_utc: getCurrentUtcDayStart(now),
    bonus_type: type,
    bonus_value: value
  };
}

export async function getOrCreateCurrentDailyBonus(queryable: Queryable, now: Date): Promise<DailyBonusRow> {
  const currentUtcDayStart = getCurrentUtcDayStart(now);
  const existingBonusResult = await queryable.query<DailyBonusRow>(
    `
    SELECT bonus_date_utc, bonus_type, bonus_value
    FROM daily_bonuses
    WHERE bonus_date_utc = $1
    LIMIT 1
    `,
    [currentUtcDayStart]
  );
  const existingBonus = existingBonusResult.rows[0];
  if (existingBonus) {
    return existingBonus;
  }

  const rolledBonus = rollDailyBonus(now);
  const insertedBonusResult = await queryable.query<DailyBonusRow>(
    `
    INSERT INTO daily_bonuses (bonus_date_utc, bonus_type, bonus_value)
    VALUES ($1, $2, $3)
    ON CONFLICT (bonus_date_utc) DO NOTHING
    RETURNING bonus_date_utc, bonus_type, bonus_value
    `,
    [rolledBonus.bonus_date_utc, rolledBonus.bonus_type, rolledBonus.bonus_value]
  );
  const insertedBonus = insertedBonusResult.rows[0];
  if (insertedBonus) {
    return insertedBonus;
  }
  const afterConflictResult = await queryable.query<DailyBonusRow>(
    `
    SELECT bonus_date_utc, bonus_type, bonus_value
    FROM daily_bonuses
    WHERE bonus_date_utc = $1
    LIMIT 1
    `,
    [currentUtcDayStart]
  );
  return afterConflictResult.rows[0] ?? rolledBonus;
}

export function toDailyBonusResponse(
  bonus: DailyBonusRow,
  lastDailyBonusClaimedAt: Date | null
): DailyBonusResponse {
  return {
    type: bonus.bonus_type,
    value: bonus.bonus_value,
    date: bonus.bonus_date_utc.toISOString(),
    isCollectable: true,
    isClaimed: lastDailyBonusClaimedAt !== null && lastDailyBonusClaimedAt.getTime() >= bonus.bonus_date_utc.getTime(),
    activationCostIdleSeconds: DAILY_BONUS_ACTIVATION_IDLE_SECONDS
  };
}

function toDailyBonusHistoryItemResponse(bonus: DailyBonusRow): DailyBonusHistoryItemResponse {
  return {
    type: bonus.bonus_type,
    value: bonus.bonus_value,
    date: bonus.bonus_date_utc.toISOString()
  };
}

async function getDailyBonusHistory(queryable: Queryable, limit: number): Promise<DailyBonusRow[]> {
  const historyResult = await queryable.query<DailyBonusRow>(
    `
    SELECT bonus_date_utc, bonus_type, bonus_value
    FROM daily_bonuses
    ORDER BY bonus_date_utc DESC
    LIMIT $1
    `,
    [limit]
  );
  return historyResult.rows;
}

export function registerDailyBonusRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  isProduction,
  analytics
}: RegisterDailyBonusRoutesOptions): void {
  app.get("/player/daily-bonus/history", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      const shopResult = await pool.query<{ shop: ShopState }>(
        `
        SELECT shop
        FROM player_states
        WHERE user_id = $1
        `,
        [userId]
      );
      const shopRow = shopResult.rows[0];
      if (!shopRow || !isDailyBonusFeatureUnlocked(shopRow.shop)) {
        res.status(403).json({
          error: "Daily bonus feature is not unlocked",
          code: "DAILY_BONUS_FEATURE_LOCKED"
        });
        return;
      }
      const history = await getDailyBonusHistory(pool, 30);
      res.json({
        history: history.map(toDailyBonusHistoryItemResponse)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/daily-bonus/collect", async (req, res, next) => {
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
        achievement_levels: unknown;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
        daily_bonuses_collected_count: number | string;
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
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          achievement_levels,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at,
          daily_bonuses_collected_count,
          tutorial_progress
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

      if (!isDailyBonusFeatureUnlocked(player.shop)) {
        await client.query("ROLLBACK");
        res.status(403).json({
          error: "Daily bonus feature is not unlocked",
          code: "DAILY_BONUS_FEATURE_LOCKED"
        });
        return;
      }

      const now = new Date();
      const currentDailyBonus = await getOrCreateCurrentDailyBonus(client, now);
      if (player.last_daily_bonus_claimed_at && player.last_daily_bonus_claimed_at.getTime() >= currentDailyBonus.bonus_date_utc.getTime()) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Daily bonus already claimed today",
          code: "DAILY_BONUS_ALREADY_CLAIMED"
        });
        return;
      }

      const activationCost = DAILY_BONUS_ACTIVATION_IDLE_SECONDS;
      if (toNumber(player.idle_time_available) < activationCost) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough idle time to activate today's daily bonus",
          code: "DAILY_BONUS_INSUFFICIENT_IDLE"
        });
        return;
      }

      const bonusSeconds = currentDailyBonus.bonus_value * 60 * 60;
      const nextDailyBonusesCollected = toNumber(player.daily_bonuses_collected_count) + 1;
      const dailyBonusCollectorLevel = getAchievementLevelForValue(
        ACHIEVEMENT_IDS.DAILY_BONUS_COLLECTOR,
        nextDailyBonusesCollected
      );
      const nextAchievementLevels =
        dailyBonusCollectorLevel > 0
          ? mergeAchievementLevels(
              player.achievement_levels,
              new Map([[ACHIEVEMENT_IDS.DAILY_BONUS_COLLECTOR, dailyBonusCollectorLevel]]),
              now
            )
          : normalizeAchievementLevels(player.achievement_levels, now);
      const nextAchievementCount = sumAchievementLevels(nextAchievementLevels);
      const hasNewAchievement = nextAchievementCount > toNumber(player.achievement_count);

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
        tutorial_progress: string;
      }>(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + CASE WHEN $3 = 'free_idle_time_hours' THEN $5::BIGINT ELSE 0 END,
          idle_time_available = idle_time_available - $4::BIGINT
            + CASE WHEN $3 = 'free_idle_time_hours' THEN $5::BIGINT ELSE 0 END,
          real_time_total = real_time_total + CASE WHEN $3 = 'free_real_time_hours' THEN $5::BIGINT ELSE 0 END,
          real_time_available = real_time_available + CASE WHEN $3 = 'free_real_time_hours' THEN $5::BIGINT ELSE 0 END,
          time_gems_total = time_gems_total + CASE WHEN $3 = 'free_time_gem' THEN $6::BIGINT ELSE 0 END,
          time_gems_available = time_gems_available + CASE WHEN $3 = 'free_time_gem' THEN $6::BIGINT ELSE 0 END,
          last_daily_bonus_claimed_at = $2,
          last_daily_bonus_claimed_type = $3,
          daily_bonuses_collected_count = daily_bonuses_collected_count + 1,
          achievement_levels = $7::jsonb,
          achievement_count = $8,
          has_unseen_achievements = has_unseen_achievements OR $9::boolean,
          updated_at = $2
        WHERE user_id = $1
          AND idle_time_available >= $4::BIGINT
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
          last_daily_bonus_claimed_at,
          tutorial_progress
        `,
        [
          userId,
          now,
          currentDailyBonus.bonus_type,
          activationCost,
          bonusSeconds,
          currentDailyBonus.bonus_value,
          JSON.stringify(nextAchievementLevels),
          nextAchievementCount,
          hasNewAchievement
        ]
      );
      const updatedPlayer = updateResult.rows[0];
      if (!updatedPlayer) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Not enough idle time to activate today's daily bonus",
          code: "DAILY_BONUS_INSUFFICIENT_IDLE"
        });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updatedPlayer.last_collected_at, now);
      const achievementCount = toNumber(updatedPlayer.achievement_count);
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(updatedPlayer.shop, achievementCount);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updatedPlayer.shop,
        achievementCount,
        realTimeAvailable: toNumber(updatedPlayer.real_time_available),
        wallClockMs: now.getTime()
      });
      await client.query("COMMIT");
      const awardedSeconds =
        currentDailyBonus.bonus_type === "free_real_time_hours" || currentDailyBonus.bonus_type === "free_idle_time_hours"
          ? bonusSeconds
          : 0;
      analytics.trackDailyBonusCollect(
        { userId, isAnonymous: identity.claims.isAnonymous },
        {
          bonus_type: currentDailyBonus.bonus_type,
          bonus_value: currentDailyBonus.bonus_value,
          awarded_seconds: awardedSeconds,
          activation_idle_seconds: activationCost
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
        achievementCount,
        achievementBonusMultiplier,
        hasUnseenAchievements: updatedPlayer.has_unseen_achievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updatedPlayer.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updatedPlayer.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updatedPlayer.last_daily_reward_collected_at?.toISOString() ?? null,
        dailyBonus: toDailyBonusResponse(currentDailyBonus, updatedPlayer.last_daily_bonus_claimed_at),
        serverTime: now.toISOString(),
        tutorialProgress: updatedPlayer.tutorial_progress ?? ""
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

  app.post("/player/daily-bonus/debug/reset-current", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      const now = new Date();
      const currentUtcDayStart = getCurrentUtcDayStart(now);
      await client.query("BEGIN");
      const deletedResult = await client.query<{ bonus_date_utc: Date; bonus_type: DailyBonusType; bonus_value: number }>(
        `
        DELETE FROM daily_bonuses
        WHERE bonus_date_utc = $1
        RETURNING bonus_date_utc, bonus_type, bonus_value
        `,
        [currentUtcDayStart]
      );

      // Also clear caller's claim marker so this route can immediately re-test collection behavior today.
      await client.query(
        `
        UPDATE player_states
        SET
          last_daily_bonus_claimed_at = NULL,
          last_daily_bonus_claimed_type = NULL
        WHERE user_id = $1
        `,
        [userId]
      );
      await client.query("COMMIT");

      res.json({
        ok: true,
        resetDateUtc: currentUtcDayStart.toISOString(),
        removedBonus:
          deletedResult.rows[0] === undefined
            ? null
            : {
                type: deletedResult.rows[0].bonus_type,
                value: deletedResult.rows[0].bonus_value,
                date: deletedResult.rows[0].bonus_date_utc.toISOString()
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
