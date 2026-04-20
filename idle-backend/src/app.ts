import { randomUUID } from "node:crypto";
import express from "express";
import type { Pool } from "pg";
import { signAnonymousToken } from "./auth";
import { requireAuth } from "./middleware";
import { calculateElapsedSeconds } from "./time";

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

export function createApp(pool: Pool, jwtSecret: string) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/auth/anonymous", async (_req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = randomUUID();
      await client.query("BEGIN");
      await client.query(`INSERT INTO users (id, is_anonymous) VALUES ($1, TRUE)`, [userId]);
      await client.query(`INSERT INTO player_states (user_id) VALUES ($1)`, [userId]);
      await client.query("COMMIT");

      const token = signAnonymousToken(userId, jwtSecret);
      res.status(201).json({ userId, token });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.get("/player", requireAuth(jwtSecret), async (req, res, next) => {
    try {
      const userId = req.auth?.sub;
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

  app.post("/player/collect", requireAuth(jwtSecret), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = req.auth?.sub;
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
