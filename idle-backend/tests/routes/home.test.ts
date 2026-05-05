import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";
import { OBLIGATION_IDS } from "@maxidle/shared/obligations";

describe("home routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

  async function unlockTournamentFeature(
    _app: ReturnType<typeof createApp>,
    _token: string,
    userId: string
  ): Promise<void> {
    await pool.query(
      `
      UPDATE player_states
      SET obligations_completed = $2::jsonb
      WHERE user_id = $1
      `,
      [userId, JSON.stringify({ [OBLIGATION_IDS.WAIT_IT_OUT]: true })]
    );
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
});
