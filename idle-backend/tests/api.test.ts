import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, syncStalePlayerCurrentSeconds } from "../src/app.js";
import { ensureGameIdentityForAuthUser } from "../src/betterAuth.js";
import { calculateBoostedIdleSecondsGain, calculateIdleSecondsGain } from "../src/idleRate.js";
import { finalizeDueTournaments, getNextTournamentDrawAt } from "../src/tournaments.js";
import type { AppConfig } from "../src/types.js";
import { createTestPool } from "./testDb.js";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { getRestraintBonusMultiplier } from "@maxidle/shared/shop";
import { LUCK_SHOP_UPGRADE, RESTRAINT_SHOP_UPGRADE, SECONDS_MULTIPLIER_SHOP_UPGRADE } from "@maxidle/shared/shopUpgrades";
import { DEFAULT_SHOP_STATE } from "@maxidle/shared/shop";
import { TUTORIAL_STEPS } from "@maxidle/shared/tutorialSteps";

describe("auth + player lifecycle", () => {
  const config: AppConfig = {
    port: 3000,
    isProduction: false,
    databaseUrl: "postgres://unused",
    jwtSecret: "test-secret",
    amplitudeApiKey: "test-amplitude-api-key",
    corsOrigin: "http://localhost:5173",
    betterAuthSecret: "test-secret-test-secret-test-secret-32",
    betterAuthUrl: "http://localhost:3000",
    googleClientId: undefined,
    googleClientSecret: undefined,
    appleClientId: undefined,
    appleClientSecret: undefined
  };
  let pool: Pool;

  function uniqueEmail(): string {
    return `${randomUUID()}@example.com`;
  }

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

  async function unlockTournamentFeature(
    app: ReturnType<typeof createApp>,
    token: string,
    userId: string
  ): Promise<void> {
    await pool.query(`UPDATE player_states SET time_gems_available = time_gems_available + 2 WHERE user_id = $1`, [userId]);
    const purchase = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "tournament_feature" });
    expect(purchase.status).toBe(200);
  }

  async function insertLeaderboardPlayer(totalSecondsCollected: number, currentSeconds = 0): Promise<string> {
    const userId = randomUUID();
    const username = `lb_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await pool.query(`INSERT INTO users (id, is_anonymous, username) VALUES ($1, TRUE, $2)`, [userId, username]);
    await pool.query(`INSERT INTO player_states (user_id, idle_time_total, current_seconds) VALUES ($1, $2, $3)`, [
      userId,
      totalSecondsCollected,
      currentSeconds
    ]);
    return userId;
  }

  async function createTournamentEntrant(
    app: ReturnType<typeof createApp>,
    secondsSinceLastCollection: number
  ): Promise<{ userId: string; token: string }> {
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const lastCollectedAt = new Date(Date.now() - secondsSinceLastCollection * 1000);
    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = $2,
        current_seconds_last_updated = $2
      WHERE user_id = $1
      `,
      [userId, lastCollectedAt]
    );
    await unlockTournamentFeature(app, token, userId);
    const enterResponse = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterResponse.status).toBe(200);
    return { userId, token };
  }

  beforeAll(async () => {
    pool = await createTestPool();
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

  it("returns aggregated player, account, and tournament on GET /home", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    const homeBeforeUnlock = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeBeforeUnlock.status).toBe(200);
    expect(homeBeforeUnlock.body.player.serverTime).toBeTruthy();
    expect(homeBeforeUnlock.body.account.isAnonymous).toBe(true);
    expect(homeBeforeUnlock.body.account.gameUserId).toBe(userId);
    expect(homeBeforeUnlock.body.tournament).toBeNull();

    await unlockTournamentFeature(app, token, userId);

    const homeResponse = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeResponse.status).toBe(200);
    expect(typeof homeResponse.body.tournament?.drawAt).toBe("string");
    expect(homeResponse.body.tournament?.nearbyEntries).toEqual([]);
    expect(homeResponse.body.tournament?.outstanding_result).toBeNull();

    const enterResponse = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterResponse.status).toBe(200);
    const homeAfterEnter = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfterEnter.body.tournament?.nearbyEntries).toEqual([]);
    const tournamentCurrent = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(tournamentCurrent.body.nearbyEntries.length).toBeGreaterThan(0);
  });

  it("returns 401 from GET /home without credentials", async () => {
    const app = createApp(pool, config);
    const homeResponse = await request(app).get("/home");
    expect(homeResponse.status).toBe(401);
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

  it("returns 403 from tournament routes when the weekly tournament shop upgrade is locked", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const currentLocked = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentLocked.status).toBe(403);
    expect(currentLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const enterLocked = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterLocked.status).toBe(403);
    expect(enterLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const collectLocked = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token}`);
    expect(collectLocked.status).toBe(403);
    expect(collectLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const historyLocked = await request(app).get("/tournament/history").set("Authorization", `Bearer ${token}`);
    expect(historyLocked.status).toBe(403);
    expect(historyLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");
  });

  it("returns tournament history after a finalized tournament", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const entrant = await createTournamentEntrant(app, 600);

    const emptyHistory = await request(app).get("/tournament/history").set("Authorization", `Bearer ${entrant.token}`);
    expect(emptyHistory.status).toBe(200);
    expect(emptyHistory.body.history).toEqual([]);

    await pool.query(
      `
      UPDATE tournaments
      SET draw_at_utc = NOW() - INTERVAL '1 second'
      WHERE is_active = TRUE
      `
    );
    const finalizedCount = await finalizeDueTournaments(pool, new Date());
    expect(finalizedCount).toBe(1);

    const historyResponse = await request(app).get("/tournament/history").set("Authorization", `Bearer ${entrant.token}`);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.history).toHaveLength(1);
    const row = historyResponse.body.history[0] as {
      drawAt: string;
      finalRank: number;
      playerCount: number;
      gemsAwarded: number;
    };
    expect(row.finalRank).toBe(1);
    expect(row.playerCount).toBe(1);
    expect(row.gemsAwarded).toBe(5);
    expect(typeof row.drawAt).toBe("string");
  });

  it("returns current weekly tournament state and allows entering once", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await unlockTournamentFeature(app, token, userId);

    const currentBeforeEntry = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentBeforeEntry.status).toBe(200);
    expect(currentBeforeEntry.body.hasEntered).toBe(false);
    expect(currentBeforeEntry.body.playerCount).toBe(0);
    expect(currentBeforeEntry.body.currentRank).toBeNull();
    expect(currentBeforeEntry.body.expectedRewardGems).toBeNull();
    expect(currentBeforeEntry.body.nearbyEntries).toEqual([]);
    expect(currentBeforeEntry.body.entry).toBeNull();
    expect(currentBeforeEntry.body.outstanding_result).toBeNull();
    expect(typeof currentBeforeEntry.body.drawAt).toBe("string");
    expect(currentBeforeEntry.body.isActive).toBe(true);

    const firstEnter = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(firstEnter.status).toBe(200);
    expect(firstEnter.body.enteredNow).toBe(true);
    expect(firstEnter.body.tournament.hasEntered).toBe(true);
    expect(firstEnter.body.tournament.playerCount).toBe(1);
    expect(firstEnter.body.tournament.currentRank).toBe(1);
    expect(firstEnter.body.tournament.expectedRewardGems).toBe(5);
    expect(firstEnter.body.tournament.nearbyEntries).toHaveLength(1);
    expect(firstEnter.body.tournament.nearbyEntries[0].rank).toBe(1);
    expect(firstEnter.body.tournament.nearbyEntries[0].userId).toBe(userId);
    expect(firstEnter.body.tournament.nearbyEntries[0].isCurrentPlayer).toBe(true);
    expect(firstEnter.body.tournament.entry.enteredAt).toBeTypeOf("string");

    const secondEnter = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(secondEnter.status).toBe(200);
    expect(secondEnter.body.enteredNow).toBe(false);
    expect(secondEnter.body.tournament.hasEntered).toBe(true);

    const entryCountResult = await pool.query<{ entry_count: string }>(
      `
      SELECT COUNT(*) AS entry_count
      FROM tournament_entries
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(Number(entryCountResult.rows[0]?.entry_count ?? 0)).toBe(1);
  });

  it("returns top players on GET /tournament/current when the viewer has not entered", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");

    const entrantA = await createTournamentEntrant(app, 5000);

    const authB = await request(app).post("/auth/anonymous");
    expect(authB.status).toBe(201);
    const tokenB = authB.body.token as string;
    const userIdB = authB.body.userId as string;
    await unlockTournamentFeature(app, tokenB, userIdB);

    const currentB = await request(app).get("/tournament/current").set("Authorization", `Bearer ${tokenB}`);
    expect(currentB.status).toBe(200);
    expect(currentB.body.hasEntered).toBe(false);
    expect(currentB.body.playerCount).toBe(1);
    expect(currentB.body.nearbyEntries).toHaveLength(1);
    expect(currentB.body.nearbyEntries[0].rank).toBe(1);
    expect(currentB.body.nearbyEntries[0].userId).toBe(entrantA.userId);
    expect(currentB.body.nearbyEntries[0].isCurrentPlayer).toBe(false);
    expect(userIdB).not.toBe(entrantA.userId);
  });

  it("returns 20 tournament players above and below the current player rank", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");

    const entrants: Array<{ userId: string; token: string }> = [];
    for (let i = 0; i < 45; i += 1) {
      entrants.push(await createTournamentEntrant(app, 5000 - i * 10));
    }
    const middleEntrant = entrants[22];

    const currentTournamentResponse = await request(app)
      .get("/tournament/current")
      .set("Authorization", `Bearer ${middleEntrant.token}`);
    expect(currentTournamentResponse.status).toBe(200);
    expect(currentTournamentResponse.body.currentRank).toBe(23);
    expect(currentTournamentResponse.body.nearbyEntries).toHaveLength(41);
    expect(currentTournamentResponse.body.nearbyEntries[0].rank).toBe(3);
    expect(currentTournamentResponse.body.nearbyEntries[40].rank).toBe(43);

    const currentPlayerEntry = currentTournamentResponse.body.nearbyEntries.find(
      (entry: { isCurrentPlayer: boolean }) => entry.isCurrentPlayer
    );
    expect(currentPlayerEntry).toBeDefined();
    expect(currentPlayerEntry.rank).toBe(23);
    expect(currentPlayerEntry.userId).toBe(middleEntrant.userId);
    expect(typeof currentPlayerEntry.username).toBe("string");
  });

  it("finalizes tournament rankings with NTILE rewards and avoids double-awarding", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const entrants: Array<{ userId: string; token: string }> = [];
    const idleSeconds = [600, 500, 400, 300, 200, 100];
    for (const seconds of idleSeconds) {
      entrants.push(await createTournamentEntrant(app, seconds));
    }

    await pool.query(
      `
      UPDATE tournaments
      SET draw_at_utc = NOW() - INTERVAL '1 second'
      WHERE is_active = TRUE
      `
    );
    const finalizedCount = await finalizeDueTournaments(pool, new Date());
    expect(finalizedCount).toBe(1);

    const rankingResult = await pool.query<{
      user_id: string;
      final_rank: string;
      time_score_seconds: string;
      gems_awarded: string;
    }>(
      `
      SELECT user_id, final_rank, time_score_seconds, gems_awarded
      FROM tournament_entries
      WHERE final_rank IS NOT NULL
      ORDER BY final_rank ASC
      `
    );
    expect(rankingResult.rows).toHaveLength(6);
    expect(rankingResult.rows.map((row) => Number(row.gems_awarded))).toEqual([5, 5, 4, 3, 2, 1]);
    expect(rankingResult.rows.map((row) => Number(row.final_rank))).toEqual([1, 2, 3, 4, 5, 6]);

    const finalizedTournamentIdResult = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM tournaments
      WHERE finalized_at IS NOT NULL
      ORDER BY finalized_at DESC, id DESC
      LIMIT 1
      `
    );
    const finalizedTournamentId = Number(finalizedTournamentIdResult.rows[0]?.id ?? 0);

    const gemsBeforeCollect = await pool.query<{ user_id: string; time_gems_total: string }>(
      `
      SELECT ps.user_id, ps.time_gems_total
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      `,
      [finalizedTournamentId]
    );
    expect(gemsBeforeCollect.rows.every((row) => Number(row.time_gems_total) === 0)).toBe(true);

    const tokenByUserId = new Map<string, string>();
    for (const entrant of entrants) {
      tokenByUserId.set(entrant.userId, entrant.token);
    }

    for (const row of rankingResult.rows) {
      const token = tokenByUserId.get(row.user_id);
      expect(token).toBeTruthy();
      const collectResponse = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token!}`);
      expect(collectResponse.status).toBe(200);
      expect(collectResponse.body.gemsCollected).toBe(Number(row.gems_awarded));
      const dupCollect = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token!}`);
      expect(dupCollect.status).toBe(400);
      expect(dupCollect.body.code).toBe("NO_TOURNAMENT_REWARD_TO_COLLECT");
    }

    const gemsResult = await pool.query<{ user_id: string; time_gems_total: string }>(
      `
      SELECT ps.user_id, ps.time_gems_total
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      ORDER BY ps.time_gems_total DESC, ps.user_id ASC
      `,
      [finalizedTournamentId]
    );
    expect(gemsResult.rows.map((row) => Number(row.time_gems_total))).toEqual([5, 5, 4, 3, 2, 1]);

    const finalizedAgain = await finalizeDueTournaments(pool, new Date());
    expect(finalizedAgain).toBe(0);
    const gemSumResult = await pool.query<{ total_gems: string }>(
      `
      SELECT COALESCE(SUM(ps.time_gems_total), 0) AS total_gems
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      `,
      [finalizedTournamentId]
    );
    expect(Number(gemSumResult.rows[0]?.total_gems ?? 0)).toBe(20);

    await pool.query(
      `
      UPDATE player_states
      SET
        current_seconds = 0,
        idle_time_total = 0,
        idle_time_available = 0
      WHERE user_id = ANY($1::uuid[])
      `,
      [entrants.map((entrant) => entrant.userId)]
    );
  });

  it("debug-finalizes current tournament early and recreates with same draw_at_utc", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await unlockTournamentFeature(app, token, userId);
    const currentBefore = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentBefore.status).toBe(200);
    const drawAtBefore = currentBefore.body.drawAt as string;

    const activeBefore = await pool.query<{ id: string }>(`SELECT id FROM tournaments WHERE is_active = TRUE LIMIT 1`);
    const tournamentIdBefore = Number(activeBefore.rows[0]?.id);

    const enterResponse = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterResponse.status).toBe(200);

    const debugResponse = await request(app)
      .post("/tournament/debug/finalize-current")
      .set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.ok).toBe(true);
    expect(debugResponse.body.finalizedTournamentId).toBe(tournamentIdBefore);
    expect(debugResponse.body.newTournamentId).not.toBe(tournamentIdBefore);
    expect(debugResponse.body.drawAtUtc).toBe(drawAtBefore);
    expect(debugResponse.body.entryCount).toBe(1);

    const activeAfter = await pool.query<{ id: string; draw_at_utc: Date }>(
      `SELECT id, draw_at_utc FROM tournaments WHERE is_active = TRUE LIMIT 1`
    );
    expect(Number(activeAfter.rows[0]?.id)).toBe(debugResponse.body.newTournamentId);
    expect(activeAfter.rows[0]?.draw_at_utc.toISOString()).toBe(drawAtBefore);

    const finalizedRow = await pool.query<{ finalized_at: Date | null }>(
      `SELECT finalized_at FROM tournaments WHERE id = $1`,
      [tournamentIdBefore]
    );
    expect(finalizedRow.rows[0]?.finalized_at).not.toBeNull();

    const gemsRowAfterFinalize = await pool.query<{ time_gems_total: string; time_gems_available: string }>(
      `SELECT time_gems_total, time_gems_available FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(gemsRowAfterFinalize.rows[0]?.time_gems_total)).toBe(0);
    expect(Number(gemsRowAfterFinalize.rows[0]?.time_gems_available)).toBe(0);

    const currentAfterFinalize = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentAfterFinalize.status).toBe(200);
    expect(currentAfterFinalize.body.outstanding_result).toBeTruthy();
    expect(currentAfterFinalize.body.outstanding_result.gemsAwarded).toBe(5);
    expect(currentAfterFinalize.body.outstanding_result.playerCount).toBe(1);

    const homeAfterFinalize = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfterFinalize.body.tournament?.outstanding_result?.gemsAwarded).toBe(5);

    const enterAfterFinalize = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterAfterFinalize.status).toBe(409);
    expect(enterAfterFinalize.body.code).toBe("TOURNAMENT_REWARD_UNCOLLECTED");

    const collectResponse = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body.gemsCollected).toBe(5);

    const gemsRow = await pool.query<{ time_gems_total: string; time_gems_available: string }>(
      `SELECT time_gems_total, time_gems_available FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(gemsRow.rows[0]?.time_gems_total)).toBe(5);
    expect(Number(gemsRow.rows[0]?.time_gems_available)).toBe(5);
  });

  it("computes next tournament draw at Sunday 00:00 UTC", () => {
    const mondayUtc = new Date("2026-04-20T10:00:00.000Z");
    const nextFromMonday = getNextTournamentDrawAt(mondayUtc);
    expect(nextFromMonday.toISOString()).toBe("2026-04-26T00:00:00.000Z");

    const sundayAfterMidnightUtc = new Date("2026-04-26T04:30:00.000Z");
    const nextFromSunday = getNextTournamentDrawAt(sundayAfterMidnightUtc);
    expect(nextFromSunday.toISOString()).toBe("2026-05-03T00:00:00.000Z");
  });

  it("returns anonymous account info for bearer users", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const accountResponse = await request(app).get("/account").set("Authorization", `Bearer ${token}`);
    expect(accountResponse.status).toBe(200);
    expect(accountResponse.body.isAnonymous).toBe(true);
    expect(accountResponse.body.canUpgrade).toBe(true);
    expect(accountResponse.body.username).toBeTypeOf("string");
    expect(accountResponse.body.username.length).toBeGreaterThan(0);
  });

  it("registers and logs in with cookie sessions", async () => {
    const app = createApp(pool, config);
    const email = uniqueEmail();
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Test User",
      email,
      password: "password1234"
    });
    expect(registerResponse.status).toBe(200);

    const accountResponse = await request(app).get("/account").set("Cookie", registerResponse.headers["set-cookie"] ?? []);
    expect(accountResponse.status).toBe(200);
    expect(accountResponse.body.isAnonymous).toBe(false);
    expect(accountResponse.body.email).toBe(email);
    expect(accountResponse.body.username).toBeTypeOf("string");
    expect(accountResponse.body.username.length).toBeGreaterThan(0);
    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [accountResponse.body.gameUserId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual(["account_creation"]);

    const loginResponse = await request(app).post("/auth/login").send({
      email,
      password: "password1234"
    });
    expect(loginResponse.status).toBe(200);

    const playerResponse = await request(app).get("/player").set("Cookie", loginResponse.headers["set-cookie"] ?? []);
    expect(playerResponse.status).toBe(200);
  });

  it("blocks email/password auth when email is social-login only", async () => {
    const app = createApp(pool, config);
    const socialEmail = uniqueEmail();
    const socialAuthUserId = randomUUID();

    await pool.query(
      `
      INSERT INTO "user" (id, name, email, "emailVerified")
      VALUES ($1, $2, $3, TRUE)
      `,
      [socialAuthUserId, "Social User", socialEmail]
    );
    await pool.query(
      `
      INSERT INTO "account" (id, "userId", "accountId", "providerId")
      VALUES ($1, $2, $3, 'google')
      `,
      [randomUUID(), socialAuthUserId, `google-${socialAuthUserId}`]
    );

    const loginResponse = await request(app).post("/auth/login").send({
      email: socialEmail,
      password: "password1234"
    });
    expect(loginResponse.status).toBe(400);
    expect(loginResponse.body.error).toContain("social sign-in");

    const registerResponse = await request(app).post("/auth/register").send({
      name: "Trying Password Signup",
      email: socialEmail,
      password: "password1234"
    });
    expect(registerResponse.status).toBe(400);
    expect(registerResponse.body.error).toContain("social sign-in");
  });

  it("links multiple auth identities to one game user by email", async () => {
    const primaryAuthUserId = randomUUID();
    const secondaryAuthUserId = randomUUID();
    const canonicalEmail = uniqueEmail();
    const alternateCaseEmail = canonicalEmail.toUpperCase();

    await pool.query(
      `
      INSERT INTO "user" (id, name, email, "emailVerified")
      VALUES ($1, $2, $3, TRUE), ($4, $5, $6, TRUE)
      `,
      [primaryAuthUserId, "Credential User", canonicalEmail, secondaryAuthUserId, "Google User", alternateCaseEmail]
    );

    const client = await pool.connect();
    try {
      const firstGameUserId = await ensureGameIdentityForAuthUser(client, primaryAuthUserId, canonicalEmail);
      const secondGameUserId = await ensureGameIdentityForAuthUser(client, secondaryAuthUserId, alternateCaseEmail);
      expect(secondGameUserId).toBe(firstGameUserId);
    } finally {
      client.release();
    }

    const identityRows = await pool.query<{ auth_user_id: string; game_user_id: string }>(
      `
      SELECT auth_user_id, game_user_id
      FROM auth_identities
      WHERE auth_user_id IN ($1, $2)
      ORDER BY auth_user_id
      `,
      [primaryAuthUserId, secondaryAuthUserId]
    );
    expect(identityRows.rows).toHaveLength(2);
    expect(identityRows.rows[0].game_user_id).toBe(identityRows.rows[1].game_user_id);
  });

  it("awards account creation achievement on anonymous upgrade", async () => {
    const app = createApp(pool, config);
    const anonymousAuth = await request(app).post("/auth/anonymous");
    const token = anonymousAuth.body.token as string;
    const userId = anonymousAuth.body.userId as string;

    const upgradeResponse = await request(app).post("/account/upgrade").set("Authorization", `Bearer ${token}`).send({
      name: "Upgraded User",
      email: uniqueEmail(),
      password: "password1234"
    });
    expect(upgradeResponse.status).toBe(200);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual(["account_creation"]);
  });

  it("blocks anonymous upgrade when email belongs to another player", async () => {
    const app = createApp(pool, config);

    const existingEmail = uniqueEmail();
    const existingRegisterResponse = await request(app).post("/auth/register").send({
      name: "Existing Email Owner",
      email: existingEmail,
      password: "password1234"
    });
    expect(existingRegisterResponse.status).toBe(200);

    const anonymousAuth = await request(app).post("/auth/anonymous");
    const token = anonymousAuth.body.token as string;
    const anonymousUserId = anonymousAuth.body.userId as string;

    const upgradeResponse = await request(app).post("/account/upgrade").set("Authorization", `Bearer ${token}`).send({
      name: "Anonymous Upgrade Attempt",
      email: existingEmail,
      password: "password1234"
    });
    expect(upgradeResponse.status).toBe(409);
    expect(upgradeResponse.body.code).toBe("EMAIL_ALREADY_IN_USE");

    const anonymousUserEmail = await pool.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [anonymousUserId]);
    expect(anonymousUserEmail.rows[0]?.email).toBeNull();
  });

  it("hard-fails Google upgrade when social account is already linked to another player", async () => {
    const app = createApp(pool, config);
    const firstAnonymous = await request(app).post("/auth/anonymous");
    const secondAnonymous = await request(app).post("/auth/anonymous");

    const upgradeToken = firstAnonymous.body.token as string;
    const upgradeUserId = firstAnonymous.body.userId as string;
    const linkedUserId = secondAnonymous.body.userId as string;

    const socialEmail = uniqueEmail();
    const socialRegisterResponse = await request(app).post("/auth/register").send({
      name: "Existing Google User",
      email: socialEmail,
      password: "password1234"
    });
    expect(socialRegisterResponse.status).toBe(200);

    const socialAuthUserResult = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM "user"
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [socialEmail]
    );
    const socialAuthUserId = socialAuthUserResult.rows[0]?.id;
    expect(socialAuthUserId).toBeTruthy();
    await pool.query(
      `
      INSERT INTO auth_identities (auth_user_id, game_user_id)
      VALUES ($1, $2)
      ON CONFLICT (auth_user_id)
      DO UPDATE SET game_user_id = EXCLUDED.game_user_id
      `,
      [socialAuthUserId, linkedUserId]
    );

    const response = await request(app)
      .post("/account/upgrade/social/complete")
      .set("Authorization", `Bearer ${upgradeToken}`)
      .set("Cookie", socialRegisterResponse.headers["set-cookie"] ?? []);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SOCIAL_ACCOUNT_ALREADY_LINKED");

    const untouchedAnonymous = await pool.query<{ is_anonymous: boolean; email: string | null }>(
      `SELECT is_anonymous, email FROM users WHERE id = $1`,
      [upgradeUserId]
    );
    expect(untouchedAnonymous.rows[0]?.is_anonymous).toBe(true);
    expect(untouchedAnonymous.rows[0]?.email).toBeNull();
  });

  it("updates username for registered users", async () => {
    const app = createApp(pool, config);
    const email = uniqueEmail();
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Registered User",
      email,
      password: "password1234"
    });
    expect(registerResponse.status).toBe(200);

    const cookies = registerResponse.headers["set-cookie"] ?? [];
    const updateResponse = await request(app).post("/account/username").set("Cookie", cookies).send({
      username: "NewUsername123"
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.username).toBe("NewUsername123");

    const accountResponse = await request(app).get("/account").set("Cookie", cookies);
    expect(accountResponse.status).toBe(200);
    expect(accountResponse.body.username).toBe("NewUsername123");

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
    }>(`SELECT achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [accountResponse.body.gameUserId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(2);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels).sort()).toEqual(
      ["account_creation", "username_selected"].sort()
    );
  });

  it("updates username for anonymous users", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const updateResponse = await request(app).post("/account/username").set("Authorization", `Bearer ${token}`).send({
      username: "CantChangeMe"
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.username).toBe("CantChangeMe");
  });

  it("rejects profane usernames", async () => {
    const app = createApp(pool, config);
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Filter Test User",
      email: uniqueEmail(),
      password: "password1234"
    });
    expect(registerResponse.status).toBe(200);

    const cookies = registerResponse.headers["set-cookie"] ?? [];
    const updateResponse = await request(app).post("/account/username").set("Cookie", cookies).send({
      username: "f_u_c_k_123"
    });

    expect(updateResponse.status).toBe(400);
    expect(updateResponse.body.error).toBe("Username cannot contain profanity");
  });

  it("allows usernames in the profanity allowlist", async () => {
    const app = createApp(pool, config);
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Allowlist Test User",
      email: uniqueEmail(),
      password: "password1234"
    });
    expect(registerResponse.status).toBe(200);

    const cookies = registerResponse.headers["set-cookie"] ?? [];
    const updateResponse = await request(app).post("/account/username").set("Cookie", cookies).send({
      username: "sexy_knob"
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.username).toBe("sexy_knob");
  });

  it("returns conflict when username is already taken", async () => {
    const app = createApp(pool, config);
    const firstRegister = await request(app).post("/auth/register").send({
      name: "First User",
      email: uniqueEmail(),
      password: "password1234"
    });
    const secondRegister = await request(app).post("/auth/register").send({
      name: "Second User",
      email: uniqueEmail(),
      password: "password1234"
    });
    expect(firstRegister.status).toBe(200);
    expect(secondRegister.status).toBe(200);

    const firstCookies = firstRegister.headers["set-cookie"] ?? [];
    const secondCookies = secondRegister.headers["set-cookie"] ?? [];

    const firstUpdate = await request(app).post("/account/username").set("Cookie", firstCookies).send({
      username: "SharedUsername"
    });
    expect(firstUpdate.status).toBe(200);

    const secondUpdate = await request(app).post("/account/username").set("Cookie", secondCookies).send({
      username: "sharedusername"
    });
    expect(secondUpdate.status).toBe(409);
    expect(secondUpdate.body.code).toBe("USERNAME_TAKEN");
  });

  it("requires authentication for achievements", async () => {
    const app = createApp(pool, config);
    const response = await request(app).get("/achievements");

    expect(response.status).toBe(401);
  });

  it("returns achievements scaffold payload", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const response = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.completedCount).toBe(0);
    expect(response.body.earningsBonusMultiplier).toBe(1);
    expect(response.body.achievements).toHaveLength(11);
    expect(response.body.achievements[0].id).toBe("account_creation");
    expect(response.body.achievements[1].id).toBe("username_selected");
    expect(response.body.achievements[2].id).toBe("beginner_shopper");
    expect(response.body.achievements[2].maxLevel).toBe(3);
    expect(response.body.achievements[3].id).toBe("real_time_collector_65_minutes");
    expect(response.body.achievements[3].maxLevel).toBe(7);
    expect(response.body.achievements[3].level).toBe(0);
    expect(response.body.achievements[4].id).toBe("idle_time_collector");
    expect(response.body.achievements[4].maxLevel).toBe(6);
    expect(response.body.achievements[4].level).toBe(0);
    expect(response.body.achievements[5].id).toBe("real_time_streak");
    expect(response.body.achievements[5].maxLevel).toBe(5);
    expect(response.body.achievements[5].level).toBe(0);
    expect(response.body.achievements[6].id).toBe("collection_count");
    expect(response.body.achievements[7].id).toBe("contemplation");
    expect(response.body.achievements[7].clientDriven).toBe(true);
    expect(response.body.achievements[8].id).toBe("reward_skipper");
    expect(response.body.achievements[8].clientDriven).toBe(false);
    expect(response.body.achievements[9].id).toBe("gem_hoarder");
    expect(response.body.achievements[9].clientDriven).toBe(false);
    expect(response.body.achievements[10].id).toBe("daily_bonus_collector");
    expect(response.body.achievements[10].maxLevel).toBe(5);
    expect(response.body.achievements[10].level).toBe(0);
    const collectionAchievement = response.body.achievements.find((achievement: { id: string }) => achievement.id === "collection_count");
    expect(collectionAchievement?.level).toBe(0);
    expect(collectionAchievement?.maxLevel).toBe(3);
    expect(collectionAchievement?.completed).toBe(false);
  });

  it("grants client-driven achievements from the achievements endpoint", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    const grantResponse = await request(app)
      .post("/achievements/grant")
      .set("Authorization", `Bearer ${token}`)
      .send({ achievementId: "contemplation" });
    expect(grantResponse.status).toBe(204);

    const achievementState = await pool.query<{
      achievement_count: string | number;
      achievement_levels: unknown;
      has_unseen_achievements: boolean;
    }>(
      `SELECT achievement_count, achievement_levels, has_unseen_achievements FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual(["contemplation"]);
    expect(parseAchievementLevels(achievementState.rows[0]?.achievement_levels)).toMatchObject([
      { id: "contemplation", level: 1 }
    ]);
    expect(achievementState.rows[0]?.has_unseen_achievements).toBe(true);
  });

  it("rejects non-client-driven achievements from the grant endpoint", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const grantResponse = await request(app)
      .post("/achievements/grant")
      .set("Authorization", `Bearer ${token}`)
      .send({ achievementId: "account_creation" });
    expect(grantResponse.status).toBe(400);
    expect(grantResponse.body.code).toBe("ACHIEVEMENT_NOT_CLIENT_DRIVEN");
  });

  it("clears unseen achievements when achievements are marked seen", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET has_unseen_achievements = TRUE WHERE user_id = $1`, [userId]);

    const markSeenResponse = await request(app).post("/achievements/seen").set("Authorization", `Bearer ${token}`);
    expect(markSeenResponse.status).toBe(204);

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    expect(playerResponse.body.hasUnseenAchievements).toBe(false);

    const achievementState = await pool.query<{ has_unseen_achievements: boolean }>(
      `SELECT has_unseen_achievements FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(achievementState.rows[0]?.has_unseen_achievements).toBe(false);
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

  it("marks achievements from stored achievement_levels", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        achievement_count = 1,
        achievement_levels = $2::jsonb
      WHERE user_id = $1
      `,
      [userId, JSON.stringify([{ id: "account_creation", level: 1, grantedAt: "2020-01-01T00:00:00.000Z" }])]
    );

    const response = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.completedCount).toBe(1);
    expect(response.body.earningsBonusMultiplier).toBe(1);
    const accountCreation = response.body.achievements.find((achievement: { id: string }) => achievement.id === "account_creation");
    const usernameSelected = response.body.achievements.find((achievement: { id: string }) => achievement.id === "username_selected");
    expect(accountCreation?.completed).toBe(true);
    expect(accountCreation?.level).toBe(1);
    expect(accountCreation?.maxLevel).toBe(1);
    expect(usernameSelected?.completed).toBe(false);
  });

  it("preserves existing grantedAt when merging grant into achievement_levels", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const legacyGrantedAt = "2025-01-02T03:04:05.000Z";

    await pool.query(
      `
      UPDATE player_states
      SET
        achievement_count = 1,
        achievement_levels = $2::jsonb
      WHERE user_id = $1
      `,
      [userId, JSON.stringify([{ id: "account_creation", level: 1, grantedAt: legacyGrantedAt }])]
    );

    const grantResponse = await request(app)
      .post("/achievements/grant")
      .set("Authorization", `Bearer ${token}`)
      .send({ achievementId: "contemplation" });
    expect(grantResponse.status).toBe(204);

    const achievementState = await pool.query<{ achievement_levels: unknown }>(
      `SELECT achievement_levels FROM player_states WHERE user_id = $1`,
      [userId]
    );
    const levels = parseAchievementLevels(achievementState.rows[0]?.achievement_levels);
    const accountCreation = levels.find((entry) => entry.id === "account_creation");
    const contemplation = levels.find((entry) => entry.id === "contemplation");
    expect(accountCreation?.level).toBe(1);
    expect(accountCreation?.grantedAt).toBe(legacyGrantedAt);
    expect(contemplation?.level).toBe(1);
    expect(contemplation?.grantedAt.length).toBeGreaterThan(0);
  });

  it("returns top 200 ordered by total seconds collected and highlights current player when in top", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET idle_time_total = $2 WHERE user_id = $1`, [userId, 10000]);
    for (let i = 0; i < 220; i += 1) {
      await insertLeaderboardPlayer(9000 - i);
    }

    const leaderboardResponse = await request(app)
      .get("/leaderboard")
      .query({ type: "collected" })
      .set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.entries).toHaveLength(200);
    expect(leaderboardResponse.body.currentPlayer.inTop).toBe(true);
    expect(leaderboardResponse.body.currentPlayer.userId).toBe(userId);

    const currentEntry = leaderboardResponse.body.entries.find((entry: { isCurrentPlayer: boolean }) => entry.isCurrentPlayer);
    expect(currentEntry).toBeDefined();
    expect(currentEntry.rank).toBe(1);

    for (let i = 1; i < leaderboardResponse.body.entries.length; i += 1) {
      expect(leaderboardResponse.body.entries[i - 1].totalIdleSeconds).toBeGreaterThanOrEqual(
        leaderboardResponse.body.entries[i].totalIdleSeconds
      );
    }
  });

  it("returns current player rank when outside top 200 for collected leaderboard", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET idle_time_total = $2 WHERE user_id = $1`, [userId, -100]);
    for (let i = 0; i < 210; i += 1) {
      await insertLeaderboardPlayer(50000 - i);
    }

    const leaderboardResponse = await request(app)
      .get("/leaderboard")
      .query({ type: "collected" })
      .set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.entries).toHaveLength(200);
    expect(leaderboardResponse.body.entries.some((entry: { userId: string }) => entry.userId === userId)).toBe(false);
    expect(leaderboardResponse.body.currentPlayer.userId).toBe(userId);
    expect(leaderboardResponse.body.currentPlayer.inTop).toBe(false);
    expect(leaderboardResponse.body.currentPlayer.rank).toBeGreaterThan(200);
  });

  it("returns public leaderboard without current player when unauthenticated", async () => {
    const app = createApp(pool, config);
    for (let i = 0; i < 3; i += 1) {
      await insertLeaderboardPlayer(1000 - i);
    }

    const leaderboardResponse = await request(app).get("/leaderboard").query({ type: "collected" });
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.entries.length).toBeGreaterThan(0);
    expect(leaderboardResponse.body.entries.length).toBeLessThanOrEqual(200);
    expect(leaderboardResponse.body.currentPlayer).toBeNull();
    expect(leaderboardResponse.body.entries.every((entry: { isCurrentPlayer: boolean }) => entry.isCurrentPlayer === false)).toBe(true);
  });

  it("uses current seconds as default leaderboard type", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `UPDATE player_states SET idle_time_total = $2, last_collected_at = NOW() - INTERVAL '48 hours' WHERE user_id = $1`,
      [userId, 0]
    );
    await insertLeaderboardPlayer(0, 490);
    await insertLeaderboardPlayer(5000, 10);

    const leaderboardResponse = await request(app).get("/leaderboard").set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.type).toBe("current");
    expect(leaderboardResponse.body.entries[0].userId).toBe(userId);
    expect(leaderboardResponse.body.entries[0].totalIdleSeconds).toBeGreaterThan(5000);
  });

  it("refreshes stored current idle for the authenticated user before ranking on current leaderboard", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `UPDATE player_states SET current_seconds = 999999, last_collected_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    const leaderboardResponse = await request(app)
      .get("/leaderboard")
      .query({ type: "current" })
      .set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.currentPlayer.totalIdleSeconds).toBeLessThan(999999);

    const storedResult = await pool.query<{ current_seconds: string }>(
      `SELECT current_seconds FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(storedResult.rows[0]?.current_seconds ?? 0)).toBe(leaderboardResponse.body.currentPlayer.totalIdleSeconds);
  });

  it("returns leaderboard ordered by time_gems_total when type is time_gems", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET time_gems_total = $2 WHERE user_id = $1`, [userId, 999]);
    const midId = await insertLeaderboardPlayer(0, 0);
    await pool.query(`UPDATE player_states SET time_gems_total = $2 WHERE user_id = $1`, [midId, 400]);
    const lowId = await insertLeaderboardPlayer(0, 0);
    await pool.query(`UPDATE player_states SET time_gems_total = $2 WHERE user_id = $1`, [lowId, 100]);

    const leaderboardResponse = await request(app)
      .get("/leaderboard")
      .query({ type: "time_gems" })
      .set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.type).toBe("time_gems");
    expect(leaderboardResponse.body.entries[0].userId).toBe(userId);
    expect(leaderboardResponse.body.entries[0].totalIdleSeconds).toBe(999);
    expect(leaderboardResponse.body.entries[1].totalIdleSeconds).toBe(400);
    expect(leaderboardResponse.body.entries[2].totalIdleSeconds).toBe(100);
    for (let i = 1; i < leaderboardResponse.body.entries.length; i += 1) {
      expect(leaderboardResponse.body.entries[i - 1].totalIdleSeconds).toBeGreaterThanOrEqual(
        leaderboardResponse.body.entries[i].totalIdleSeconds
      );
    }
  });

  it("returns public player profile by id", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        idle_time_total = 1234,
        upgrades_purchased = 7,
        current_seconds = 0,
        last_collected_at = NOW() - INTERVAL '35 seconds',
        last_active = NOW() - INTERVAL '90 seconds',
        shop = '{"seconds_multiplier": 0}'::jsonb
      WHERE user_id = $1
      `,
      [userId]
    );

    const profileResponse = await request(app).get(`/players/${userId}`);
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.player.id).toBe(userId);
    expect(profileResponse.body.player.username).toBeTypeOf("string");
    expect(profileResponse.body.player.username.length).toBeGreaterThan(0);
    expect(profileResponse.body.player.accountAgeSeconds).toBeTypeOf("number");
    expect(profileResponse.body.player.accountAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(profileResponse.body.player.currentIdleSeconds).toBeGreaterThanOrEqual(calculateIdleSecondsGain(25));
    expect(profileResponse.body.player.currentIdleSeconds).toBeLessThanOrEqual(calculateIdleSecondsGain(50));
    expect(profileResponse.body.player.idleTime.total).toBe(1234);
    expect(profileResponse.body.player.upgradesPurchased).toBe(7);
    expect(profileResponse.body.player.achievementCount).toBe(0);
    expect(profileResponse.body.player.timeAwaySeconds).toBeGreaterThanOrEqual(85);
    expect(profileResponse.body.player.timeAwaySeconds).toBeLessThanOrEqual(120);
    expect(profileResponse.body.meta.serverTime).toBeTypeOf("string");
  });

  it("returns 400 for invalid public player profile id", async () => {
    const app = createApp(pool, config);

    const profileResponse = await request(app).get("/players/not-a-uuid");
    expect(profileResponse.status).toBe(400);
  });

  it("returns 404 when public player profile does not exist", async () => {
    const app = createApp(pool, config);

    const profileResponse = await request(app).get(`/players/${randomUUID()}`);
    expect(profileResponse.status).toBe(404);
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
    const expectedCurrent = Math.floor(calculateIdleSecondsGain(120) * 1.5);
    expect(playerResponse.body.currentSeconds).toBe(expectedCurrent);
    expect(playerResponse.body.secondsMultiplier).toBe(1.5);
    expect(playerResponse.body.achievementBonusMultiplier).toBe(1);
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
    const expectedCurrent = Math.floor(calculateIdleSecondsGain(120) * (1 + 0.02 * 2));
    expect(playerResponse.body.currentSeconds).toBe(expectedCurrent);
    expect(playerResponse.body.achievementBonusMultiplier).toBeCloseTo(1.04, 5);
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
      calculateIdleSecondsGain(120) * getRestraintBonusMultiplier({ ...DEFAULT_SHOP_STATE, restraint: 1 })
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
    const restraintBonus = getRestraintBonusMultiplier({ ...DEFAULT_SHOP_STATE, restraint: 1 });
    const expectedCurrent = Math.floor(calculateIdleSecondsGain(7200) * restraintBonus);
    expect(playerResponse.body.currentSeconds).toBeGreaterThanOrEqual(expectedCurrent);
    expect(playerResponse.body.currentSeconds).toBeLessThanOrEqual(Math.floor(calculateIdleSecondsGain(7220) * restraintBonus));
  });

  it("allows purchasing seconds multiplier upgrades", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET idle_time_available = 10000 WHERE user_id = $1`, [userId]);

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "seconds_multiplier", quantity: 5 });

    expect(purchaseResponse.status).toBe(200);
    const fiveLevelCost = SECONDS_MULTIPLIER_SHOP_UPGRADE.levels.slice(0, 5).reduce((sum, level) => sum + level.cost, 0);
    expect(purchaseResponse.body.purchase.totalCost).toBe(fiveLevelCost);
    expect(purchaseResponse.body.idleTime.available).toBe(10000 - fiveLevelCost);
    expect(purchaseResponse.body.upgradesPurchased).toBe(5);
    expect(purchaseResponse.body.secondsMultiplier).toBe(1.25);
    expect(purchaseResponse.body.achievementBonusMultiplier).toBe(1);

    const achievementState = await pool.query<{
      upgrades_purchased: string;
      achievement_count: string;
      achievement_levels: unknown;
    }>(`SELECT upgrades_purchased, achievement_count, achievement_levels FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.upgrades_purchased)).toBe(5);
    expect(Number(achievementState.rows[0]?.achievement_count)).toBe(1);
    expect(achievementIdsFromLevels(achievementState.rows[0]?.achievement_levels)).toEqual(["beginner_shopper"]);
  });

  it("allows purchasing restraint upgrade up to max level", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET real_time_available = 500000 WHERE user_id = $1`, [userId]);

    for (let level = 1; level <= 5; level += 1) {
      const purchaseResponse = await request(app)
        .post("/shop/purchase")
        .set("Authorization", `Bearer ${token}`)
        .send({ upgradeType: "restraint" });
      expect(purchaseResponse.status).toBe(200);
      expect(purchaseResponse.body.purchase.upgradeType).toBe("restraint");
      expect(purchaseResponse.body.purchase.quantity).toBe(1);
      expect(purchaseResponse.body.shop.restraint).toBe(level);
    }

    const maxedPurchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "restraint" });
    expect(maxedPurchaseResponse.status).toBe(400);
    expect(maxedPurchaseResponse.body.code).toBe("ALREADY_OWNED");
  });

  it("allows purchasing idle hoarder upgrade up to max level using real time", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET real_time_available = 200000 WHERE user_id = $1`, [userId]);

    for (let level = 1; level <= 5; level += 1) {
      const purchaseResponse = await request(app)
        .post("/shop/purchase")
        .set("Authorization", `Bearer ${token}`)
        .send({ upgradeType: "idle_hoarder" });
      expect(purchaseResponse.status).toBe(200);
      expect(purchaseResponse.body.purchase.upgradeType).toBe("idle_hoarder");
      expect(purchaseResponse.body.purchase.quantity).toBe(1);
      expect(purchaseResponse.body.shop.idle_hoarder).toBe(level);
    }

    const maxedPurchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "idle_hoarder" });
    expect(maxedPurchaseResponse.status).toBe(400);
    expect(maxedPurchaseResponse.body.code).toBe("ALREADY_OWNED");
  });

  it("purchases extra_realtime_wait for 1 gem and shifts last_collected_at back 6h", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `UPDATE player_states
       SET
         time_gems_available = 2,
         time_gems_total = 2,
         last_collected_at = NOW() - INTERVAL '1000 seconds',
         current_seconds = 0,
         current_seconds_last_updated = NOW() - INTERVAL '1000 seconds',
         shop = '{"seconds_multiplier": 0, "restraint": 0, "luck": 0}'::jsonb
       WHERE user_id = $1`,
      [userId]
    );

    const before = await pool.query<{ last_collected_at: Date }>(
      `SELECT last_collected_at FROM player_states WHERE user_id = $1`,
      [userId]
    );
    const beforeLastMs = before.rows[0]!.last_collected_at.getTime();

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "extra_realtime_wait" });

    expect(purchaseResponse.status).toBe(200);
    expect(purchaseResponse.body.purchase.upgradeType).toBe("extra_realtime_wait");
    expect(purchaseResponse.body.purchase.totalCost).toBe(1);
    expect(purchaseResponse.body.purchase.quantity).toBe(1);
    expect(purchaseResponse.body.timeGems.available).toBe(1);
    const expectedCurrent = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 1000 + 6 * 60 * 60,
      shop: DEFAULT_SHOP_STATE,
      achievementCount: purchaseResponse.body.achievementCount
    });
    expect(purchaseResponse.body.currentSeconds).toBe(expectedCurrent);

    const after = await pool.query<{ last_collected_at: Date }>(
      `SELECT last_collected_at FROM player_states WHERE user_id = $1`,
      [userId]
    );
    const afterLastMs = after.rows[0]!.last_collected_at.getTime();
    expect(afterLastMs - beforeLastMs).toBe(-6 * 60 * 60 * 1000);
  });

  it("allows purchasing luck upgrade up to max level", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    // LUCK_SHOP_UPGRADE idle costs: 7d + 14d + 28d + 56d + 365d of seconds (final tier is 31_536_000).
    await pool.query(`UPDATE player_states SET idle_time_available = 50000000 WHERE user_id = $1`, [userId]);

    for (let level = 1; level <= 5; level += 1) {
      const purchaseResponse = await request(app)
        .post("/shop/purchase")
        .set("Authorization", `Bearer ${token}`)
        .send({ upgradeType: "luck" });
      expect(purchaseResponse.status).toBe(200);
      expect(purchaseResponse.body.purchase.upgradeType).toBe("luck");
      expect(purchaseResponse.body.purchase.quantity).toBe(1);
      expect(purchaseResponse.body.shop.luck).toBe(level);
    }

    const maxedPurchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "luck" });
    expect(maxedPurchaseResponse.status).toBe(400);
    expect(maxedPurchaseResponse.body.code).toBe("ALREADY_OWNED");
  });

  it("resets shop to default and refunds spent idle and real time", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        time_gems_available = 2,
        time_gems_total = 2,
        idle_time_available = 100,
        real_time_available = 200,
        shop = '{"seconds_multiplier": 2, "restraint": 1, "luck": 1, "collect_gem_time_boost": 3}'::jsonb
      WHERE user_id = $1
      `,
      [userId]
    );

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "purchase_refund" });

    expect(purchaseResponse.status).toBe(200);
    expect(purchaseResponse.body.purchase.upgradeType).toBe("purchase_refund");
    expect(purchaseResponse.body.purchase.quantity).toBe(1);
    expect(purchaseResponse.body.purchase.totalCost).toBe(1);
    expect(purchaseResponse.body.timeGems.available).toBe(1);
    const refundedIdle = SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(0) + SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(1) + LUCK_SHOP_UPGRADE.costAtLevel(0);
    expect(purchaseResponse.body.idleTime.available).toBe(100 + refundedIdle);
    expect(purchaseResponse.body.realTime.available).toBe(200 + RESTRAINT_SHOP_UPGRADE.costAtLevel(0));
    expect(purchaseResponse.body.shop).toEqual({
      another_seconds_multiplier: 0,
      seconds_multiplier: 0,
      patience: 0,
      restraint: 0,
      idle_hoarder: 0,
      luck: 0,
      worthwhile_achievements: 0,
      collect_gem_time_boost: 0,
      daily_bonus_feature: 0,
      tournament_feature: 0,
      storage_extension: 0
    });
  });

  it("rejects purchase_refund when no refundable upgrades are active", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        time_gems_available = 2,
        time_gems_total = 2,
        shop = '{"seconds_multiplier": 0, "restraint": 0, "luck": 0, "collect_gem_time_boost": 4}'::jsonb
      WHERE user_id = $1
      `,
      [userId]
    );

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "purchase_refund" });

    expect(purchaseResponse.status).toBe(400);
    expect(purchaseResponse.body.code).toBe("NO_REFUNDABLE_PURCHASES");
  });

  it("adds 5 gems with debug endpoint in non-production config", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET time_gems_total = 1, time_gems_available = 1 WHERE user_id = $1`, [userId]);

    const debugResponse = await request(app).post("/shop/debug/add-gems").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.timeGems.total).toBe(6);
    expect(debugResponse.body.timeGems.available).toBe(6);
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

  it("does not register debug gems endpoint in production config", async () => {
    const app = createApp(pool, { ...config, isProduction: true });
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const debugResponse = await request(app).post("/shop/debug/add-gems").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(404);
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

  it("does not register tournament debug finalize endpoint in production config", async () => {
    const app = createApp(pool, { ...config, isProduction: true });
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const debugResponse = await request(app)
      .post("/tournament/debug/finalize-current")
      .set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(404);
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
      expect(collectResponse.body.collectedSeconds).toBeGreaterThanOrEqual(calculateIdleSecondsGain(120));
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

  it("rejects shop purchases when funds are insufficient", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET idle_time_available = 4 WHERE user_id = $1`, [userId]);

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "seconds_multiplier", quantity: 1 });

    expect(purchaseResponse.status).toBe(400);
    expect(purchaseResponse.body.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("syncs only the stalest players up to the batch size", async () => {
    const baselineCurrentSeconds = 10;
    const totalPlayers = 105;
    const ageByUserId = new Map<string, number>();
    const now = new Date();

    for (let i = 0; i < totalPlayers; i += 1) {
      const userId = await insertLeaderboardPlayer(0, baselineCurrentSeconds);
      const ageSeconds = i + 1;
      ageByUserId.set(userId, ageSeconds);
      await pool.query(
        `
        UPDATE player_states
        SET
          achievement_count = 0,
          shop = '{"seconds_multiplier": 0}'::jsonb,
          current_seconds_last_updated = $2,
          last_collected_at = $2
        WHERE user_id = $1
        `,
        [userId, new Date(now.getTime() - ageSeconds * 1000)]
      );
    }

    const updatedCount = await syncStalePlayerCurrentSeconds(pool, 100);
    expect(updatedCount).toBe(100);

    const syncedRows = await pool.query<{
      user_id: string;
      current_seconds: string;
      current_seconds_last_updated: Date;
    }>(
      `
      SELECT
        user_id,
        current_seconds,
        current_seconds_last_updated
      FROM player_states
      WHERE user_id = ANY($1)
      `,
      [[...ageByUserId.keys()]]
    );

    for (const row of syncedRows.rows) {
      const ageSeconds = ageByUserId.get(row.user_id);
      expect(ageSeconds).toBeDefined();
      const synced = Number(row.current_seconds);
      if ((ageSeconds ?? 0) <= 5) {
        expect(synced).toBe(baselineCurrentSeconds);
      } else {
        expect(synced).toBeGreaterThanOrEqual(calculateIdleSecondsGain(ageSeconds ?? 0));
        expect(synced).toBeLessThanOrEqual(calculateIdleSecondsGain((ageSeconds ?? 0) + 20));
      }
    }
  });

  it("surveys: GET /home includes availableSurvey, POST /surveys/answer grants reward, duplicate returns 409", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    expect(authResponse.status).toBe(201);
    const token = authResponse.body.token as string;

    const home = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.availableSurvey).not.toBeNull();
    expect(home.body.availableSurvey.id).toBe("1");
    expect(home.body.availableSurvey.reward).toBe(21600);
    expect(home.body.availableSurvey.currencyType).toBe("idle");

    const active = await request(app).get("/surveys/active").set("Authorization", `Bearer ${token}`);
    expect(active.status).toBe(200);
    expect(active.body.survey?.id).toBe("1");
    expect(active.body.survey?.options?.length).toBeGreaterThan(0);

    const idleBefore = home.body.player.idleTime.available as number;

    const answer = await request(app)
      .post("/surveys/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ surveyId: "1", optionId: "UI" });
    expect(answer.status).toBe(200);
    expect(answer.body.idleTime.available).toBe(idleBefore + 21600);

    const dup = await request(app)
      .post("/surveys/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ surveyId: "1", optionId: "SHOPS" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("SURVEY_ALREADY_ANSWERED");

    const homeAfter = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfter.status).toBe(200);
    expect(homeAfter.body.availableSurvey).toBeNull();
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
});
