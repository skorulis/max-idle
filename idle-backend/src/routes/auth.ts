import { randomUUID } from "node:crypto";
import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import { validateEmailPasswordInput } from "@maxidle/shared/authValidation";
import { signAnonymousToken } from "../auth.js";
import { ensureGameIdentityForAuthUser, getRequestHeaders, type BetterAuthInstance } from "../betterAuth.js";
import { grantAchievement } from "../achievementUpdates.js";
import { generateAnonymousUsername, isUsernameTakenError } from "../username.js";

type RegisterAuthRoutesOptions = {
  app: express.Express;
  pool: Pool;
  auth: BetterAuthInstance;
  jwtSecret: string;
  findGameUserIdByEmail: (pool: Pool, email: string) => Promise<string | null>;
  ensureEmailPasswordAuthAllowed: (pool: Pool, email: string, res: express.Response) => Promise<boolean>;
  relayAuthResponse: (authResponse: Response, res: express.Response) => Promise<unknown>;
};

export function registerAuthRoutes({
  app,
  pool,
  auth,
  jwtSecret,
  findGameUserIdByEmail,
  ensureEmailPasswordAuthAllowed,
  relayAuthResponse
}: RegisterAuthRoutesOptions): void {
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
            `INSERT INTO player_states (user_id, achievement_count, completed_achievements, achievement_levels, shop, seconds_multiplier) VALUES ($1, 0, '[]'::jsonb, '[]'::jsonb, $2::jsonb, 0)`,
            [
              userId,
              JSON.stringify({
                seconds_multiplier: 0,
                restraint: 0,
                idle_hoarder: 0,
                luck: 0,
                worthwhile_achievements: 0,
                collect_gem_time_boost: 0
              })
            ]
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

      const token = signAnonymousToken(userId, jwtSecret);
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
}
