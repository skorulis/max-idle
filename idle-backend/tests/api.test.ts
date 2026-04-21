import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, syncStalePlayerCurrentSeconds } from "../src/app.js";
import { calculateIdleSecondsGain } from "../src/idleRate.js";
import type { AppConfig } from "../src/types.js";
import { createTestPool } from "./testDb.js";

describe("auth + player lifecycle", () => {
  const config: AppConfig = {
    port: 3000,
    databaseUrl: "postgres://unused",
    jwtSecret: "test-secret",
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

  function parseAchievementIds(value: unknown): string[] {
    if (typeof value === "string") {
      return JSON.parse(value) as string[];
    }
    return Array.isArray(value) ? (value as string[]) : [];
  }

  async function insertLeaderboardPlayer(totalSecondsCollected: number, currentSeconds = 0): Promise<string> {
    const userId = randomUUID();
    const username = `lb_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await pool.query(`INSERT INTO users (id, is_anonymous, username) VALUES ($1, TRUE, $2)`, [userId, username]);
    await pool.query(`INSERT INTO player_states (user_id, total_seconds_collected, current_seconds) VALUES ($1, $2, $3)`, [
      userId,
      totalSecondsCollected,
      currentSeconds
    ]);
    return userId;
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
    expect(playerResponse.body.totalIdleSeconds).toBe(0);
    expect(playerResponse.body.collectedIdleSeconds).toBe(0);
    expect(playerResponse.body.upgradesPurchased).toBe(0);
    expect(playerResponse.body.currentSeconds).toBeGreaterThanOrEqual(0);
    expect(playerResponse.body.currentSecondsLastUpdated).toBeTypeOf("string");
    expect(playerResponse.body.lastCollectedAt).toBeTypeOf("string");
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
    expect(collectResponse.body.totalIdleSeconds).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.upgradesPurchased).toBe(0);
    expect(collectResponse.body.serverTime).toBeTypeOf("string");

    const secondCollect = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(secondCollect.status).toBe(200);
    expect(secondCollect.body.collectedSeconds).toBe(0);
  });

  it("returns anonymous account info for bearer users", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const accountResponse = await request(app).get("/account").set("Authorization", `Bearer ${token}`);
    expect(accountResponse.status).toBe(200);
    expect(accountResponse.body.isAnonymous).toBe(true);
    expect(accountResponse.body.canUpgrade).toBe(true);
    expect(accountResponse.body.username).toMatch(/^anonymous/);
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
    expect(accountResponse.body.username).toMatch(/^anonymous/);
    const achievementState = await pool.query<{
      achievement_count: string | number;
      completed_achievements: unknown;
    }>(`SELECT achievement_count, completed_achievements FROM player_states WHERE user_id = $1`, [accountResponse.body.gameUserId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(parseAchievementIds(achievementState.rows[0]?.completed_achievements)).toEqual(["account_creation"]);

    const loginResponse = await request(app).post("/auth/login").send({
      email,
      password: "password1234"
    });
    expect(loginResponse.status).toBe(200);

    const playerResponse = await request(app).get("/player").set("Cookie", loginResponse.headers["set-cookie"] ?? []);
    expect(playerResponse.status).toBe(200);
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
      completed_achievements: unknown;
    }>(`SELECT achievement_count, completed_achievements FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(parseAchievementIds(achievementState.rows[0]?.completed_achievements)).toEqual(["account_creation"]);
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
      completed_achievements: unknown;
    }>(`SELECT achievement_count, completed_achievements FROM player_states WHERE user_id = $1`, [accountResponse.body.gameUserId]);
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(2);
    expect(parseAchievementIds(achievementState.rows[0]?.completed_achievements)).toEqual([
      "account_creation",
      "username_selected"
    ]);
  });

  it("rejects username updates for anonymous users", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const updateResponse = await request(app).post("/account/username").set("Authorization", `Bearer ${token}`).send({
      username: "CantChangeMe"
    });

    expect(updateResponse.status).toBe(400);
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
    expect(response.body.totalCount).toBe(3);
    expect(response.body.earningsBonusMultiplier).toBe(1);
    expect(response.body.achievements).toHaveLength(3);
    expect(response.body.achievements[0].id).toBe("account_creation");
    expect(response.body.achievements[1].id).toBe("username_selected");
    expect(response.body.achievements[2].id).toBe("beginner_shopper");
  });

  it("marks completed achievements from stored jsonb ids", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        achievement_count = 1,
        completed_achievements = $2::jsonb
      WHERE user_id = $1
      `,
      [userId, JSON.stringify(["account_creation"])]
    );

    const response = await request(app).get("/achievements").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.completedCount).toBe(1);
    expect(response.body.earningsBonusMultiplier).toBe(1.25);
    const accountCreation = response.body.achievements.find((achievement: { id: string }) => achievement.id === "account_creation");
    const usernameSelected = response.body.achievements.find((achievement: { id: string }) => achievement.id === "username_selected");
    expect(accountCreation?.completed).toBe(true);
    expect(usernameSelected?.completed).toBe(false);
  });

  it("returns top 200 ordered by total seconds collected and highlights current player when in top", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET total_seconds_collected = $2 WHERE user_id = $1`, [userId, 10000]);
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

    await pool.query(`UPDATE player_states SET total_seconds_collected = $2 WHERE user_id = $1`, [userId, -100]);
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

  it("uses current seconds as default leaderboard type", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET current_seconds = $2, total_seconds_collected = $3 WHERE user_id = $1`, [userId, 500, 0]);
    await insertLeaderboardPlayer(0, 490);
    await insertLeaderboardPlayer(5000, 10);

    const leaderboardResponse = await request(app).get("/leaderboard").set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.type).toBe("current");
    expect(leaderboardResponse.body.entries[0].userId).toBe(userId);
    expect(leaderboardResponse.body.entries[0].totalIdleSeconds).toBe(500);
  });

  it("returns total leaderboard ordered by current plus collected", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET current_seconds = $2, total_seconds_collected = $3 WHERE user_id = $1`, [
      userId,
      400000,
      400000
    ]);
    await insertLeaderboardPlayer(1000000, 1000000); // 2000000
    await insertLeaderboardPlayer(1200000, 700000); // 1900000

    const leaderboardResponse = await request(app)
      .get("/leaderboard")
      .query({ type: "total" })
      .set("Authorization", `Bearer ${token}`);
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.type).toBe("total");
    expect(
      leaderboardResponse.body.entries.some(
        (entry: { totalIdleSeconds: number }) => entry.totalIdleSeconds === 2000000
      )
    ).toBe(true);
    expect(leaderboardResponse.body.currentPlayer.totalIdleSeconds).toBe(800000);
  });

  it("returns public player profile by id", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        total_seconds_collected = 1234,
        upgrades_purchased = 7,
        current_seconds = 200,
        current_seconds_last_updated = NOW() - INTERVAL '30 seconds',
        seconds_multiplier = 1
      WHERE user_id = $1
      `,
      [userId]
    );

    const profileResponse = await request(app).get(`/players/${userId}`);
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.player.id).toBe(userId);
    expect(profileResponse.body.player.username).toMatch(/^anonymous/);
    expect(profileResponse.body.player.accountAgeSeconds).toBeTypeOf("number");
    expect(profileResponse.body.player.accountAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(profileResponse.body.player.currentIdleSeconds).toBeGreaterThanOrEqual(230);
    expect(profileResponse.body.player.collectedIdleSeconds).toBe(1234);
    expect(profileResponse.body.player.upgradesPurchased).toBe(7);
    expect(profileResponse.body.player.achievementCount).toBe(0);
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
        seconds_multiplier = 2,
        current_seconds = 0,
        current_seconds_last_updated = NOW() - INTERVAL '120 seconds',
        last_collected_at = NOW() - INTERVAL '120 seconds'
      WHERE user_id = $1
      `,
      [userId]
    );

    const playerResponse = await request(app).get("/player").set("Authorization", `Bearer ${token}`);
    expect(playerResponse.status).toBe(200);
    const expectedCurrent = calculateIdleSecondsGain(120) * 2;
    expect(playerResponse.body.currentSeconds).toBe(expectedCurrent);
    expect(playerResponse.body.secondsMultiplier).toBe(2);
    expect(playerResponse.body.achievementBonusMultiplier).toBe(1);
  });

  it("applies achievement multiplier to generated idle gain", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(
      `
      UPDATE player_states
      SET
        achievement_count = 2,
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
    expect(playerResponse.body.achievementBonusMultiplier).toBe(1.5);
  });

  it("allows purchasing seconds multiplier upgrades", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET spendable_idle_seconds = 100 WHERE user_id = $1`, [userId]);

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "seconds_multiplier", quantity: 5 });

    expect(purchaseResponse.status).toBe(200);
    expect(purchaseResponse.body.purchase.totalCost).toBe(49);
    expect(purchaseResponse.body.collectedIdleSeconds).toBe(51);
    expect(purchaseResponse.body.upgradesPurchased).toBe(5);
    expect(purchaseResponse.body.secondsMultiplier).toBe(1.5);
    expect(purchaseResponse.body.achievementBonusMultiplier).toBe(1.25);

    const achievementState = await pool.query<{
      upgrades_purchased: string;
      achievement_count: string;
      completed_achievements: unknown;
    }>(`SELECT upgrades_purchased, achievement_count, completed_achievements FROM player_states WHERE user_id = $1`, [userId]);
    expect(Number(achievementState.rows[0]?.upgrades_purchased)).toBe(5);
    expect(Number(achievementState.rows[0]?.achievement_count)).toBe(1);
    expect(parseAchievementIds(achievementState.rows[0]?.completed_achievements)).toEqual(["beginner_shopper"]);
  });

  it("rejects shop purchases when funds are insufficient", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET spendable_idle_seconds = 4 WHERE user_id = $1`, [userId]);

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
          seconds_multiplier = 1,
          current_seconds_last_updated = $2
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
      if ((ageSeconds ?? 0) >= 6) {
        expect(Number(row.current_seconds)).toBeGreaterThan(baselineCurrentSeconds);
      } else {
        expect(Number(row.current_seconds)).toBe(baselineCurrentSeconds);
      }
    }
  });
});
