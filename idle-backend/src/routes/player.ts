import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS, GEM_HOARDER_MIN_AVAILABLE_GEMS, type AchievementId } from "@maxidle/shared/achievements";
import {
  formatRestraintBlockedCollectMessage,
  getSecondsMultiplier,
  getWorthwhileAchievementsMultiplier,
  withShopUpgradeLevel
} from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import { SHOP_UPGRADE_IDS } from "@maxidle/shared/shopUpgrades";
import { boostedUncollectedIdleSeconds } from "../boostedUncollectedIdle.js";
import { persistCurrentSecondsFromPlayerRow } from "../currentSecondsRefresh.js";
import { calculateElapsedSeconds } from "../time.js";
import { getEffectiveIdleSecondsRate, isIdleCollectionBlockedByRestraint, shouldPreserveIdleTimerOnCollect } from "../idleRate.js";
import {
  getAchievementLevelForValue,
  isAchievementMaxed,
  mergeAchievementLevels,
  normalizeAchievementLevels,
  sumAchievementLevels,
  updatePlayerAchievementLevels
} from "../achievementUpdates.js";
import type { AuthClaims } from "../types.js";
import type { AnalyticsService } from "../analytics.js";
import { isDailyBonusEffectActiveForUtcDay } from "@maxidle/shared/dailyBonus";
import { KNOWN_TUTORIAL_IDS, mergedTutorialProgressString } from "@maxidle/shared/tutorialSteps";
import {
  canCollectDailyReward,
  getOrCreateCurrentDailyBonus,
  toDailyBonusResponse
} from "./dailyBonus.js";
import type { ObligationReward } from "@maxidle/shared/obligationReward";
import {
  getCurrentObligationId,
  getObligationDefinition,
  isObligationConditionMet,
  type ObligationId
} from "@maxidle/shared/obligations";
import { parseObligationsCompleted } from "../obligationsState.js";
import { getPlayerCollectionCount } from "../playerCollectionCount.js";

const REWARD_SKIPPER_GAP_MS = 48 * 60 * 60 * 1000;

type RegisterPlayerRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
  analytics: AnalyticsService;
  isProduction: boolean;
};

const DEBUG_TIME_GRANT_SECONDS = 12 * 60 * 60;

function sumObligationRewardDeltas(rewards: ObligationReward[]): { idle: number; real: number; gem: number } {
  let idle = 0;
  let real = 0;
  let gem = 0;
  for (const r of rewards) {
    if (r.type === "text") {
      continue;
    }
    const v = Math.floor(Number(r.value));
    if (r.type === "idle") {
      idle += v;
    } else if (r.type === "real") {
      real += v;
    } else {
      gem += v;
    }
  }
  return { idle, real, gem };
}

type PlayerStateRow = {
  idle_time_total: string;
  idle_time_available: string;
  real_time_total: string;
  real_time_available: number;
  time_gems_total: string;
  time_gems_available: string;
  upgrades_purchased: string;
  achievement_count: number;
  has_unseen_achievements: boolean;
  level: string;
  shop: ShopState;
  last_collected_at: Date;
  current_seconds: string;
  current_seconds_last_updated: Date;
  last_daily_reward_collected_at: Date | null;
  last_daily_bonus_claimed_at: Date | null;
  tutorial_progress: string;
  obligations_completed: unknown;
  server_time: Date;
};

