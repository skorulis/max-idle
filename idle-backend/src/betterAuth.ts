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
      await db.query(`INSERT INTO player_states (user_id) VALUES ($1)`, [gameUserId]);
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
