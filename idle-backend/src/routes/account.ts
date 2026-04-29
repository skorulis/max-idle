import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { validateEmailPasswordInput } from "@maxidle/shared/authValidation";
import { verifyToken } from "../auth.js";
import { ensureGameIdentityForAuthUser, getRequestHeaders, type BetterAuthInstance } from "../betterAuth.js";
import { grantAchievement } from "../achievementUpdates.js";
import type { AuthClaims } from "../types.js";
import { containsProfanity, isValidUsername } from "../username.js";

export type BetterAuthSession = {
  session: {
    id: string;
  };
  user: {
    id: string;
    email: string | null;
  };
} | null;

export async function buildAccountPayloadForIdentity(
  pool: Pool,
  socialConfig: { googleEnabled: boolean; appleEnabled: boolean },
  identity: { claims: AuthClaims; session: BetterAuthSession }
): Promise<{
  isAnonymous: boolean;
  email: string | null;
  username: string | null;
  gameUserId: string;
  canUpgrade?: boolean;
  socialProviders: { googleEnabled: boolean; appleEnabled: boolean };
}> {
  if (identity.session?.user.id) {
    const client = await pool.connect();
    try {
      const gameUserId = identity.claims.sub;
      const result = await client.query<{ email: string | null; username: string }>(
        `SELECT email, username FROM users WHERE id = $1`,
        [gameUserId]
      );
      const userRow = result.rows[0];

      return {
        isAnonymous: false,
        email: userRow?.email ?? identity.session.user.email,
        username: userRow?.username ?? null,
        gameUserId,
        socialProviders: socialConfig
      };
    } finally {
      client.release();
    }
  }

  const userResult = await pool.query<{ email: string | null; username: string | null }>(
    `SELECT email, username FROM users WHERE id = $1`,
    [identity.claims.sub]
  );
  return {
    isAnonymous: true,
    email: userResult.rows[0]?.email ?? null,
    username: userResult.rows[0]?.username ?? null,
    gameUserId: identity.claims.sub,
    canUpgrade: true,
    socialProviders: socialConfig
  };
}

type RegisterAccountRoutesOptions = {
  app: express.Express;
  pool: Pool;
  auth: BetterAuthInstance;
  jwtSecret: string;
  socialConfig: { googleEnabled: boolean; appleEnabled: boolean };
  readBearerToken: (req: express.Request) => string | null;
  getSession: (auth: BetterAuthInstance, req: express.Request) => Promise<BetterAuthSession>;
  resolveIdentity: (
    auth: BetterAuthInstance,
    pool: Pool,
    jwtSecret: string,
    req: express.Request
  ) => Promise<{ claims: AuthClaims; session: BetterAuthSession }>;
  relayAuthResponse: (authResponse: Response, res: express.Response) => Promise<unknown>;
  applySetCookieHeaders: (target: express.Response, source: Response) => void;
  findGameUserIdByEmail: (pool: Pool, email: string) => Promise<string | null>;
  ensureEmailPasswordAuthAllowed: (pool: Pool, email: string, res: express.Response) => Promise<boolean>;
};

export function registerAccountRoutes({
  app,
  pool,
  auth,
  jwtSecret,
  socialConfig,
  readBearerToken,
  getSession,
  resolveIdentity,
  relayAuthResponse,
  applySetCookieHeaders,
  findGameUserIdByEmail,
  ensureEmailPasswordAuthAllowed
}: RegisterAccountRoutesOptions): void {
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

      const claims = verifyToken(token, jwtSecret);
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

      const anonymousClaims = verifyToken(token, jwtSecret);
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

      const anonymousClaims = verifyToken(token, jwtSecret);
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
      const identity = await resolveIdentity(auth, pool, jwtSecret, req);

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
}