export async function buildPlayerStatePayload(
  pool: Pool,
  userId: string,
  toNumber: (value: unknown) => number
): Promise<Record<string, unknown> | null> {
  const result = await pool.query<PlayerStateRow>(
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
      level,
      shop,
      last_collected_at,
      current_seconds,
      current_seconds_last_updated,
      last_daily_reward_collected_at,
      last_daily_bonus_claimed_at,
      tutorial_progress,
      obligations_completed,
      NOW() AS server_time
    FROM player_states
    WHERE user_id = $1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const collectionCount = await getPlayerCollectionCount(pool, userId);

  const achievementCount = toNumber(row.achievement_count);
  const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(row.shop, achievementCount);
  const currentIdleSeconds = await persistCurrentSecondsFromPlayerRow(pool, userId, row, toNumber);
  const elapsedSinceLastCollection = calculateElapsedSeconds(row.last_collected_at, row.server_time);
  const idleSecondsRate = getEffectiveIdleSecondsRate({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop: row.shop,
    achievementCount,
    playerLevel: toNumber(row.level),
    realTimeAvailable: toNumber(row.real_time_available),
    wallClockMs: row.server_time.getTime()
  });
  const dailyBonus = await getOrCreateCurrentDailyBonus(pool, row.server_time);

  return {
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
    level: toNumber(row.level),
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
    serverTime: row.server_time.toISOString(),
    tutorialProgress: row.tutorial_progress ?? "",
    obligationsCompleted: parseObligationsCompleted(row.obligations_completed),
    collectionCount
  };
}

export function registerPlayerRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  analytics,
  isProduction
}: RegisterPlayerRoutesOptions): void {
  app.get("/player", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;

      const userId = identity.claims.sub;
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/tutorial/complete", async (req, res, next) => {
    let userId: string;
    let userIsAnonymous = false;
    let didCompleteTutorialStep = false;
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      userId = identity.claims.sub;
      userIsAnonymous = identity.claims.isAnonymous;
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_IDENTITY") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      next(error);
      return;
    }

    const tutorialId = typeof req.body?.tutorialId === "string" ? req.body.tutorialId.trim() : "";
    if (!tutorialId) {
      res.status(400).json({ error: "tutorialId is required", code: "TUTORIAL_ID_REQUIRED" });
      return;
    }
    if (!KNOWN_TUTORIAL_IDS.has(tutorialId)) {
      res.status(400).json({ error: "Unknown tutorial id", code: "TUTORIAL_UNKNOWN_ID" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockResult = await client.query<{ tutorial_progress: string }>(
        `
        SELECT tutorial_progress
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
      const locked = lockResult.rows[0];
      if (!locked) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      const raw = locked.tutorial_progress ?? "";
      const merged = mergedTutorialProgressString(raw, tutorialId);
      if (merged !== raw) {
        didCompleteTutorialStep = true;
        await client.query(
          `
          UPDATE player_states
          SET tutorial_progress = $2, updated_at = NOW()
          WHERE user_id = $1
          `,
          [userId, merged]
        );
      }
      await client.query("COMMIT");
      if (didCompleteTutorialStep) {
        analytics.trackTutorialStepComplete(
          { userId, isAnonymous: userIsAnonymous },
          { tutorial_id: tutorialId }
        );
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
      return;
    } finally {
      client.release();
    }

    try {
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/tutorial/reset", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      const updateResult = await pool.query<{ user_id: string }>(
        `
        UPDATE player_states
        SET tutorial_progress = '', updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id
        `,
        [userId]
      );
      if (!updateResult.rows[0]) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_IDENTITY") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
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
        idle_time_available: number;
        real_time_available: number;
        upgrades_purchased: number;
        achievement_count: number;
        achievement_levels: unknown;
        has_unseen_achievements: boolean;
        shop: ShopState;
        last_collected_at: Date;
        current_seconds: number;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
        tutorial_progress: string;
        obligations_completed: unknown;
        level: number;
      }>(
        `
        SELECT
          upgrades_purchased,
          idle_time_available,
          real_time_available,
          achievement_count,
          achievement_levels,
          has_unseen_achievements,
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at,
          last_daily_bonus_claimed_at,
          tutorial_progress,
          obligations_completed,
          level
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
      const dailyBonusEffectActive = isDailyBonusEffectActiveForUtcDay(
        lockedRow.last_daily_bonus_claimed_at,
        currentDailyBonus.bonus_date_utc
      );
      const collectionAchievementCount = toNumber(lockedRow.achievement_count);
      const baseCollectedSeconds = boostedUncollectedIdleSeconds(
        lockedRow.last_collected_at,
        collectedAt,
        lockedRow.shop,
        collectionAchievementCount,
        toNumber(lockedRow.real_time_available),
        toNumber(lockedRow.level)
      );
      const baseRealSecondsCollected = calculateElapsedSeconds(lockedRow.last_collected_at, collectedAt);
      const collectedSeconds =
        dailyBonusEffectActive && currentDailyBonus.bonus_type === "collect_idle_percent"
          ? Math.floor(baseCollectedSeconds * (1 + currentDailyBonus.bonus_value / 100))
          : baseCollectedSeconds;
      const realSecondsCollected =
        dailyBonusEffectActive && currentDailyBonus.bonus_type === "collect_real_percent"
          ? Math.floor(baseRealSecondsCollected * (1 + currentDailyBonus.bonus_value / 100))
          : baseRealSecondsCollected;
      if (isIdleCollectionBlockedByRestraint({ secondsSinceLastCollection: realSecondsCollected, shop: lockedRow.shop })) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: formatRestraintBlockedCollectMessage(lockedRow.shop),
          code: "RESTRAINT_BLOCKED"
        });
        return;
      }
      const preserveTimer = shouldPreserveIdleTimerOnCollect(lockedRow.shop);
      const nextCurrentSeconds = preserveTimer ? collectedSeconds : 0;
      const nextLastCollectedAt = preserveTimer ? lockedRow.last_collected_at : collectedAt;
      const nextShop = withShopUpgradeLevel(lockedRow.shop, SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST, 0);
      const updateResult = await client.query<{
        idle_time_total: number;
        idle_time_available: number;
        real_time_total: number;
        real_time_available: number;
        time_gems_total: number;
        time_gems_available: number;
        upgrades_purchased: number;
        last_collected_at: Date;
        current_seconds: number;
        current_seconds_last_updated: Date;
        shop: ShopState;
        last_daily_reward_collected_at: Date | null;
        level: number;
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
          last_active = $5,
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
          last_daily_reward_collected_at,
          level
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
      const collectionCountResult = await client.query<{ collection_count: number }>(
        `
        SELECT COUNT(*) AS collection_count
        FROM player_collection_history
        WHERE user_id = $1
        `,
        [userId]
      );
      const collectionCount = toNumber(collectionCountResult.rows[0]?.collection_count ?? 0);

      const achievementLevels = normalizeAchievementLevels(lockedRow.achievement_levels, collectedAt);
      const currentLevelById = new Map(achievementLevels.map((entry) => [entry.id, entry.level] as const));
      const levelsToGrant = new Map<AchievementId, number>();
      const realTimeCollectorLevel = getAchievementLevelForValue(
        ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES,
        toNumber(row.real_time_total)
      );
      if (realTimeCollectorLevel > (currentLevelById.get(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES) ?? 0)) {
        levelsToGrant.set(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES, realTimeCollectorLevel);
      }
      const idleTimeTotalLevel = getAchievementLevelForValue(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR, toNumber(row.idle_time_total));
      if (idleTimeTotalLevel > (currentLevelById.get(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR) ?? 0)) {
        levelsToGrant.set(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR, idleTimeTotalLevel);
      }
      const realTimeStreakLevel = getAchievementLevelForValue(ACHIEVEMENT_IDS.REAL_TIME_STREAK, realSecondsCollected);
      if (realTimeStreakLevel > (currentLevelById.get(ACHIEVEMENT_IDS.REAL_TIME_STREAK) ?? 0)) {
        levelsToGrant.set(ACHIEVEMENT_IDS.REAL_TIME_STREAK, realTimeStreakLevel);
      }
      const collectionCountLevel = getAchievementLevelForValue(ACHIEVEMENT_IDS.COLLECTION_COUNT, collectionCount);
      if (collectionCountLevel > (currentLevelById.get(ACHIEVEMENT_IDS.COLLECTION_COUNT) ?? 0)) {
        levelsToGrant.set(ACHIEVEMENT_IDS.COLLECTION_COUNT, collectionCountLevel);
      }
      const nextAchievementLevels =
        levelsToGrant.size > 0 ? mergeAchievementLevels(lockedRow.achievement_levels, levelsToGrant, collectedAt) : achievementLevels;
      const nextAchievementCount = sumAchievementLevels(nextAchievementLevels);
      if (nextAchievementCount !== toNumber(lockedRow.achievement_count)) {
        await updatePlayerAchievementLevels(client, userId, nextAchievementLevels);
      }
      const hasUnseenAchievements =
        lockedRow.has_unseen_achievements || nextAchievementCount !== toNumber(lockedRow.achievement_count);

      const achievementCountAfter = nextAchievementCount;
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(row.shop, achievementCountAfter);
      const elapsedSinceLastCollectionAfterCollect = calculateElapsedSeconds(nextLastCollectedAt, collectedAt);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollectionAfterCollect,
        shop: row.shop,
        achievementCount: achievementCountAfter,
        playerLevel: toNumber(row.level),
        realTimeAvailable: toNumber(row.real_time_available),
        wallClockMs: collectedAt.getTime()
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
        level: toNumber(row.level),
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
        serverTime: row.last_collected_at.toISOString(),
        tutorialProgress: lockedRow.tutorial_progress ?? "",
        obligationsCompleted: parseObligationsCompleted(lockedRow.obligations_completed),
        collectionCount
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/player/obligations/collect", async (req, res, next) => {
    let userId: string;
    let userIsAnonymous = false;
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      userId = identity.claims.sub;
      userIsAnonymous = identity.claims.isAnonymous;
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_IDENTITY") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      next(error);
      return;
    }

    const rawId = typeof req.body?.obligationId === "string" ? req.body.obligationId.trim() : "";
    if (!rawId) {
      res.status(400).json({ error: "obligationId is required", code: "OBLIGATION_ID_REQUIRED" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockResult = await client.query<{
        idle_time_total: number;
        real_time_total: number;
        time_gems_total: number;
        upgrades_purchased: number;
        achievement_count: number;
        obligations_completed: unknown;
      }>(
        `
        SELECT
          idle_time_total,
          real_time_total,
          time_gems_total,
          upgrades_purchased,
          achievement_count,
          obligations_completed
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
      const locked = lockResult.rows[0];
      if (!locked) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const obligationCollectionCount = await getPlayerCollectionCount(pool, userId);

      const definition = getObligationDefinition(rawId as ObligationId);
      if (!definition || definition.id !== rawId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Unknown obligation id", code: "OBLIGATION_UNKNOWN_ID" });
        return;
      }

      const completedBefore = parseObligationsCompleted(locked.obligations_completed);
      const currentId = getCurrentObligationId(completedBefore);
      if (currentId === null) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No obligations left to collect", code: "OBLIGATION_NONE_LEFT" });
        return;
      }
      if (currentId !== definition.id) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Collect obligations in order", code: "OBLIGATION_NOT_CURRENT" });
        return;
      }

      const snapshot = {
        idleTimeTotal: toNumber(locked.idle_time_total),
        realTimeTotal: toNumber(locked.real_time_total),
        timeGemsTotal: toNumber(locked.time_gems_total),
        upgradesPurchased: toNumber(locked.upgrades_purchased),
        collectionCount: obligationCollectionCount,
        achievementCount: toNumber(locked.achievement_count)
      };
      if (!isObligationConditionMet(definition, snapshot)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Obligation requirements not met yet",
          code: "OBLIGATION_CONDITIONS_NOT_MET"
        });
        return;
      }

      const { idle: idleDelta, real: realDelta, gem: gemDelta } = sumObligationRewardDeltas(definition.rewards);
      const nextObligationsJson = JSON.stringify({ ...completedBefore, [definition.id]: true });

      await client.query(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + $2::BIGINT,
          idle_time_available = idle_time_available + $2::BIGINT,
          real_time_total = real_time_total + $3::BIGINT,
          real_time_available = real_time_available + $3::BIGINT,
          time_gems_total = time_gems_total + $4::BIGINT,
          time_gems_available = time_gems_available + $4::BIGINT,
          obligations_completed = $5::jsonb,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, idleDelta, realDelta, gemDelta, nextObligationsJson]
      );

      await client.query("COMMIT");
      analytics.trackObligationRewardCollect(
        { userId, isAnonymous: userIsAnonymous },
        { obligation_id: definition.id }
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
      return;
    } finally {
      client.release();
    }

    try {
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
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
        idle_time_total: number;
        idle_time_available: number;
        real_time_total: number;
        real_time_available: number;
        time_gems_total: number;
        time_gems_available: number;
        upgrades_purchased: number;
        current_seconds: number;
        current_seconds_last_updated: Date;
        shop: ShopState;
        achievement_count: number;
        achievement_levels: unknown;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
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
          tutorial_progress,
          obligations_completed
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
      const dailyBonusEffectActive = isDailyBonusEffectActiveForUtcDay(
        player.last_daily_bonus_claimed_at,
        currentDailyBonus.bonus_date_utc
      );
      if (!canCollectDailyReward(player.last_daily_reward_collected_at, now)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Daily reward already collected today",
          code: "DAILY_REWARD_NOT_AVAILABLE"
        });
        return;
      }

      const updateResult = await client.query<{
        idle_time_total: number;
        idle_time_available: number;
        real_time_total: number;
        real_time_available: number;
        time_gems_total: number;
        time_gems_available: number;
        upgrades_purchased: number;
        current_seconds: number;
        current_seconds_last_updated: Date;
        shop: ShopState;
        achievement_count: number;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
        last_daily_bonus_claimed_at: Date | null;
        tutorial_progress: string;
        obligations_completed: unknown;
        level: number;
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
          last_daily_bonus_claimed_at,
          tutorial_progress,
          obligations_completed,
          level
        `,
        [
          userId,
          now,
          dailyBonusEffectActive && currentDailyBonus.bonus_type === "double_gems_daily_reward" ? 2 : 1
        ]
      );
      const updatedPlayer = updateResult.rows[0];
      if (!updatedPlayer) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const achievementLevels = normalizeAchievementLevels(player.achievement_levels, now);
      const currentLevelById = new Map(achievementLevels.map((entry) => [entry.id, entry.level] as const));
      const idsToGrant: string[] = [];
      const previousDailyRewardAt = player.last_daily_reward_collected_at;
      if (
        previousDailyRewardAt !== null &&
        now.getTime() - previousDailyRewardAt.getTime() > REWARD_SKIPPER_GAP_MS &&
        !isAchievementMaxed(currentLevelById.get(ACHIEVEMENT_IDS.REWARD_SKIPPER) ?? 0, ACHIEVEMENT_IDS.REWARD_SKIPPER)
      ) {
        idsToGrant.push(ACHIEVEMENT_IDS.REWARD_SKIPPER);
      }
      const gemsAvailableAfterReward = toNumber(updatedPlayer.time_gems_available);
      if (
        gemsAvailableAfterReward >= GEM_HOARDER_MIN_AVAILABLE_GEMS &&
        !isAchievementMaxed(currentLevelById.get(ACHIEVEMENT_IDS.GEM_HOARDER) ?? 0, ACHIEVEMENT_IDS.GEM_HOARDER)
      ) {
        idsToGrant.push(ACHIEVEMENT_IDS.GEM_HOARDER);
      }
      const nextAchievementLevels =
        idsToGrant.length > 0
          ? mergeAchievementLevels(
              player.achievement_levels,
              new Map<AchievementId, number>(idsToGrant.map((id) => [id as AchievementId, 1])),
              now
            )
          : achievementLevels;
      const nextAchievementCount = sumAchievementLevels(nextAchievementLevels);
      if (nextAchievementCount !== toNumber(player.achievement_count)) {
        await updatePlayerAchievementLevels(client, userId, nextAchievementLevels);
      }
      const hasUnseenAchievements =
        player.has_unseen_achievements ||
        nextAchievementCount !== toNumber(player.achievement_count);

      const elapsedSinceLastCollection = calculateElapsedSeconds(updatedPlayer.last_collected_at, now);
      const achievementCountAfter = nextAchievementCount;
      const achievementBonusMultiplier = getWorthwhileAchievementsMultiplier(updatedPlayer.shop, achievementCountAfter);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updatedPlayer.shop,
        achievementCount: achievementCountAfter,
        playerLevel: toNumber(updatedPlayer.level),
        realTimeAvailable: toNumber(updatedPlayer.real_time_available),
        wallClockMs: now.getTime()
      });
      await client.query("COMMIT");
      const collectionCountAfterReward = await getPlayerCollectionCount(pool, userId);
      const rewardMultiplier =
        dailyBonusEffectActive && currentDailyBonus.bonus_type === "double_gems_daily_reward" ? 2 : 1;
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
        level: toNumber(updatedPlayer.level),
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
        serverTime: now.toISOString(),
        tutorialProgress: updatedPlayer.tutorial_progress ?? "",
        obligationsCompleted: parseObligationsCompleted(updatedPlayer.obligations_completed),
        collectionCount: collectionCountAfterReward
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

  app.post("/player/debug/add-real-time", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const updateResult = await pool.query(
        `
        UPDATE player_states
        SET
          real_time_total = real_time_total + $2::BIGINT,
          real_time_available = real_time_available + $2::BIGINT,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, DEBUG_TIME_GRANT_SECONDS]
      );
      if (updateResult.rowCount === 0) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/debug/add-idle-time", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const updateResult = await pool.query(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + $2::BIGINT,
          idle_time_available = idle_time_available + $2::BIGINT,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, DEBUG_TIME_GRANT_SECONDS]
      );
      if (updateResult.rowCount === 0) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/debug/reset-balances", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const updateResult = await pool.query(
        `
        UPDATE player_states
        SET
          idle_time_total = 0,
          idle_time_available = 0,
          real_time_total = 0,
          real_time_available = 0,
          time_gems_total = 0,
          time_gems_available = 0,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId]
      );
      if (updateResult.rowCount === 0) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });
}
