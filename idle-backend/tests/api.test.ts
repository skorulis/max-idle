import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, syncStalePlayerCurrentSeconds } from "../src/app.js";
import { ensureGameIdentityForAuthUser } from "../src/betterAuth.js";
import { calculateBoostedIdleSecondsGain} from "../src/idleRate.js";
import { createTestPool, resetTestDatabase } from "./testDb.js";
import { createTestAppConfig } from "./testAppConfig.js";
import {
  DEFAULT_SHOP_STATE,
  getShopCurrencyTierPurchaseCostSum,
  getShopPurchaseRefundTotals,
  type ShopState
} from "@maxidle/shared/shop";
import { getMaxPlayerLevel, getPlayerLevelUpgradeCostFromLevel } from "@maxidle/shared/playerLevelCosts";
import { SHOP_CURRENCY_TYPES } from "@maxidle/shared/shopUpgrades";

describe("auth + player lifecycle", () => {
  const config = createTestAppConfig();
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

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
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
    expect(profileResponse.body.player.idleTime.total).toBe(1234);
    expect(profileResponse.body.player.upgradesPurchased).toBe(7);
    expect(profileResponse.body.player.achievementCount).toBe(0);
    expect(profileResponse.body.player.level).toBe(1);
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

  it("allows purchasing seconds multiplier upgrades", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await pool.query(`UPDATE player_states SET idle_time_available = 100000 WHERE user_id = $1`, [userId]);

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "seconds_multiplier", quantity: 5 });

    expect(purchaseResponse.status).toBe(200);
    const fiveLevelCost = getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.IDLE, 0, 5);
    expect(purchaseResponse.body.purchase.totalCost).toBe(fiveLevelCost);
    expect(purchaseResponse.body.idleTime.available).toBe(100000 - fiveLevelCost);
    expect(purchaseResponse.body.upgradesPurchased).toBe(5);
    expect(purchaseResponse.body.secondsMultiplier).toBe(1.25);
    expect(purchaseResponse.body.achievementBonusMultiplier).toBe(0);

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

    await pool.query(`UPDATE player_states SET idle_time_available = 2000000 WHERE user_id = $1`, [userId]);

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

    // LUCK_SHOP_UPGRADE real-time costs: 7d + 14d + 28d + 56d + 365d of seconds (final tier is 31_536_000).
    await pool.query(`UPDATE player_states SET real_time_available = 50000000 WHERE user_id = $1`, [userId]);

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

  it("idle_refund resets idle-priced tiers and refunds idle time only", async () => {
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
      .send({ upgradeType: "idle_refund" });

    expect(purchaseResponse.status).toBe(200);
    expect(purchaseResponse.body.purchase.upgradeType).toBe("idle_refund");
    expect(purchaseResponse.body.purchase.quantity).toBe(1);
    expect(purchaseResponse.body.purchase.totalCost).toBe(1);
    expect(purchaseResponse.body.timeGems.available).toBe(1);
    const shopBeforeIdleRefund: ShopState = {
      ...DEFAULT_SHOP_STATE,
      seconds_multiplier: 2,
      restraint: 1,
      luck: 1,
      collect_gem_time_boost: 3
    };
    const refundedIdle = getShopPurchaseRefundTotals(shopBeforeIdleRefund).idle;
    expect(purchaseResponse.body.idleTime.available).toBe(100 + refundedIdle);
    expect(purchaseResponse.body.realTime.available).toBe(200);
    expect(purchaseResponse.body.shop).toEqual(
      expect.objectContaining({
        seconds_multiplier: 0,
        patience: 0,
        restraint: 0,
        luck: 1,
        worthwhile_achievements: 0,
        anti_consumerist: 0,
        collect_gem_time_boost: 3
      })
    );
  });

  it("real_refund resets real-priced tiers and refunds real time only", async () => {
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
      .send({ upgradeType: "real_refund" });

    expect(purchaseResponse.status).toBe(200);
    expect(purchaseResponse.body.purchase.upgradeType).toBe("real_refund");
    expect(purchaseResponse.body.purchase.quantity).toBe(1);
    expect(purchaseResponse.body.purchase.totalCost).toBe(1);
    expect(purchaseResponse.body.timeGems.available).toBe(1);
    expect(purchaseResponse.body.idleTime.available).toBe(100);
    const shopBeforeRealRefund: ShopState = {
      ...DEFAULT_SHOP_STATE,
      seconds_multiplier: 2,
      restraint: 1,
      luck: 1,
      collect_gem_time_boost: 3
    };
    const refundedReal = getShopPurchaseRefundTotals(shopBeforeRealRefund).real;
    expect(purchaseResponse.body.realTime.available).toBe(200 + refundedReal);
    expect(purchaseResponse.body.shop).toEqual(
      expect.objectContaining({
        seconds_multiplier: 2,
        restraint: 1,
        luck: 0,
        collect_gem_time_boost: 3,
        storage_extension: 0,
        idle_hoarder: 0,
        another_seconds_multiplier: 0
      })
    );
  });

  it("rejects idle_refund when no idle-priced purchases to refund", async () => {
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
      .send({ upgradeType: "idle_refund" });

    expect(purchaseResponse.status).toBe(400);
    expect(purchaseResponse.body.code).toBe("NO_REFUNDABLE_PURCHASES");
  });

  it("rejects real_refund when no real-priced purchases to refund", async () => {
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
        shop = '{"seconds_multiplier": 2, "restraint": 0, "luck": 0}'::jsonb
      WHERE user_id = $1
      `,
      [userId]
    );

    const purchaseResponse = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "real_refund" });

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

  it("does not register debug gems endpoint in production config", async () => {
    const app = createApp(pool, { ...config, isProduction: true });
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const debugResponse = await request(app).post("/shop/debug/add-gems").set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(404);
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

  it("increments player level and deducts idle and real costs", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    const cost = getPlayerLevelUpgradeCostFromLevel(1);
    expect(cost).toBeDefined();

    await pool.query(
      `UPDATE player_states SET idle_time_available = $2, real_time_available = $3 WHERE user_id = $1`,
      [userId, cost!.idleSeconds, cost!.realSeconds]
    );

    const upgradeResponse = await request(app)
      .post("/shop/upgradeLevel")
      .set("Authorization", `Bearer ${token}`);

    expect(upgradeResponse.status).toBe(200);
    expect(upgradeResponse.body.level).toBe(2);
    expect(upgradeResponse.body.levelUpgrade.previousLevel).toBe(1);
    expect(upgradeResponse.body.levelUpgrade.newLevel).toBe(2);
    expect(upgradeResponse.body.levelUpgrade.idleSecondsCost).toBe(cost!.idleSeconds);
    expect(upgradeResponse.body.levelUpgrade.realSecondsCost).toBe(cost!.realSeconds);
    expect(upgradeResponse.body.idleTime.available).toBe(0);
    expect(upgradeResponse.body.realTime.available).toBe(0);

    const brokeResponse = await request(app)
      .post("/shop/upgradeLevel")
      .set("Authorization", `Bearer ${token}`);
    expect(brokeResponse.status).toBe(400);
    expect(brokeResponse.body.code).toBe("INSUFFICIENT_FUNDS");

    await pool.query(`UPDATE player_states SET level = $2 WHERE user_id = $1`, [userId, getMaxPlayerLevel()]);
    const maxResponse = await request(app).post("/shop/upgradeLevel").set("Authorization", `Bearer ${token}`);
    expect(maxResponse.status).toBe(400);
    expect(maxResponse.body.code).toBe("MAX_LEVEL");
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
        expect(synced).toBeGreaterThanOrEqual(ageSeconds ?? 0);
        expect(synced).toBeLessThanOrEqual((ageSeconds ?? 0) + 20);
      }
    }
  });
});
