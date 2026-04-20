import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createTestPool } from "./testDb";

describe("auth + player lifecycle", () => {
  const jwtSecret = "test-secret";
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates anonymous user and returns player state", async () => {
    const app = createApp(pool, jwtSecret);
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
    const app = createApp(pool, jwtSecret);
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
});
