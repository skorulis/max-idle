import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import type { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { signAnonymousToken, verifyToken } from "./auth.js";
import {
  createBetterAuth,
  ensureGameIdentityForAuthUser,
  getEmailProviderSummary,
  getRequestHeaders,
  type BetterAuthInstance
} from "./betterAuth.js";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { calculateElapsedSeconds } from "./time.js";
import { getEffectiveIdleSecondsRate } from "./idleRate.js";
import {
  grantAchievement,
  normalizeCompletedAchievementIds,
  parseCompletedAchievementIds,
  updateCompletedAchievements
} from "./achievementUpdates.js";
import { ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION, ACHIEVEMENT_IDS, ACHIEVEMENTS } from "@maxidle/shared/achievements";
import { validateEmailPasswordInput } from "@maxidle/shared/authValidation";
import { getSecondsMultiplier, normalizeShopState } from "@maxidle/shared/shop";
import { registerShopRoutes } from "./shop.js";
import { registerLeaderboardRoutes } from "./leaderboard.js";
import { registerApiDocumentation } from "./apiContract.js";
import type { AppConfig, AuthClaims } from "./types.js";
import { containsProfanity, generateAnonymousUsername, isUsernameTakenError, isValidUsername } from "./username.js";

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    return Number(value);
  }
  throw new Error("Unexpected numeric value");
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const REAL_TIME_COLLECT_65_MINUTES_SECONDS = 65 * 60;
const IDLE_TIME_COLLECT_3H_7M_SECONDS = 3 * 60 * 60 + 7 * 60;
const REAL_TIME_STREAK_59_MINUTES_SECONDS = 59 * 60;
const REAL_TIME_STREAK_2D_14H_SECONDS = (2 * 24 + 14) * 60 * 60;

function getAchievementBonusMultiplier(achievementCount: number): number {
  return 1 + Math.max(0, achievementCount) * ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION;
}

function getUtcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function canCollectDailyReward(lastCollectedAt: Date | null, now: Date): boolean {
  if (!lastCollectedAt) {
    return true;
  }
  return lastCollectedAt.getTime() < getUtcDayStartMs(now);
}

type PlayerCurrentSecondsSyncRow = {
  user_id: string;
  current_seconds: number | string;
  current_seconds_last_updated: Date;
  last_collected_at: Date;
  achievement_count: number | string;
  shop: unknown;
  server_time: Date;
};

export async function syncStalePlayerCurrentSeconds(pool: Pool, limit = 100): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stalePlayersResult = await client.query<PlayerCurrentSecondsSyncRow>(
      `
      SELECT
        user_id,
        current_seconds,
        current_seconds_last_updated,
        last_collected_at,
        achievement_count,
        shop,
        NOW() AS server_time
      FROM player_states
      ORDER BY current_seconds_last_updated ASC
      LIMIT $1
      FOR UPDATE
      `,
      [limit]
    );

    for (const row of stalePlayersResult.rows) {
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const nextCurrentSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        row.server_time,
        row.shop,
        achievementBonusMultiplier
      );

      await client.query(
        `
        UPDATE player_states
        SET
          current_seconds = $2,
          current_seconds_last_updated = $3
        WHERE user_id = $1
        `,
        [row.user_id, nextCurrentSeconds, row.server_time]
      );
    }

    await client.query("COMMIT");
    return stalePlayersResult.rowCount ?? stalePlayersResult.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type BetterAuthSession = {
  session: {
    id: string;
  };
  user: {
    id: string;
    email: string | null;
  };
} | null;

function readBearerToken(req: express.Request): string | null {
  const authHeader = req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

async function getSession(auth: BetterAuthInstance, req: express.Request): Promise<BetterAuthSession> {
  try {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(req)
    });
    return session as BetterAuthSession;
  } catch {
    return null;
  }
}

async function resolveIdentity(
  auth: BetterAuthInstance,
  pool: Pool,
  jwtSecret: string,
  req: express.Request
): Promise<{ claims: AuthClaims; session: BetterAuthSession }> {
  const token = readBearerToken(req);
  if (token) {
    const claims = verifyToken(token, jwtSecret);
    return { claims, session: null };
  }

  const session = await getSession(auth, req);
  if (session?.user.id) {
    const client = await pool.connect();
    try {
      const gameUserId = await ensureGameIdentityForAuthUser(client, session.user.id, session.user.email);
      return {
        claims: {
          sub: gameUserId,
          isAnonymous: false,
          authUserId: session.user.id
        },
        session
      };
    } finally {
      client.release();
    }
  }

  throw new Error("MISSING_IDENTITY");
}

