import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import type { PoolClient, Pool } from "pg";
import type { AppConfig } from "./types.js";
import { generateAnonymousUsername, isUsernameTakenError } from "./username.js";

function buildSocialProviders(config: AppConfig) {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  if (config.googleClientId && config.googleClientSecret) {
    providers.google = {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret
    };
  }

  if (config.appleClientId && config.appleClientSecret) {
    providers.apple = {
      clientId: config.appleClientId,
      clientSecret: config.appleClientSecret
    };
  }

  return providers;
}

export function createBetterAuth(pool: Pool, config: AppConfig) {
  return betterAuth({
    database: pool,
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    trustedOrigins: [config.corsOrigin],
    emailAndPassword: {
      enabled: true
    },
    socialProviders: buildSocialProviders(config)
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;

export function getRequestHeaders(req: Request): Headers {
  return fromNodeHeaders(req.headers);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PASSWORD_PROVIDER_IDS = new Set(["credential", "email-password"]);

export type EmailProviderSummary = {
  providerIds: string[];
  hasEmailPassword: boolean;
};

export async function getEmailProviderSummary(db: Pool | PoolClient, email: string): Promise<EmailProviderSummary> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      providerIds: [],
      hasEmailPassword: false
    };
  }

  const result = await db.query<{ provider_id: string }>(
    `
    SELECT DISTINCT a."providerId" AS provider_id
    FROM "user" u
    INNER JOIN "account" a ON a."userId" = u.id
    WHERE LOWER(u.email) = $1
    `,
    [normalizedEmail]
  );

  const providerIds = result.rows.map((row) => row.provider_id).filter(Boolean);
  const hasEmailPassword = providerIds.some((providerId) => EMAIL_PASSWORD_PROVIDER_IDS.has(providerId));
  return { providerIds, hasEmailPassword };
}

export async function ensureGameIdentityForAuthUser(
  db: PoolClient,
  authUserId: string,
  userEmail: string | null
): Promise<string> {
  const existing = await db.query<{ game_user_id: string }>(
    `SELECT game_user_id FROM auth_identities WHERE auth_user_id = $1`,
    [authUserId]
  );
  if (existing.rows[0]?.game_user_id) {
    return existing.rows[0].game_user_id;
  }

  const normalizedEmail = userEmail ? normalizeEmail(userEmail) : "";
  if (normalizedEmail) {
    const existingByEmail = await db.query<{ game_user_id: string }>(
      `
      SELECT ai.game_user_id
      FROM auth_identities ai
      INNER JOIN "user" u ON u.id = ai.auth_user_id
      WHERE LOWER(u.email) = $1
      ORDER BY ai.created_at ASC
      LIMIT 1
      `,
      [normalizedEmail]
    );

    const existingEmailGameUserId = existingByEmail.rows[0]?.game_user_id;
    if (existingEmailGameUserId) {
      await db.query(
        `
        INSERT INTO auth_identities (auth_user_id, game_user_id)
        VALUES ($1, $2)
        ON CONFLICT (auth_user_id)
        DO UPDATE SET game_user_id = EXCLUDED.game_user_id
        `,
        [authUserId, existingEmailGameUserId]
      );
      await db.query(`UPDATE users SET email = COALESCE(email, $2), is_anonymous = FALSE WHERE id = $1`, [
        existingEmailGameUserId,
        normalizedEmail
      ]);
      return existingEmailGameUserId;
    }
  }

  const gameUserId = randomUUID();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await db.query("BEGIN");
    try {
      const generatedUsername = generateAnonymousUsername();
      await db.query(`INSERT INTO users (id, is_anonymous, username, email) VALUES ($1, FALSE, $2, $3)`, [
        gameUserId,
        generatedUsername,
        userEmail
      ]);
      await db.query(
        `INSERT INTO player_states (user_id, achievement_count, completed_achievements, shop, seconds_multiplier) VALUES ($1, 0, '[]'::jsonb, $2::jsonb, 0)`,
        [gameUserId, JSON.stringify({ seconds_multiplier: 0, restraint: 0, idle_hoarder: 0, luck: 0, collect_gem_time_boost: 0 })]
      );
      await db.query(`INSERT INTO auth_identities (auth_user_id, game_user_id) VALUES ($1, $2)`, [authUserId, gameUserId]);
      await db.query("COMMIT");
      return gameUserId;
    } catch (error) {
      await db.query("ROLLBACK");
      if (isUsernameTakenError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("USERNAME_GENERATION_FAILED");
}
