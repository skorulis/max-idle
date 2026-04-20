import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
    expect(playerResponse.body.lastCollectedAt).toBeTypeOf("string");
    expect(playerResponse.body.serverTime).toBeTypeOf("string");
  });

  it("collects elapsed idle time and resets timer", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const { token, userId } = authResponse.body as { token: string; userId: string };

    await pool.query(
      `UPDATE player_states SET last_collected_at = NOW() - INTERVAL '10 seconds' WHERE user_id = $1`,
      [userId]
    );

    const collectResponse = await request(app).post("/player/collect").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body.collectedSeconds).toBeGreaterThanOrEqual(10);
    expect(collectResponse.body.totalIdleSeconds).toBeGreaterThanOrEqual(10);

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
  });

  it("registers and logs in with cookie sessions", async () => {
    const app = createApp(pool, config);
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Test User",
      email: "test@example.com",
      password: "password1234"
    });
    expect(registerResponse.status).toBe(200);

    const accountResponse = await request(app).get("/account").set("Cookie", registerResponse.headers["set-cookie"] ?? []);
    expect(accountResponse.status).toBe(200);
    expect(accountResponse.body.isAnonymous).toBe(false);
    expect(accountResponse.body.email).toBe("test@example.com");

    const loginResponse = await request(app).post("/auth/login").send({
      email: "test@example.com",
      password: "password1234"
    });
    expect(loginResponse.status).toBe(200);

    const playerResponse = await request(app).get("/player").set("Cookie", loginResponse.headers["set-cookie"] ?? []);
    expect(playerResponse.status).toBe(200);
  });
});
