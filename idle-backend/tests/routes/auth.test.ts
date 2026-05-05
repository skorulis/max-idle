import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("auth routes", () => {
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

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
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
});
