import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("research routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns research state for an authenticated player", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const response = await request(app).get("/research").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.research).toBeDefined();
    expect(response.body.unlockedLabCount).toBe(0);
  });
});
