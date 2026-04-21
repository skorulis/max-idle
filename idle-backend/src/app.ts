import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import type { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { signAnonymousToken, verifyToken } from "./auth.js";
import {
  createBetterAuth,
  ensureGameIdentityForAuthUser,
  getRequestHeaders,
  type BetterAuthInstance
} from "./betterAuth.js";
import { calculateElapsedSeconds } from "./time.js";
import { calculateIdleSecondsGain, getIdleSecondsRate } from "./idleRate.js";
import { ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION, ACHIEVEMENT_IDS, ACHIEVEMENTS } from "@maxidle/shared/achievements";
import type { AchievementId } from "@maxidle/shared/achievements";
import { registerShopRoutes } from "./shop.js";
import { registerLeaderboardRoutes } from "./leaderboard.js";
import type { AppConfig, AuthClaims } from "./types.js";
import { generateAnonymousUsername, isUsernameTakenError, isValidUsername } from "./username.js";

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

function parseCompletedAchievementIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

function normalizeCompletedAchievementIds(currentValue: unknown, idsToAdd: string[] = []): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const addIfKnown = (id: string) => {
    if (!KNOWN_ACHIEVEMENT_IDS.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    ordered.push(id);
  };

  for (const existingId of parseCompletedAchievementIds(currentValue)) {
    addIfKnown(existingId);
  }
  for (const idToAdd of idsToAdd) {
    addIfKnown(idToAdd);
  }

  return ordered;
}

function getAchievementBonusMultiplier(achievementCount: number): number {
  return 1 + Math.max(0, achievementCount) * ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION;
}

type Queryable = Pick<Pool, "query">;

type PlayerCurrentSecondsSyncRow = {
  user_id: string;
  current_seconds: number | string;
  current_seconds_last_updated: Date;
  achievement_count: number | string;
  seconds_multiplier: number | string;
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
        achievement_count,
        seconds_multiplier,
        NOW() AS server_time
      FROM player_states
      ORDER BY current_seconds_last_updated ASC
      LIMIT $1
      FOR UPDATE
      `,
      [limit]
    );

    for (const row of stalePlayersResult.rows) {
      const elapsedSinceCurrentUpdate = calculateElapsedSeconds(row.current_seconds_last_updated, row.server_time);
      const secondsMultiplier = Number(row.seconds_multiplier);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const incrementalBaseGain = calculateIdleSecondsGain(elapsedSinceCurrentUpdate);
      const incrementalBoostedGain = Math.floor(incrementalBaseGain * secondsMultiplier * achievementBonusMultiplier);
      const nextCurrentSeconds = toNumber(row.current_seconds) + incrementalBoostedGain;

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

async function grantAchievement(db: Queryable, userId: string, achievementId: AchievementId): Promise<void> {
  const playerStateResult = await db.query<{ completed_achievements: unknown }>(
    `SELECT completed_achievements FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const playerStateRow = playerStateResult.rows[0];
  if (!playerStateRow) {
    throw new Error("PLAYER_STATE_NOT_FOUND");
  }

  const completedAchievementIds = normalizeCompletedAchievementIds(playerStateRow.completed_achievements, [achievementId]);
  await db.query(
    `
    UPDATE player_states
    SET
      completed_achievements = $2::jsonb,
      achievement_count = $3
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(completedAchievementIds), completedAchievementIds.length]
  );
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
      const email = String(req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");
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
      const email = String(req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");
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

      const email = String(req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");
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

  app.post("/account/username", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
      if (identity.claims.isAnonymous) {
        res.status(400).json({ error: "Anonymous usernames cannot be changed" });
        return;
      }

      const username = String(req.body?.username ?? "").trim();
      if (!isValidUsername(username)) {
        res.status(400).json({
          error: "Username must be 3-32 chars using letters, numbers, or underscores"
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

        const playerStateResult = await client.query<{ completed_achievements: unknown }>(
          `SELECT completed_achievements FROM player_states WHERE user_id = $1 FOR UPDATE`,
          [identity.claims.sub]
        );
        const playerStateRow = playerStateResult.rows[0];
        if (!playerStateRow) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Player state not found" });
          return;
        }

        const completedAchievementIds = normalizeCompletedAchievementIds(playerStateRow.completed_achievements, [
          ACHIEVEMENT_IDS.USERNAME_SELECTED
        ]);
        await client.query(
          `
          UPDATE player_states
          SET
            completed_achievements = $2::jsonb,
            achievement_count = $3
          WHERE user_id = $1
          `,
          [identity.claims.sub, JSON.stringify(completedAchievementIds), completedAchievementIds.length]
        );

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
        total_seconds_collected: string;
        upgrades_purchased: string;
        current_seconds_last_updated: Date;
        achievement_count: string;
        seconds_multiplier: number | string;
        server_time: Date;
      }>(
        `
        SELECT
          u.id AS user_id,
          u.username,
          u.created_at,
          ps.current_seconds,
          ps.total_seconds_collected,
          ps.upgrades_purchased,
          ps.current_seconds_last_updated,
          ps.achievement_count,
          ps.seconds_multiplier,
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

      const elapsedSinceCurrentUpdate = calculateElapsedSeconds(row.current_seconds_last_updated, row.server_time);
      const accountAgeSeconds = calculateElapsedSeconds(row.created_at, row.server_time);
      const secondsMultiplier = Number(row.seconds_multiplier);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const incrementalBaseGain = calculateIdleSecondsGain(elapsedSinceCurrentUpdate);
      const incrementalBoostedGain = Math.floor(incrementalBaseGain * secondsMultiplier * achievementBonusMultiplier);
      const currentIdleSeconds = toNumber(row.current_seconds) + incrementalBoostedGain;

      res.json({
        player: {
          id: row.user_id,
          username: row.username,
          accountAgeSeconds,
          currentIdleSeconds,
          collectedIdleSeconds: toNumber(row.total_seconds_collected),
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
        total_seconds_collected: string;
        spendable_idle_seconds: string;
        upgrades_purchased: string;
        achievement_count: string;
        seconds_multiplier: number | string;
        last_collected_at: Date;
        current_seconds: string;
        current_seconds_last_updated: Date;
        server_time: Date;
      }>(
        `
        SELECT
          total_seconds_collected,
          spendable_idle_seconds,
          upgrades_purchased,
          achievement_count,
          seconds_multiplier,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
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

      const elapsedSinceCurrentUpdate = calculateElapsedSeconds(row.current_seconds_last_updated, row.server_time);
      const secondsMultiplier = Number(row.seconds_multiplier);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(row.achievement_count));
      const incrementalBaseGain = calculateIdleSecondsGain(elapsedSinceCurrentUpdate);
      const incrementalBoostedGain = Math.floor(incrementalBaseGain * secondsMultiplier * achievementBonusMultiplier);
      const currentIdleSeconds = toNumber(row.current_seconds) + incrementalBoostedGain;
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
      const idleSecondsRate = getIdleSecondsRate({ secondsSinceLastCollection: elapsedSinceLastCollection });

      res.json({
        totalIdleSeconds: toNumber(row.total_seconds_collected),
        collectedIdleSeconds: toNumber(row.spendable_idle_seconds),
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: currentIdleSeconds,
        idleSecondsRate,
        secondsMultiplier,
        achievementBonusMultiplier,
        currentSecondsLastUpdated: row.server_time.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
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
        total_seconds_collected: number | string;
        spendable_idle_seconds: number | string;
        upgrades_purchased: number | string;
        achievement_count: number | string;
        seconds_multiplier: number | string;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        updated_at: Date;
      }>(
        `
        SELECT
          total_seconds_collected,
          spendable_idle_seconds,
          upgrades_purchased,
          achievement_count,
          seconds_multiplier,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated
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
      const elapsedSinceCurrentUpdate = calculateElapsedSeconds(lockedRow.current_seconds_last_updated, collectedAt);
      const secondsMultiplier = Number(lockedRow.seconds_multiplier);
      const achievementBonusMultiplier = getAchievementBonusMultiplier(toNumber(lockedRow.achievement_count));
      const incrementalBaseGain = calculateIdleSecondsGain(elapsedSinceCurrentUpdate);
      const incrementalBoostedGain = Math.floor(incrementalBaseGain * secondsMultiplier * achievementBonusMultiplier);
      const collectedSeconds = toNumber(lockedRow.current_seconds) + incrementalBoostedGain;
      const updateResult = await client.query<{
        total_seconds_collected: number | string;
        spendable_idle_seconds: number | string;
        upgrades_purchased: number | string;
        last_collected_at: Date;
        current_seconds: number | string;
        current_seconds_last_updated: Date;
        seconds_multiplier: number | string;
      }>(
        `
        UPDATE player_states
        SET
          total_seconds_collected = total_seconds_collected + $2::BIGINT,
          spendable_idle_seconds = spendable_idle_seconds + $2::BIGINT,
          current_seconds = 0,
          current_seconds_last_updated = $3,
          last_collected_at = $3,
          updated_at = $3
        WHERE user_id = $1
        RETURNING
          total_seconds_collected,
          spendable_idle_seconds,
          upgrades_purchased,
          last_collected_at,
          current_seconds,
          current_seconds_last_updated,
          seconds_multiplier
        `,
        [userId, collectedSeconds, collectedAt]
      );

      const row = updateResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      await client.query("COMMIT");
      res.json({
        collectedSeconds,
        totalIdleSeconds: toNumber(row.total_seconds_collected),
        collectedIdleSeconds: toNumber(row.spendable_idle_seconds),
        upgradesPurchased: toNumber(row.upgrades_purchased),
        currentSeconds: toNumber(row.current_seconds),
        secondsMultiplier: toNumber(row.seconds_multiplier),
        achievementBonusMultiplier,
        idleSecondsRate: 1,
        currentSecondsLastUpdated: row.current_seconds_last_updated.toISOString(),
        lastCollectedAt: row.last_collected_at.toISOString(),
        serverTime: row.last_collected_at.toISOString()
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
    getAchievementBonusMultiplier,
    normalizeCompletedAchievementIds
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
