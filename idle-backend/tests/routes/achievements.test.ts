import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("achievement routes", () => {
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

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
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
    expect(response.body.earningsBonusMultiplier).toBe(0);
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
    expect(response.body.earningsBonusMultiplier).toBe(0);
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
});