function applySetCookieHeaders(target: express.Response, source: Response): void {
  const rawHeaders = source.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof rawHeaders.getSetCookie === "function" ? rawHeaders.getSetCookie() : [];
  if (cookies.length > 0) {
    target.setHeader("set-cookie", cookies);
    return;
  }

  const singleCookie = source.headers.get("set-cookie");
  if (singleCookie) {
    target.setHeader("set-cookie", singleCookie);
  }
}

async function relayAuthResponse(authResponse: Response, res: express.Response): Promise<unknown> {
  applySetCookieHeaders(res, authResponse);

  const contentType = authResponse.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    res.sendStatus(authResponse.status);
    return null;
  }

  const payload = (await authResponse.json()) as unknown;
  res.status(authResponse.status).json(payload);
  return payload;
}

function ensureSocialConfig(config: AppConfig): { googleEnabled: boolean; appleEnabled: boolean } {
  return {
    googleEnabled: Boolean(config.googleClientId && config.googleClientSecret),
    appleEnabled: Boolean(config.appleClientId && config.appleClientSecret)
  };
}

async function ensureEmailPasswordAuthAllowed(pool: Pool, email: string, res: express.Response): Promise<boolean> {
  const providerSummary = await getEmailProviderSummary(pool, email);
  if (providerSummary.providerIds.length > 0 && !providerSummary.hasEmailPassword) {
    res.status(400).json({
      error: "This email is linked to social sign-in only. Continue with Google or Apple."
    });
    return false;
  }
  return true;
}

async function findGameUserIdByEmail(pool: Pool, email: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );
  return result.rows[0]?.id ?? null;
}

