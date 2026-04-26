import cors from "cors";
import express from "express";
import type { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { verifyToken } from "./auth.js";
import {
  createBetterAuth,
  ensureGameIdentityForAuthUser,
  getEmailProviderSummary,
  getRequestHeaders,
  type BetterAuthInstance
} from "./betterAuth.js";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { calculateElapsedSeconds } from "./time.js";
import { parseCompletedAchievementIds } from "./achievementUpdates.js";
import { ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION } from "@maxidle/shared/achievements";
import { registerShopRoutes } from "./shop.js";
import { registerLeaderboardRoutes } from "./leaderboard.js";
import { registerApiDocumentation } from "./apiContract.js";
import type { AppConfig, AuthClaims } from "./types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerAchievementsRoutes } from "./routes/achievements.js";
import { registerPlayerRoutes } from "./routes/player.js";
import { registerTournamentRoutes } from "./routes/tournament.js";
import type { ShopState } from "@maxidle/shared/shop";

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

function getAchievementBonusMultiplier(achievementCount: number): number {
  return 1 + Math.max(0, achievementCount) * ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION;
}

type PlayerCurrentSecondsSyncRow = {
  user_id: string;
  current_seconds: number | string;
  current_seconds_last_updated: Date;
  last_collected_at: Date;
  achievement_count: number | string;
  shop: ShopState;
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

  const resolveIdentityForRequest = async (req: express.Request) => {
    const identity = await resolveIdentity(auth, pool, config.jwtSecret, req);
    req.auth = identity.claims;
    return identity;
  };

  registerAuthRoutes({
    app,
    pool,
    auth,
    jwtSecret: config.jwtSecret,
    findGameUserIdByEmail,
    ensureEmailPasswordAuthAllowed,
    relayAuthResponse
  });

  registerAccountRoutes({
    app,
    pool,
    auth,
    jwtSecret: config.jwtSecret,
    socialConfig,
    readBearerToken,
    getSession,
    resolveIdentity,
    relayAuthResponse,
    applySetCookieHeaders,
    findGameUserIdByEmail,
    ensureEmailPasswordAuthAllowed
  });

  registerAchievementsRoutes({
    app,
    pool,
    resolveIdentity: resolveIdentityForRequest,
    toNumber,
    getAchievementBonusMultiplier,
    parseCompletedAchievementIds
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
        shop: ShopState;
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

  registerPlayerRoutes({
    app,
    pool,
    resolveIdentity: resolveIdentityForRequest,
    toNumber,
    getAchievementBonusMultiplier
  });

  registerTournamentRoutes({
    app,
    pool,
    resolveIdentity: resolveIdentityForRequest
  });

  registerShopRoutes({
    app,
    pool,
    resolveIdentity: resolveIdentityForRequest,
    toNumber,
    getAchievementBonusMultiplier,
    isProduction: config.isProduction
  });

  registerLeaderboardRoutes({
    app,
    pool,
    resolveIdentity: resolveIdentityForRequest,
    toNumber
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
