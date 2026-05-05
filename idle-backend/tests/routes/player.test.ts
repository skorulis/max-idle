import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { DEFAULT_SHOP_STATE, getRestraintBonusMultiplier } from "@maxidle/shared/shop";
import { OBLIGATION_IDS } from "@maxidle/shared/obligations";
import { TUTORIAL_STEPS } from "@maxidle/shared/tutorialSteps";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("player routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

  function achievementIdsFromLevels(value: unknown): string[] {
    return parseAchievementLevels(value).map((entry) => entry.id);
  }

  function parseAchievementLevels(value: unknown): Array<{ id: string; level: number; grantedAt: string }> {
    const parsedValue = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    if (!Array.isArray(parsedValue)) {
      return [];
    }
    const levels: Array<{ id: string; level: number; grantedAt: string }> = [];
    for (const entry of parsedValue) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const item = entry as { id?: unknown; level?: unknown; grantedAt?: unknown };
      if (typeof item.id !== "string" || typeof item.level !== "number" || typeof item.grantedAt !== "string") {
        continue;
      }
      levels.push({ id: item.id, level: item.level, grantedAt: item.grantedAt });
    }
    return levels;
  }

  function getCurrentUtcDayStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  async function upsertTodayBonus(
    type:
      | "collect_idle_percent"
      | "collect_real_percent"
      | "double_gems_daily_reward"
      | "free_time_gem"
      | "free_real_time_hours"
      | "free_idle_time_hours",
    value: number
  ): Promise<void> {
    await pool.query(
      `
      INSERT INTO daily_bonuses (bonus_date_utc, bonus_type, bonus_value)
      VALUES ($1, $2, $3)
      ON CONFLICT (bonus_date_utc)
      DO UPDATE SET bonus_type = EXCLUDED.bonus_type, bonus_value = EXCLUDED.bonus_value
      `,
      [getCurrentUtcDayStart(), type, value]
    );
  }

  async function unlockDailyBonusFeature(
    app: ReturnType<typeof createApp>,
    token: string,
    userId: string
  ): Promise<void> {
    await pool.query(`UPDATE player_states SET time_gems_available = time_gems_available + 1 WHERE user_id = $1`, [userId]);
    const purchase = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "daily_bonus_feature" });
    expect(purchase.status).toBe(200);
  }

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates anonymous user and returns player state", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");

    expect(authResponse.status).toBe(201);
    expect(authResponse.body.userId).toBeTypeOf("string");
    expect(authResponse.body.token).toBeTypeOf("string");

    const playerResponse = await request(app)
      .get("/player")
      .set("Authorization", `Bearer ${authResponse.body.token}`);

    expect(playerResponse.status).toBe(200);
    expect(playerResponse.body.idleTime.total).toBe(0);
    expect(playerResponse.body.idleTime.available).toBe(0);
    expect(playerResponse.body.realTime.total).toBe(0);
    expect(playerResponse.body.realTime.available).toBe(0);
    expect(playerResponse.body.timeGems.total).toBe(0);
    expect(playerResponse.body.timeGems.available).toBe(0);
    expect(playerResponse.body.upgradesPurchased).toBe(0);
    expect(playerResponse.body.currentSeconds).toBeGreaterThanOrEqual(0);
    expect(playerResponse.body.currentSecondsLastUpdated).toBeTypeOf("string");
    expect(playerResponse.body.lastCollectedAt).toBeTypeOf("string");
    expect(playerResponse.body.lastDailyRewardCollectedAt).toBeNull();
    expect(playerResponse.body.hasUnseenAchievements).toBe(false);
    expect(playerResponse.body.serverTime).toBeTypeOf("string");
  });

  it("collects elapsed idle time and resets timer", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const { token, userId } = authResponse.body as { token: string; userId: string };

    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = NOW() - INTERVAL '10 seconds',
        current_seconds_last_updated = NOW() - INTERVAL '10 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body.collectedSeconds).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.idleTime.total).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.realSecondsCollected).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.realTime.total).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.upgradesPurchased).toBe(0);
    expect(collectResponse.body.serverTime).toBeTypeOf("string");

    const firstHistoryResult = await pool.query<{
      collection_date: Date;
      real_time: string | number;
      idle_time: string | number;
    }>(
      `
      SELECT collection_date, real_time, idle_time
      FROM player_collection_history
      WHERE user_id = $1
      ORDER BY collection_date DESC
      LIMIT 1
      `,
      [userId]
    );
    expect(firstHistoryResult.rows[0]?.collection_date).toBeTruthy();
    expect(Number(firstHistoryResult.rows[0]?.real_time ?? 0)).toBeGreaterThanOrEqual(10);
    expect(Number(firstHistoryResult.rows[0]?.idle_time ?? 0)).toBeGreaterThanOrEqual(10);

    const secondCollect = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(secondCollect.status).toBe(200);
    expect(secondCollect.body.collectedSeconds).toBe(0);

    const historyCountResult = await pool.query<{ count: string }>(
      `
      SELECT COUNT(*) AS count
      FROM player_collection_history
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(Number(historyCountResult.rows[0]?.count ?? 0)).toBe(2);
  });

  it("collects a daily reward once per UTC day", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await upsertTodayBonus("collect_idle_percent", 25);

    const firstCollect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(firstCollect.status).toBe(200);
    expect(firstCollect.body.timeGems.total).toBe(1);
    expect(firstCollect.body.timeGems.available).toBe(1);
    expect(firstCollect.body.lastDailyRewardCollectedAt).toBeTypeOf("string");

    const secondCollect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(secondCollect.status).toBe(400);
    expect(secondCollect.body.code).toBe("DAILY_REWARD_NOT_AVAILABLE");

    const state = await pool.query<{ time_gems_total: string; time_gems_available: string; last_daily_reward_collected_at: Date | null }>(
      `
      SELECT time_gems_total, time_gems_available, last_daily_reward_collected_at
      FROM player_states
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(Number(state.rows[0]?.time_gems_total ?? 0)).toBe(1);
    expect(Number(state.rows[0]?.time_gems_available ?? 0)).toBe(1);
    expect(state.rows[0]?.last_daily_reward_collected_at).toBeTruthy();
  });

  it("grants reward skipper when collecting daily reward more than 48 hours after the last one", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await upsertTodayBonus("collect_real_percent", 20);

    await pool.query(
      `
      UPDATE player_states
      SET last_daily_reward_collected_at = NOW() - INTERVAL '49 hours'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.hasUnseenAchievements).toBe(true);

    const achievementsResponse = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(achievementsResponse.status).toBe(200);
    const rewardSkipper = achievementsResponse.body.achievements.find((a: { id: string }) => a.id === "reward_skipper");
    expect(rewardSkipper?.completed).toBe(true);
  });

  it("awards gem hoarder when daily reward brings time gems available to at least 20", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await upsertTodayBonus("collect_idle_percent", 15);

    await pool.query(
      `
      UPDATE player_states
      SET time_gems_total = 19, time_gems_available = 19
      WHERE user_id = $1
      `,
      [userId]
    );

    const collect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.timeGems.available).toBe(20);
    expect(collect.body.hasUnseenAchievements).toBe(true);

    const achievementsResponse = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(achievementsResponse.status).toBe(200);
    const gemHoarder = achievementsResponse.body.achievements.find((a: { id: string }) => a.id === "gem_hoarder");
    expect(gemHoarder?.completed).toBe(true);
  });

  it("includes today's daily bonus in player payload even before the feature is unlocked", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    expect(playerResponse.body.dailyBonus).toBeTruthy();
    expect(typeof playerResponse.body.dailyBonus.type).toBe("string");
    expect(typeof playerResponse.body.dailyBonus.value).toBe("number");
    expect(playerResponse.body.dailyBonus.activationCostIdleSeconds).toBe(24 * 60 * 60);

    await unlockDailyBonusFeature(app, token, userId);

    const afterUnlock = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(afterUnlock.status).toBe(200);
    expect(afterUnlock.body.dailyBonus).toBeTruthy();
    expect(typeof afterUnlock.body.dailyBonus.type).toBe("string");
    expect(typeof afterUnlock.body.dailyBonus.value).toBe("number");
    expect(afterUnlock.body.dailyBonus.activationCostIdleSeconds).toBe(24 * 60 * 60);

    const historyRow = await pool.query<{ bonus_type: string; bonus_value: string | number }>(
      `
      SELECT bonus_type, bonus_value
      FROM daily_bonuses
      WHERE bonus_date_utc = $1
      LIMIT 1
      `,
      [getCurrentUtcDayStart()]
    );
    expect(historyRow.rows[0]).toBeTruthy();
  });

  it("does not double daily reward gems until the daily bonus is activated", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    await upsertTodayBonus("double_gems_daily_reward", 2);

    const collect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.timeGems.total).toBe(1);
    expect(collect.body.timeGems.available).toBe(1);
  });

  it("doubles daily reward gems when double gems daily bonus is activated", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("double_gems_daily_reward", 2);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 24 * 60 * 60]);

    const activate = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(activate.status).toBe(200);
    expect(activate.body.dailyBonus.isClaimed).toBe(true);

    const collect = await request(app).post("/player/daily-reward/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.timeGems.total).toBe(2);
    expect(collect.body.timeGems.available).toBe(2);
  });

  it("awards real-time achievement after collecting 65 minutes", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        real_time_total = 3899,
        last_collected_at = NOW() - INTERVAL '1 second',
        current_seconds_last_updated = NOW() - INTERVAL '1 second'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual([
      "real_time_collector_65_minutes"
    ]);
    expect(collectResponse.body.hasUnseenAchievements).toBe(true);
  });

  it("awards idle-time achievement after collecting 3 hours and 7 minutes", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        idle_time_total = 11219,
        last_collected_at = NOW() - INTERVAL '1 second',
        current_seconds_last_updated = NOW() - INTERVAL '1 second'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual(["idle_time_collector"]);
    expect(parseAchievementLevels(achievementState.rows[0]?.achievement_levels)).toMatchObject([
      { id: "idle_time_collector", level: 1 }
    ]);

    // Keep this test from affecting leaderboard ordering in later tests.
    await pool.query(`UPDATE player_states SET idle_time_total = 0, idle_time_available = 0 WHERE user_id = $1`, [userId]);
  });

  it("awards hibernation level 1 when collecting after a 59-minute real-time gap", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = NOW() - INTERVAL '59 minutes',
        current_seconds_last_updated = NOW() - INTERVAL '59 minutes'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toContain("real_time_streak");
    expect(parseAchievementLevels(achievementState.rows[0]?.achievement_levels).find((e) => e.id === "real_time_streak")?.level).toBe(1);

    // Keep this test from affecting leaderboard ordering in later tests.
    await pool.query(`UPDATE player_states SET idle_time_total = 0, idle_time_available = 0 WHERE user_id = $1`, [userId]);
  });

  it("awards hibernation level 3 when collecting after a 2d14h real-time gap", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = NOW() - INTERVAL '2 days 14 hours',
        current_seconds_last_updated = NOW() - INTERVAL '2 days 14 hours'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    const completed = achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels);
    expect(completed).toContain("real_time_streak");
    expect(parseAchievementLevels(achievementState.rows[0]?.achievement_levels).find((e) => e.id === "real_time_streak")?.level).toBe(3);

    // Keep this test from affecting leaderboard ordering in later tests.
    await pool.query(`UPDATE player_states SET idle_time_total = 0, idle_time_available = 0 WHERE user_id = $1`, [userId]);
  });

  it("awards leveled collection-count achievement and stores level metadata", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    for (let index = 0; index < 14; index += 1) {
      await pool.query(
        `
        INSERT INTO player_collection_history (user_id, collection_date, real_time, idle_time)
        VALUES ($1, NOW(), 1, 1)
        `,
        [userId]
      );
    }
    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = NOW() - INTERVAL '1 second',
        current_seconds_last_updated = NOW() - INTERVAL '1 second'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toContain("collection_count");
    const collectionLevel = parseAchievementLevels(achievementState.rows[0]?.achievement_levels).find(
      (entry) => entry.id === "collection_count"
    );
    expect(collectionLevel?.level).toBe(1);
    expect(collectionLevel?.grantedAt.length).toBeGreaterThan(0);
    expect(collectResponse.body.hasUnseenAchievements).toBe(true);
  });

  it("increases collection-count levels and stays incomplete before max level", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    for (let index = 0; index < 149; index += 1) {
      await pool.query(
        `
        INSERT INTO player_collection_history (user_id, collection_date, real_time, idle_time)
        VALUES ($1, NOW(), 1, 1)
        `,
        [userId]
      );
    }
    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = NOW() - INTERVAL '1 second',
        current_seconds_last_updated = NOW() - INTERVAL '1 second'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body.achievementCount).toBe(2);

    const achievementsResponse = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(achievementsResponse.status).toBe(200);
    const collectionAchievement = achievementsResponse.body.achievements.find((achievement: { id: string }) => achievement.id === "collection_count");
    expect(collectionAchievement?.level).toBe(2);
    expect(collectionAchievement?.maxLevel).toBe(3);
    expect(collectionAchievement?.completed).toBe(false);
  });

  it("applies seconds multiplier to generated idle gain", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        shop = '{"seconds_multiplier": 10}'::jsonb,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
        last_collected_at = NOW() - INTERVAL '120 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    const expectedCurrent = Math.floor(120 * 1.5);
    expect(playerResponse.body.currentSeconds).toBe(expectedCurrent);
    expect(playerResponse.body.secondsMultiplier).toBe(1.5);
    expect(playerResponse.body.achievementBonusMultiplier).toBe(0);
  });

  it("applies worthwhile achievements multiplier when shop tier and achievement count are set", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        achievement_count = 2,
        shop = $2::jsonb,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
        last_collected_at = NOW() - INTERVAL '120 seconds'
      WHERE user_id = $1
      `,
      [userId, JSON.stringify({ ...DEFAULT_SHOP_STATE, worthwhile_achievements: 1 })]
    );

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    const expectedCurrent = Math.floor(120 * (1 + 0.01 * 2));
    expect(playerResponse.body.currentSeconds).toBe(expectedCurrent);
    expect(playerResponse.body.achievementBonusMultiplier).toBeCloseTo(0.02, 5);
  });

  it("continues idle generation under 1 hour when restraint is enabled", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        shop = '{"seconds_multiplier": 0, "restraint": 1}'::jsonb,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
        last_collected_at = NOW() - INTERVAL '120 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    const minExpectedCurrent = Math.floor(
      120 * (1 + getRestraintBonusMultiplier({ ...DEFAULT_SHOP_STATE, restraint: 1 }))
    );
    expect(playerResponse.body.currentSeconds).toBeGreaterThanOrEqual(minExpectedCurrent);
    expect(playerResponse.body.idleSecondsRate).toBeGreaterThan(0);
  });

  it("blocks collect under 1 hour when restraint is enabled", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        shop = '{"seconds_multiplier": 0, "restraint": 1}'::jsonb,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
        last_collected_at = NOW() - INTERVAL '120 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(400);
    expect(collectResponse.body.code).toBe("RESTRAINT_BLOCKED");
  });

  it("applies restraint bonus after 1 hour realtime", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        shop = '{"seconds_multiplier": 0, "restraint": 1}'::jsonb,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '7200 seconds',
        last_collected_at = NOW() - INTERVAL '7200 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    const restraintMult = 1 + getRestraintBonusMultiplier({ ...DEFAULT_SHOP_STATE, restraint: 1 });
    const expectedCurrent = Math.floor(7200 * restraintMult);
    expect(playerResponse.body.currentSeconds).toBeGreaterThanOrEqual(expectedCurrent);
    expect(playerResponse.body.currentSeconds).toBeLessThanOrEqual(Math.floor(7220 * restraintMult));
  });

  it("grants 12 hours of real time with debug endpoint in non-production config", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `UPDATE player_states SET real_time_total = 100, real_time_available = 100 WHERE user_id = $1`,
      [userId]
    );

    const grantSeconds = 12 * 60 * 60;
    const debugResponse = await request(app).post("/player/debug/add-real-time").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.realTime.total).toBe(100 + grantSeconds);
    expect(debugResponse.body.realTime.available).toBe(100 + grantSeconds);
  });

  it("grants 12 hours of idle time with debug endpoint in non-production config", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `UPDATE player_states SET idle_time_total = 50, idle_time_available = 50 WHERE user_id = $1`,
      [userId]
    );

    const grantSeconds = 12 * 60 * 60;
    const debugResponse = await request(app).post("/player/debug/add-idle-time").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.idleTime.total).toBe(50 + grantSeconds);
    expect(debugResponse.body.idleTime.available).toBe(50 + grantSeconds);
  });

  it("resets all currency balances to zero with debug endpoint in non-production config", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await pool.query(
      `UPDATE player_states
       SET
         real_time_total = 100,
         real_time_available = 100,
         idle_time_total = 50,
         idle_time_available = 50,
         time_gems_total = 3,
         time_gems_available = 3
       WHERE user_id = $1`,
      [userId]
    );

    const debugResponse = await request(app).post("/player/debug/reset-balances").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.realTime.total).toBe(0);
    expect(debugResponse.body.realTime.available).toBe(0);
    expect(debugResponse.body.idleTime.total).toBe(0);
    expect(debugResponse.body.idleTime.available).toBe(0);
    expect(debugResponse.body.timeGems.total).toBe(0);
    expect(debugResponse.body.timeGems.available).toBe(0);
  });

  it("does not register debug time grant endpoints in production config", async () => {
    const app = createApp(pool, { ...config, isProduction: true });
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const realResponse = await request(app).post("/player/debug/add-real-time").set("Authorization", `Bearer ${token}`);
    const idleResponse = await request(app).post("/player/debug/add-idle-time").set("Authorization", `Bearer ${token}`);
    const resetBalancesResponse = await request(app).post("/player/debug/reset-balances").set("Authorization", `Bearer ${token}`);
    expect(realResponse.status).toBe(404);
    expect(idleResponse.status).toBe(404);
    expect(resetBalancesResponse.status).toBe(404);
  });

  it("preserves timer on collect when luck roll succeeds", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      await pool.query(
        `
        UPDATE player_states
        SET
          shop = '{"seconds_multiplier": 0, "restraint": 0, "luck": 1}'::jsonb,
          current_seconds = 0,
          current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
          last_collected_at = NOW() - INTERVAL '120 seconds'
        WHERE user_id = $1
        `,
        [userId]
      );

      const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
      expect(collectResponse.status).toBe(200);
      expect(collectResponse.body.currentSeconds).toBeGreaterThan(0);
      expect(collectResponse.body.collectedSeconds).toBeGreaterThanOrEqual(120);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("resets timer on collect when luck roll fails", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);

    try {
      await pool.query(
        `
        UPDATE player_states
        SET
          shop = '{"seconds_multiplier": 0, "restraint": 0, "luck": 1}'::jsonb,
          current_seconds = 0,
          current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
          last_collected_at = NOW() - INTERVAL '120 seconds'
        WHERE user_id = $1
        `,
        [userId]
      );

      const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
      expect(collectResponse.status).toBe(200);
      expect(collectResponse.body.currentSeconds).toBe(0);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("tutorial: GET /player includes tutorialProgress, POST /player/tutorial/complete updates and is idempotent, unknown id is 400", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    expect(authResponse.status).toBe(201);
    const token = authResponse.body.token as string;
    const firstId = TUTORIAL_STEPS[0]?.id;
    expect(firstId).toBeTruthy();

    const playerBefore = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerBefore.status).toBe(200);
    expect(playerBefore.body.tutorialProgress).toBe("");

    const bad = await request(app)
      .post("/player/tutorial/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ tutorialId: "not_a_real_tutorial" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("TUTORIAL_UNKNOWN_ID");

    const first = await request(app)
      .post("/player/tutorial/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ tutorialId: firstId });
    expect(first.status).toBe(200);
    expect(first.body.tutorialProgress).toBe(firstId);

    const dup = await request(app)
      .post("/player/tutorial/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ tutorialId: firstId });
    expect(dup.status).toBe(200);
    expect(dup.body.tutorialProgress).toBe(firstId);

    const home = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.player.tutorialProgress).toBe(firstId);

    const reset = await request(app).post("/player/tutorial/reset").set("Authorization", `Bearer ${token}`);
    expect(reset.status).toBe(200);
    expect(reset.body.tutorialProgress).toBe("");

    const homeAfterReset = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfterReset.status).toBe(200);
    expect(homeAfterReset.body.player.tutorialProgress).toBe("");
  });

  it("obligations: GET /player includes obligationsCompleted; collect validates order and conditions", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    expect(authResponse.status).toBe(201);
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    const playerBefore = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerBefore.status).toBe(200);
    expect(playerBefore.body.obligationsCompleted).toEqual({});

    const missingBody = await request(app).post("/player/obligations/collect").set("Authorization", `Bearer ${token}`).send({});
    expect(missingBody.status).toBe(400);
    expect(missingBody.body.code).toBe("OBLIGATION_ID_REQUIRED");

    const unauth = await request(app)
      .post("/player/obligations/collect")
      .send({ obligationId: OBLIGATION_IDS.COLLECT_SOME_TIME });
    expect(unauth.status).toBe(401);

    const unknown = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: "not_real" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("OBLIGATION_UNKNOWN_ID");

    const notMet = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.COLLECT_SOME_TIME });
    expect(notMet.status).toBe(400);
    expect(notMet.body.code).toBe("OBLIGATION_CONDITIONS_NOT_MET");

    await pool.query(
      `INSERT INTO player_collection_history (user_id, collection_date, real_time, idle_time) VALUES ($1, NOW(), 1, 1)`,
      [userId]
    );

    const firstOk = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.COLLECT_SOME_TIME });
    expect(firstOk.status).toBe(200);
    expect(firstOk.body.obligationsCompleted[OBLIGATION_IDS.COLLECT_SOME_TIME]).toBe(true);
    expect(Number(firstOk.body.idleTime.total)).toBeGreaterThanOrEqual(
      Number(playerBefore.body.idleTime.total) + 5 * 60
    );

    const skipSecond = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.COLLECT_SOME_TIME });
    expect(skipSecond.status).toBe(400);
    expect(skipSecond.body.code).toBe("OBLIGATION_NOT_CURRENT");

    const secondNotReady = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.FIRST_PURCHASE });
    expect(secondNotReady.status).toBe(400);
    expect(secondNotReady.body.code).toBe("OBLIGATION_CONDITIONS_NOT_MET");

    await pool.query(`UPDATE player_states SET upgrades_purchased = 1 WHERE user_id = $1`, [userId]);

    const secondOk = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.FIRST_PURCHASE });
    expect(secondOk.status).toBe(200);
    expect(secondOk.body.obligationsCompleted[OBLIGATION_IDS.FIRST_PURCHASE]).toBe(true);

    const staleSecond = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.FIRST_PURCHASE });
    expect(staleSecond.status).toBe(400);
    expect(staleSecond.body.code).toBe("OBLIGATION_NOT_CURRENT");

    const thirdNotReady = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.ACHIEVE_SOMETHING });
    expect(thirdNotReady.status).toBe(400);
    expect(thirdNotReady.body.code).toBe("OBLIGATION_CONDITIONS_NOT_MET");

    await pool.query(`UPDATE player_states SET achievement_count = 1 WHERE user_id = $1`, [userId]);

    const idleBeforeThird = Number(secondOk.body.idleTime.total);
    const thirdOk = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.ACHIEVE_SOMETHING });
    expect(thirdOk.status).toBe(200);
    expect(thirdOk.body.obligationsCompleted[OBLIGATION_IDS.ACHIEVE_SOMETHING]).toBe(true);
    expect(Number(thirdOk.body.idleTime.total)).toBeGreaterThanOrEqual(idleBeforeThird + 15 * 60);

    const noneLeft = await request(app)
      .post("/player/obligations/collect")
      .set("Authorization", `Bearer ${token}`)
      .send({ obligationId: OBLIGATION_IDS.ACHIEVE_SOMETHING });
    expect(noneLeft.status).toBe(400);
    expect(noneLeft.body.code).toBe("OBLIGATION_NOT_CURRENT");
  });
});
