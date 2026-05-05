import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("daily bonus routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

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

  it("collects free real time daily bonus exactly once per UTC day", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("free_real_time_hours", 3);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 24 * 60 * 60]);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.realTime.total).toBe(3 * 60 * 60);
    expect(collect.body.realTime.available).toBe(3 * 60 * 60);
    expect(collect.body.idleTime.available).toBe(0);
    expect(collect.body.dailyBonus.isClaimed).toBe(true);

    const secondCollect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(secondCollect.status).toBe(400);
    expect(secondCollect.body.code).toBe("DAILY_BONUS_ALREADY_CLAIMED");

    const claimState = await pool.query<{ last_daily_bonus_claimed_at: Date | null; last_daily_bonus_claimed_type: string | null }>(
      `
      SELECT last_daily_bonus_claimed_at, last_daily_bonus_claimed_type
      FROM player_states
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(claimState.rows[0]?.last_daily_bonus_claimed_at).toBeTruthy();
    expect(claimState.rows[0]?.last_daily_bonus_claimed_type).toBe("free_real_time_hours");
  });

  it("collects free time gem daily bonus exactly once per UTC day", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("free_time_gem", 1);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 24 * 60 * 60]);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.timeGems.total).toBe(1);
    expect(collect.body.timeGems.available).toBe(1);
    expect(collect.body.idleTime.available).toBe(0);
    expect(collect.body.dailyBonus.isClaimed).toBe(true);

    const secondCollect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(secondCollect.status).toBe(400);
    expect(secondCollect.body.code).toBe("DAILY_BONUS_ALREADY_CLAIMED");

    const claimState = await pool.query<{ last_daily_bonus_claimed_at: Date | null; last_daily_bonus_claimed_type: string | null }>(
      `
      SELECT last_daily_bonus_claimed_at, last_daily_bonus_claimed_type
      FROM player_states
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(claimState.rows[0]?.last_daily_bonus_claimed_at).toBeTruthy();
    expect(claimState.rows[0]?.last_daily_bonus_claimed_type).toBe("free_time_gem");
  });

  it("rejects daily bonus activation when the feature is not unlocked", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await upsertTodayBonus("collect_idle_percent", 30);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 24 * 60 * 60]);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(403);
    expect(collect.body.code).toBe("DAILY_BONUS_FEATURE_LOCKED");
  });

  it("rejects daily bonus activation without enough idle time", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("collect_idle_percent", 30);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(400);
    expect(collect.body.code).toBe("DAILY_BONUS_INSUFFICIENT_IDLE");
  });

  it("activates a percent daily bonus by spending idle time", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("collect_idle_percent", 30);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 100_000]);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);
    expect(collect.body.dailyBonus.isClaimed).toBe(true);
    expect(collect.body.idleTime.available).toBe(100_000 - 24 * 60 * 60);
  });

  it("increments daily_bonuses_collected_count and grants the daily bonus collector achievement", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    await unlockDailyBonusFeature(app, token, userId);
    await upsertTodayBonus("free_real_time_hours", 3);
    await pool.query(`UPDATE player_states SET idle_time_available = $2 WHERE user_id = $1`, [userId, 24 * 60 * 60]);

    const collect = await request(app).post("/player/daily-bonus/collect").set("Authorization", `Bearer ${token}`);
    expect(collect.status).toBe(200);

    const state = await pool.query<{
      daily_bonuses_collected_count: string | number;
      achievement_levels: unknown;
    }>(
      `
      SELECT daily_bonuses_collected_count, achievement_levels
      FROM player_states
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(Number(state.rows[0]?.daily_bonuses_collected_count)).toBe(1);
    const levels = state.rows[0]?.achievement_levels as Array<{ id: string; level: number }>;
    const collector = levels.find((entry) => entry.id === ACHIEVEMENT_IDS.DAILY_BONUS_COLLECTOR);
    expect(collector?.level).toBe(1);
  });
});
