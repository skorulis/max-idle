import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RESEARCH_ITEM_IDS } from "@maxidle/shared/researchItems";
import { DEFAULT_SHOP_STATE } from "@maxidle/shared/shop";
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

  it("awards lab levels achievement when research level completes", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const startedAtMs = 1;

    await pool.query(
      `
      UPDATE player_states
      SET
        shop = $2::jsonb,
        research = $3::jsonb
      WHERE user_id = $1
      `,
      [
        userId,
        JSON.stringify({ ...DEFAULT_SHOP_STATE, lab_slots: 1 }),
        JSON.stringify({
          levels: { [RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]: 4 },
          labs: [{ researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs }],
          progress: {}
        })
      ]
    );

    const response = await request(app).get("/research").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.research.levels[RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]).toBe(5);

    const achievementState = await pool.query<{
      achievement_count: number;
      achievement_levels: unknown;
      has_unseen_achievements: boolean;
    }>(
      `
      SELECT achievement_count, achievement_levels, has_unseen_achievements
      FROM player_states
      WHERE user_id = $1
      `,
      [userId]
    );
    const levels = achievementState.rows[0]?.achievement_levels as Array<{ id: string; level: number }>;
    expect(Number(achievementState.rows[0]?.achievement_count ?? 0)).toBe(1);
    expect(levels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "lab_levels_completed", level: 1 })])
    );
    expect(achievementState.rows[0]?.has_unseen_achievements).toBe(true);
  });
});
