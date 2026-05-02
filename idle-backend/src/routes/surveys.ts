import express from "express";
import type { Pool, PoolClient } from "pg";
import type { AuthClaims } from "../types.js";
import { getSurveyById, pickFirstUncompletedActiveSurvey, type Survey } from "../surveys.js";
import { buildPlayerStatePayload } from "./player.js";

type RegisterSurveyRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
};

async function fetchAnsweredSurveyIds(client: Pool | PoolClient, userId: string): Promise<Set<string>> {
  const result = await client.query<{ survey_id: string }>(
    `
    SELECT survey_id
    FROM survey_answers
    WHERE user_id = $1
    `,
    [userId]
  );
  return new Set(result.rows.map((r) => r.survey_id));
}

export async function getAvailableSurveySummaryForUser(pool: Pool, userId: string): Promise<{
  id: string;
  title: string;
  currencyType: Survey["currencyType"];
  reward: number;
} | null> {
  const answered = await fetchAnsweredSurveyIds(pool, userId);
  const survey = pickFirstUncompletedActiveSurvey(answered);
  if (!survey) {
    return null;
  }
  return {
    id: survey.id,
    title: survey.title,
    currencyType: survey.currencyType,
    reward: survey.reward
  };
}

export function registerSurveyRoutes({ app, pool, resolveIdentity, toNumber }: RegisterSurveyRoutesOptions): void {
  app.get("/surveys/active", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;

      const answered = await fetchAnsweredSurveyIds(pool, userId);
      const survey = pickFirstUncompletedActiveSurvey(answered);
      res.json({ survey: survey ?? null });
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_IDENTITY") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      next(error);
    }
  });

  app.post("/surveys/answer", async (req, res, next) => {
    let userId: string;
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      userId = identity.claims.sub;
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_IDENTITY") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      next(error);
      return;
    }

    const body = req.body as { surveyId?: unknown; optionId?: unknown };
    const surveyId = typeof body.surveyId === "string" ? body.surveyId.trim() : "";
    const optionId = typeof body.optionId === "string" ? body.optionId.trim() : "";
    if (!surveyId || !optionId) {
      res.status(400).json({ error: "surveyId and optionId are required" });
      return;
    }

    const survey = getSurveyById(surveyId);
    if (!survey || !survey.active) {
      res.status(404).json({ error: "Survey not found or inactive", code: "SURVEY_NOT_FOUND" });
      return;
    }
    if (!survey.options.some((o) => o.id === optionId)) {
      res.status(400).json({ error: "Invalid option for this survey", code: "SURVEY_INVALID_OPTION" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockResult = await client.query<{ user_id: string }>(
        `
        SELECT user_id
        FROM player_states
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
      if (!lockResult.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const existingAnswer = await client.query<{ id: string }>(
        `
        SELECT id
        FROM survey_answers
        WHERE user_id = $1 AND survey_id = $2
        FOR UPDATE
        `,
        [userId, surveyId]
      );
      if (existingAnswer.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Survey already completed",
          code: "SURVEY_ALREADY_ANSWERED"
        });
        return;
      }

      await client.query(
        `
        INSERT INTO survey_answers (user_id, survey_id, option_id)
        VALUES ($1, $2, $3)
        `,
        [userId, surveyId, optionId]
      );

      const reward = survey.reward;
      const currency = survey.currencyType;

      await client.query(
        `
        UPDATE player_states
        SET
          idle_time_total = idle_time_total + CASE WHEN $2::text = 'idle' THEN $3::bigint ELSE 0 END,
          idle_time_available = idle_time_available + CASE WHEN $2::text = 'idle' THEN $3::bigint ELSE 0 END,
          real_time_total = real_time_total + CASE WHEN $2::text = 'real' THEN $3::bigint ELSE 0 END,
          real_time_available = real_time_available + CASE WHEN $2::text = 'real' THEN $3::bigint ELSE 0 END,
          time_gems_total = time_gems_total + CASE WHEN $2::text = 'gem' THEN $3::bigint ELSE 0 END,
          time_gems_available = time_gems_available + CASE WHEN $2::text = 'gem' THEN $3::bigint ELSE 0 END,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, currency, reward]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
      return;
    } finally {
      client.release();
    }

    try {
      const payload = await buildPlayerStatePayload(pool, userId, toNumber);
      if (!payload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });
}
