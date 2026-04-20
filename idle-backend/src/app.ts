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
          await client.query(`INSERT INTO player_states (user_id) VALUES ($1)`, [userId]);
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
        await ensureGameIdentityForAuthUser(client, payload.user.id, payload.user.email);
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
        const updateResult = await pool.query<{ username: string }>(
          `UPDATE users SET username = $2 WHERE id = $1 RETURNING username`,
          [identity.claims.sub, username]
        );

        if (!updateResult.rows[0]) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        res.json({ username: updateResult.rows[0].username });
      } catch (error) {
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
    }
  });

  app.get("/leaderboard", async (req, res, next) => {
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

      const leaderboardResult = await pool.query<{
        user_id: string;
        username: string;
        total_idle_seconds: string;
      }>(
        `
        SELECT
          ps.user_id,
          u.username,
          ps.total_idle_seconds
        FROM player_states ps
        INNER JOIN users u ON u.id = ps.user_id
        ORDER BY ps.total_idle_seconds DESC
        LIMIT 200
        `
      );

      const currentPlayerResult = await pool.query<{
        user_id: string;
        total_idle_seconds: string;
      }>(
        `
        SELECT
          ps.user_id,
          ps.total_idle_seconds
        FROM player_states ps
        WHERE ps.user_id = $1
        `,
        [identity.claims.sub]
      );

      const currentPlayerRow = currentPlayerResult.rows[0];
      if (!currentPlayerRow) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const higherRankCountResult = await pool.query<{ higher_count: string }>(
        `SELECT COUNT(*) AS higher_count FROM player_states WHERE total_idle_seconds > $1`,
        [currentPlayerRow.total_idle_seconds]
      );
      const currentPlayerRank = toNumber(higherRankCountResult.rows[0]?.higher_count ?? 0) + 1;

      let previousTotalIdleSeconds: number | null = null;
      let previousRank = 0;
      const entries = leaderboardResult.rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        totalIdleSeconds: toNumber(row.total_idle_seconds)
      }));

      const rankedEntries = entries.map((entry, index) => {
        const rank =
          previousTotalIdleSeconds !== null && entry.totalIdleSeconds === previousTotalIdleSeconds
            ? previousRank
            : index + 1;
        previousTotalIdleSeconds = entry.totalIdleSeconds;
        previousRank = rank;
        return {
          ...entry,
          rank,
          isCurrentPlayer: entry.userId === identity.claims.sub
        };
      });

      res.json({
        entries: rankedEntries,
        currentPlayer: {
          userId: currentPlayerRow.user_id,
          rank: currentPlayerRank,
          totalIdleSeconds: toNumber(currentPlayerRow.total_idle_seconds),
          inTop: rankedEntries.some((entry) => entry.isCurrentPlayer)
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
        total_idle_seconds: string;
        spendable_idle_seconds: string;
        last_collected_at: Date;
        server_time: Date;
      }>(
        `
        SELECT
          total_idle_seconds,
          spendable_idle_seconds,
          last_collected_at,
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

      res.json({
        totalIdleSeconds: toNumber(row.total_idle_seconds),
        collectedIdleSeconds: toNumber(row.spendable_idle_seconds),
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
        total_idle_seconds: number | string;
        spendable_idle_seconds: number | string;
        last_collected_at: Date;
        updated_at: Date;
      }>(
        `
        SELECT total_idle_seconds, spendable_idle_seconds, last_collected_at
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
      const elapsedSeconds = calculateElapsedSeconds(lockedRow.last_collected_at, collectedAt);
      const updateResult = await client.query<{
        total_idle_seconds: number | string;
        spendable_idle_seconds: number | string;
        last_collected_at: Date;
      }>(
        `
        UPDATE player_states
        SET
          total_idle_seconds = total_idle_seconds + $2::BIGINT,
          spendable_idle_seconds = spendable_idle_seconds + $2::BIGINT,
          last_collected_at = $3,
          updated_at = $3
        WHERE user_id = $1
        RETURNING total_idle_seconds, spendable_idle_seconds, last_collected_at
        `,
        [userId, elapsedSeconds, collectedAt]
      );

      const row = updateResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      await client.query("COMMIT");
      res.json({
        collectedSeconds: elapsedSeconds,
        totalIdleSeconds: toNumber(row.total_idle_seconds),
        collectedIdleSeconds: toNumber(row.spendable_idle_seconds),
        lastCollectedAt: row.last_collected_at.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