export function createApp(pool: Pool, config: AppConfig) {
  const auth = createBetterAuth(pool, config);
  const socialConfig = ensureSocialConfig(config);
  const app = express();
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true
    })
  );

  app.all("/api/auth/{*any}", toNodeHandler(auth));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  registerApiDocumentation(app);

  app.post("/auth/anonymous", async (_req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = randomUUID();
      let created = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await client.query("BEGIN");
        try {
          const generatedUsername = generateAnonymousUsername();
          await client.query(`INSERT INTO users (id, is_anonymous, username) VALUES ($1, TRUE, $2)`, [
            userId,
            generatedUsername
          ]);
          await client.query(
            `INSERT INTO player_states (user_id, achievement_count, completed_achievements) VALUES ($1, 0, '[]'::jsonb)`,
            [userId]
          );
          await client.query("COMMIT");
          created = true;
          break;
        } catch (error) {
          await client.query("ROLLBACK");
          if (isUsernameTakenError(error)) {
            continue;
          }
          throw error;
        }
      }

      if (!created) {
        throw new Error("USERNAME_GENERATION_FAILED");
      }

      const token = signAnonymousToken(userId, config.jwtSecret);
      res.status(201).json({ userId, token });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/auth/register", async (req, res, next) => {
    try {
      const rawEmail = String(req.body?.email ?? "");
      const password = String(req.body?.password ?? "");
      const authInput = validateEmailPasswordInput(rawEmail, password);
      if (!authInput.isValid) {
        res.status(400).json({ error: authInput.error });
        return;
      }
      const existingGameUserId = await findGameUserIdByEmail(pool, authInput.email);
      if (existingGameUserId) {
        res.status(409).json({
          error: "This email is already linked to an existing player.",
          code: "EMAIL_ALREADY_IN_USE"
        });
        return;
      }
      if (!(await ensureEmailPasswordAuthAllowed(pool, authInput.email, res))) {
        return;
      }

      const email = authInput.email;
      const providedName = String(req.body?.name ?? "").trim();
      const name = providedName.length > 0 ? providedName : email.split("@")[0] ?? "Player";

      const authResponse = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name
        },
        headers: getRequestHeaders(req),
        asResponse: true
      });

      if (!authResponse.ok) {
        await relayAuthResponse(authResponse, res);
        return;
      }

      const payload = (await authResponse.clone().json()) as { user: { id: string; email: string } };
      const client = await pool.connect();
      try {
        const gameUserId = await ensureGameIdentityForAuthUser(client, payload.user.id, payload.user.email);
        await grantAchievement(client, gameUserId, ACHIEVEMENT_IDS.ACCOUNT_CREATION);
      } finally {
        client.release();
      }

      await relayAuthResponse(authResponse, res);
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/login", async (req, res, next) => {
    try {
      const rawEmail = String(req.body?.email ?? "");
      const password = String(req.body?.password ?? "");
      const authInput = validateEmailPasswordInput(rawEmail, password);
      if (!authInput.isValid) {
        res.status(400).json({ error: authInput.error });
        return;
      }
      if (!(await ensureEmailPasswordAuthAllowed(pool, authInput.email, res))) {
        return;
      }

      const email = authInput.email;
      const authResponse = await auth.api.signInEmail({
        body: {
          email,
          password
        },
        headers: getRequestHeaders(req),
        asResponse: true
      });

      if (!authResponse.ok) {
        await relayAuthResponse(authResponse, res);
        return;
      }

      const payload = (await authResponse.clone().json()) as { user: { id: string; email: string } };
      const client = await pool.connect();
      try {
        await ensureGameIdentityForAuthUser(client, payload.user.id, payload.user.email);
      } finally {
        client.release();
      }

      await relayAuthResponse(authResponse, res);
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/logout", async (req, res, next) => {
    try {
      const authResponse = await auth.api.signOut({
        headers: getRequestHeaders(req),
        asResponse: true
      });
      await relayAuthResponse(authResponse, res);
    } catch (error) {
      next(error);
    }
  });

  app.get("/account", async (req, res, next) => {
    try {
      const session = await getSession(auth, req);
      if (session?.user.id) {
        const client = await pool.connect();
        try {
          const gameUserId = await ensureGameIdentityForAuthUser(client, session.user.id, session.user.email);
          const result = await client.query<{ email: string | null; username: string }>(
            `SELECT email, username FROM users WHERE id = $1`,
            [gameUserId]
          );
          const userRow = result.rows[0];

          res.json({
            isAnonymous: false,
            email: userRow?.email ?? session.user.email,
            username: userRow?.username ?? null,
            gameUserId,
            socialProviders: socialConfig
          });
        } finally {
          client.release();
        }
        return;
      }

      const token = readBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const claims = verifyToken(token, config.jwtSecret);
      const userResult = await pool.query<{ email: string | null; username: string | null }>(
        `SELECT email, username FROM users WHERE id = $1`,
        [claims.sub]
      );
      res.json({
        isAnonymous: true,
        email: userResult.rows[0]?.email ?? null,
        username: userResult.rows[0]?.username ?? null,
        gameUserId: claims.sub,
        canUpgrade: true,
        socialProviders: socialConfig
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/account/upgrade", async (req, res, next) => {
    try {
      const session = await getSession(auth, req);
      if (session?.user.id) {
        res.status(400).json({ error: "Account is already registered" });
        return;
      }

      const token = readBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Anonymous bearer token required" });
        return;
      }

      const anonymousClaims = verifyToken(token, config.jwtSecret);
      if (!anonymousClaims.isAnonymous) {
        res.status(400).json({ error: "Only anonymous users can upgrade" });
        return;
      }

      const rawEmail = String(req.body?.email ?? "");
      const password = String(req.body?.password ?? "");
      const authInput = validateEmailPasswordInput(rawEmail, password);
      if (!authInput.isValid) {
        res.status(400).json({ error: authInput.error });
        return;
      }
      const existingGameUserId = await findGameUserIdByEmail(pool, authInput.email);
      if (existingGameUserId && existingGameUserId !== anonymousClaims.sub) {
        res.status(409).json({
          error: "This email is already linked to another player account.",
          code: "EMAIL_ALREADY_IN_USE"
        });
        return;
      }
      if (!(await ensureEmailPasswordAuthAllowed(pool, authInput.email, res))) {
        return;
      }

      const email = authInput.email;
      const providedName = String(req.body?.name ?? "").trim();
      const name = providedName.length > 0 ? providedName : email.split("@")[0] ?? "Player";

      const authResponse = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name
        },
        headers: getRequestHeaders(req),
        asResponse: true
      });

      if (!authResponse.ok) {
        await relayAuthResponse(authResponse, res);
        return;
      }

      const payload = (await authResponse.clone().json()) as { user: { id: string } };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
          INSERT INTO auth_identities (auth_user_id, game_user_id)
          VALUES ($1, $2)
          ON CONFLICT (auth_user_id)
          DO UPDATE SET game_user_id = EXCLUDED.game_user_id
          `,
          [payload.user.id, anonymousClaims.sub]
        );
        await client.query(`UPDATE users SET is_anonymous = FALSE, email = $2 WHERE id = $1`, [anonymousClaims.sub, email]);
        await grantAchievement(client, anonymousClaims.sub, ACHIEVEMENT_IDS.ACCOUNT_CREATION);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      await relayAuthResponse(authResponse, res);
    } catch (error) {
      next(error);
    }
  });

  app.post("/account/upgrade/social/complete", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const session = await getSession(auth, req);
      if (!session?.user.id) {
        res.status(401).json({ error: "Social account session required" });
        return;
      }

      const token = readBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Anonymous bearer token required" });
        return;
      }

      const anonymousClaims = verifyToken(token, config.jwtSecret);
      if (!anonymousClaims.isAnonymous) {
        res.status(400).json({ error: "Only anonymous users can upgrade" });
        return;
      }

      const socialEmail = String(session.user.email ?? "").trim();
      if (!socialEmail) {
        res.status(400).json({ error: "Social account email is required for upgrade" });
        return;
      }

      await client.query("BEGIN");

      const existingIdentity = await client.query<{ game_user_id: string }>(
        `
        SELECT game_user_id
        FROM auth_identities
        WHERE auth_user_id = $1
        LIMIT 1
        `,
        [session.user.id]
      );
      const existingSocialGameUserId = existingIdentity.rows[0]?.game_user_id ?? null;
      if (existingSocialGameUserId && existingSocialGameUserId !== anonymousClaims.sub) {
        await client.query("ROLLBACK");
        const signOutResponse = await auth.api.signOut({
          headers: getRequestHeaders(req),
          asResponse: true
        });
        applySetCookieHeaders(res, signOutResponse);
        res.status(409).json({
          error: "This Google account is already linked to another player.",
          code: "SOCIAL_ACCOUNT_ALREADY_LINKED"
        });
        return;
      }

      const existingByEmail = await client.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [socialEmail]
      );
      const existingEmailGameUserId = existingByEmail.rows[0]?.id ?? null;
      if (existingEmailGameUserId && existingEmailGameUserId !== anonymousClaims.sub) {
        await client.query("ROLLBACK");
        const signOutResponse = await auth.api.signOut({
          headers: getRequestHeaders(req),
          asResponse: true
        });
        applySetCookieHeaders(res, signOutResponse);
        res.status(409).json({
          error: "This email is already linked to another player account.",
          code: "EMAIL_ALREADY_IN_USE"
        });
        return;
      }

      await client.query(
        `
        INSERT INTO auth_identities (auth_user_id, game_user_id)
        VALUES ($1, $2)
        ON CONFLICT (auth_user_id)
        DO UPDATE SET game_user_id = EXCLUDED.game_user_id
        `,
        [session.user.id, anonymousClaims.sub]
      );
      await client.query(`UPDATE users SET is_anonymous = FALSE, email = $2 WHERE id = $1`, [anonymousClaims.sub, socialEmail]);
      await grantAchievement(client, anonymousClaims.sub, ACHIEVEMENT_IDS.ACCOUNT_CREATION);
      await client.query("COMMIT");

      res.status(200).json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/account/username", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);

      const username = String(req.body?.username ?? "").trim();
      if (!isValidUsername(username)) {
        res.status(400).json({
          error: "Username must be 3-32 chars using letters, numbers, or underscores"
        });
        return;
      }
      if (containsProfanity(username)) {
        res.status(400).json({
          error: "Username cannot contain profanity"
        });
        return;
      }

      try {
        await client.query("BEGIN");
        const updateResult = await client.query<{ username: string }>(
          `UPDATE users SET username = $2 WHERE id = $1 RETURNING username`,
          [identity.claims.sub, username]
        );
        const updatedUser = updateResult.rows[0];
        if (!updatedUser) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "User not found" });
          return;
        }

        await grantAchievement(client, identity.claims.sub, ACHIEVEMENT_IDS.USERNAME_SELECTED);

        await client.query("COMMIT");
        res.json({ username: updatedUser.username });
      } catch (error) {
        await client.query("ROLLBACK");
        const pgError = error as { code?: string };
        if (pgError.code === "23505") {
          res.status(409).json({
            error: "Username is already taken",
            code: "USERNAME_TAKEN"
          });
          return;
        }
        throw error;
      }
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  });

  app.get("/achievements", async (req, res, next) => {
    try {
      let identity: { claims: AuthClaims; session: BetterAuthSession };
      try {
        identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_IDENTITY") {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        throw error;
      }

      const playerStateResult = await pool.query<{
        achievement_count: number | string;
        completed_achievements: unknown;
      }>(
        `
        SELECT
          achievement_count,
          completed_achievements
        FROM player_states
        WHERE user_id = $1
        `,
        [identity.claims.sub]
      );
      const playerStateRow = playerStateResult.rows[0];
      if (!playerStateRow) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const completedAchievementIds = new Set(parseCompletedAchievementIds(playerStateRow.completed_achievements));
      const completedCount = toNumber(playerStateRow.achievement_count);
      res.json({
        completedCount,
        totalCount: ACHIEVEMENTS.length,
        earningsBonusMultiplier: getAchievementBonusMultiplier(completedCount),
        achievements: ACHIEVEMENTS.map((achievement) => ({
          ...achievement,
          completed: completedAchievementIds.has(achievement.id)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/achievements/seen", async (req, res, next) => {
    try {
      let identity: { claims: AuthClaims; session: BetterAuthSession };
      try {
        identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_IDENTITY") {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        throw error;
      }

      const result = await pool.query<{ user_id: string }>(
        `
        UPDATE player_states
        SET has_unseen_achievements = FALSE
        WHERE user_id = $1
        RETURNING user_id
        `,
        [identity.claims.sub]
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/players/:id", async (req, res, next) => {
    try {
      const playerId = String(req.params.id ?? "").trim();
      if (!isValidUuid(playerId)) {
        res.status(400).json({ error: "Invalid player id" });
        return;
      }

      const result = await pool.query<{
        user_id: string;
        username: string;
        created_at: Date;
        current_seconds: string;
        idle_time_total: string;
        idle_time_available: string;
        real_time_total: string;
        real_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        upgrades_purchased: string;
        current_seconds_last_updated: Date;
        last_collected_at: Date;
        achievement_count: string;
        shop: unknown;
        server_time: Date;
      }>(
        `
        SELECT
          u.id AS user_id,
          u.username,
          u.created_at,
          ps.current_seconds,
          ps.idle_time_total,
          ps.idle_time_available,
          ps.real_time_total,
          ps.real_time_available,
          ps.time_gems_total,
          ps.time_gems_available,
          ps.upgrades_purchased,
          ps.current_seconds_last_updated,
          ps.last_collected_at,
          ps.achievement_count,
          ps.shop,
        NOW() AS server_time
        FROM users u
        INNER JOIN player_states ps ON ps.user_id = u.id
        WHERE u.id = $1
        `,
        [playerId]
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: "Player not found" });
        return;
      }

      const accountAgeSeconds = calculateElapsedSeconds(row.created_at, row.server_time);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const currentIdleSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        row.server_time,
        row.shop,
        achievementBonusMultiplier
      );

      res.json({
        player: {
          id: row.user_id,
          username: row.username,
          accountAgeSeconds,
          currentIdleSeconds,
          idleTime: {
            total: toNumber(row.idle_time_total),
            available: toNumber(row.idle_time_available)
          },
          realTime: {
            total: toNumber(row.real_time_total),
            available: toNumber(row.real_time_available)
          },
          timeGems: {
            total: toNumber(row.time_gems_total),
            available: toNumber(row.time_gems_available)
          },
          upgradesPurchased: toNumber(row.upgrades_purchased),
          achievementCount: toNumber(row.achievement_count)
        },
        meta: {
          serverTime: row.server_time.toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/player", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      req.auth = identity.claims;

      const userId = identity.claims.sub;
      const result = await pool.query<{
        idle_time_total: string;
        idle_time_available: string;
        real_time_total: string;
        real_time_available: string;
        time_gems_total: string;
        time_gems_available: string;
        upgrades_purchased: string;
        achievement_count: string;
        has_unseen_achievements: boolean;
        shop: unknown;
        last_collected_at: Date;
        current_seconds: string;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
        server_time: Date;
      }>(
        `
        SELECT
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          achievement_count,
          has_unseen_achievements,
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at,
          NOW() AS server_time
        FROM player_states
        WHERE user_id = $1
        `,
        [userId]
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const currentIdleSeconds = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        row.server_time,
        row.shop,
        achievementBonusMultiplier
      );
      await pool.query(
        `
        UPDATE player_states
        SET
          current_seconds = $2,
          current_seconds_last_updated = $3
        WHERE user_id = $1
        `,
        [userId, currentIdleSeconds, row.server_time]
      );
      const elapsedSinceLastCollection = calculateElapsedSeconds(row.last_collected_at, row.server_time);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: row.shop,
        achievementBonusMultiplier
      });

      res.json({
        idleTime: {
          total: toNumber(row.idle_time_total),
          available: toNumber(row.idle_time_available)
        },
        realTime: {
          total: toNumber(row.real_time_total),
          available: toNumber(row.real_time_available)
        },
        timeGems: {
          total: toNumber(row.time_gems_total),
          available: toNumber(row.time_gems_available)
        },
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: currentIdleSeconds,
        idleSecondsRate,
        secondsMultiplier: getSecondsMultiplier(row.shop),
        shop: normalizeShopState(row.shop),
        achievementBonusMultiplier,
        hasUnseenAchievements: row.has_unseen_achievements,
        currentSecondsLastUpdated: row.server_time.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
        serverTime: row.server_time.toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/player/collect", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      await client.query("BEGIN");
      const result = await client.query<{
        upgrades_purchased: number | string;
        achievement_count: number | string;
        completed_achievements: unknown;
        has_unseen_achievements: boolean;
        shop: unknown;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        SELECT
          upgrades_purchased,
          achievement_count,
          completed_achievements,
          has_unseen_achievements,
          shop,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          last_daily_reward_collected_at
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );

      const lockedRow = result.rows[0];
      if (!lockedRow) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const collectedAt = new Date();
      const collectionAchievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(lockedRow.achievement_count));
      const collectedSeconds = boostedUncollectedIdleSeconds(
        lockedRow.last_collected_at,
        collectedAt,
        lockedRow.shop,
        collectionAchievementBonusMultiplier
      );
      const realSecondsCollected = calculateElapsedSeconds(lockedRow.last_collected_at, collectedAt);
      const updateResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: unknown;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + $2::BIGINT,
          idle_time_available = idle_time_available + $2::BIGINT,
          real_time_total = real_time_total + $3::BIGINT,
          real_time_available = real_time_available + $3::BIGINT,
          current_seconds = 0,
          current_seconds_last_updated = $4,
          last_collected_at = $4,
          updated_at = $4
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          shop,
          last_daily_reward_collected_at
        `,
        [userId, collectedSeconds, realSecondsCollected, collectedAt]
      );

      const row = updateResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const completedAchievementIds = normalizeCompletedAchievementIds(lockedRow.completed_achievements);
      if (
        toNumber(row.real_time_total) >= REAL_TIME_COLLECT_65_MINUTES_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES);
      }
      if (
        toNumber(row.idle_time_total) >= IDLE_TIME_COLLECT_3H_7M_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_59_MINUTES_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES);
      }
      if (
        realSecondsCollected >= REAL_TIME_STREAK_2D_14H_SECONDS &&
        !completedAchievementIds.includes(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H)
      ) {
        completedAchievementIds.push(ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H);
      }
      if (completedAchievementIds.length !== toNumber(lockedRow.achievement_count)) {
        await updateCompletedAchievements(client, userId, completedAchievementIds);
      }
      const hasUnseenAchievements =
        lockedRow.has_unseen_achievements || completedAchievementIds.length !== toNumber(lockedRow.achievement_count);

      const achievementBonusMultiplier = getAchievementBonusMultiplier(completedAchievementIds.length);
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: 0,
        shop: row.shop,
        achievementBonusMultiplier
      });
      await client.query("COMMIT");
      res.json({
        collectedSeconds,
        realSecondsCollected,
        idleTime: {
          total: toNumber(row.idle_time_total),
          available: toNumber(row.idle_time_available)
        },
        realTime: {
          total: toNumber(row.real_time_total),
          available: toNumber(row.real_time_available)
        },
        timeGems: {
          total: toNumber(row.time_gems_total),
          available: toNumber(row.time_gems_available)
        },
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: toNumber(row.current_seconds),
        secondsMultiplier: getSecondsMultiplier(row.shop),
        shop: normalizeShopState(row.shop),
        achievementBonusMultiplier,
        hasUnseenAchievements,
        idleSecondsRate,
        currentSecondsLastUpdated: row.current_seconds_last_updated.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: row.last_daily_reward_collected_at?.toISOString() ?? null,
        serverTime: row.last_collected_at.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/player/daily-reward/collect", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;
      await client.query("BEGIN");
      const playerResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: unknown;
        achievement_count: number | string;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        SELECT
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
      const player = playerResult.rows[0];
      if (!player) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const now = new Date();
      if (!canCollectDailyReward(player.last_daily_reward_collected_at, now)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Daily reward already collected today",
          code: "DAILY_REWARD_NOT_AVAILABLE"
        });
        return;
      }

      const updateResult = await client.query<{
        idle_time_total: number | string;
        idle_time_available: number | string;
        real_time_total: number | string;
        real_time_available: number | string;
        time_gems_total: number | string;
        time_gems_available: number | string;
        upgrades_purchased: number | string;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        shop: unknown;
        achievement_count: number | string;
        has_unseen_achievements: boolean;
        last_collected_at: Date;
        last_daily_reward_collected_at: Date | null;
      }>(
        `
        UPDATE player_states
        SET
          time_gems_total = time_gems_total + 1,
          time_gems_available = time_gems_available + 1,
          last_daily_reward_collected_at = $2,
          updated_at = $2
        WHERE user_id = $1
        RETURNING
          idle_time_total,
          idle_time_available,
          real_time_total,
          real_time_available,
          time_gems_total,
          time_gems_available,
          upgrades_purchased,
          current_seconds,
          current_seconds_last_updated,
          shop,
          achievement_count,
          has_unseen_achievements,
          last_collected_at,
          last_daily_reward_collected_at
        `,
        [userId, now]
      );
      const updatedPlayer = updateResult.rows[0];
      if (!updatedPlayer) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const elapsedSinceLastCollection = calculateElapsedSeconds(updatedPlayer.last_collected_at, now);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(updatedPlayer.achievement_count));
      const idleSecondsRate = getEffectiveIdleSecondsRate({
        secondsSinceLastCollection: elapsedSinceLastCollection,
        shop: updatedPlayer.shop,
        achievementBonusMultiplier
      });
      await client.query("COMMIT");

      res.json({
        idleTime: {
          total: toNumber(updatedPlayer.idle_time_total),
          available: toNumber(updatedPlayer.idle_time_available)
        },
        realTime: {
          total: toNumber(updatedPlayer.real_time_total),
          available: toNumber(updatedPlayer.real_time_available)
        },
        timeGems: {
          total: toNumber(updatedPlayer.time_gems_total),
          available: toNumber(updatedPlayer.time_gems_available)
        },
        upgradesPurchased: toNumber(updatedPlayer.upgrades_purchased),
        currentSeconds: toNumber(updatedPlayer.current_seconds),
        secondsMultiplier: getSecondsMultiplier(updatedPlayer.shop),
        shop: normalizeShopState(updatedPlayer.shop),
        achievementBonusMultiplier,
        hasUnseenAchievements: updatedPlayer.has_unseen_achievements,
        idleSecondsRate,
        currentSecondsLastUpdated: updatedPlayer.current_seconds_last_updated.toISOString(),
        lastCollectedAt: updatedPlayer.last_collected_at.toISOString(),
        lastDailyRewardCollectedAt: updatedPlayer.last_daily_reward_collected_at?.toISOString() ?? null,
        serverTime: now.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  registerShopRoutes({
    app,
    pool,
    resolveIdentity: async (req) => {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      req.auth = identity.claims;
      return identity;
    },
    toNumber,
    getAchievementBonusMultiplier
  });

  registerLeaderboardRoutes({
    app,
    pool,
    resolveIdentity: async (req) => {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      req.auth = identity.claims;
      return identity;
    },
    toNumber
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
