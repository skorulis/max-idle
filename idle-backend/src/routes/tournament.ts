import express from "express";
import type { Pool } from "pg";
import { isTournamentFeatureUnlocked } from "@maxidle/shared/obligations";
import type { AuthClaims } from "../types.js";
import { parseObligationsCompleted } from "../obligationsState.js";
import {
  collectTournamentReward,
  debugFinalizeCurrentTournament,
  enterCurrentTournament,
  finalizeDueTournaments,
  getCurrentTournamentForUser,
  getTournamentHistoryForUser
} from "../tournaments.js";

type RegisterTournamentRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  isProduction: boolean;
};

async function loadObligationsForUser(pool: Pool, userId: string): Promise<Record<string, boolean>> {
  const result = await pool.query<{ obligations_completed: unknown }>(
    `
    SELECT obligations_completed
    FROM player_states
    WHERE user_id = $1
    `,
    [userId]
  );
  return parseObligationsCompleted(result.rows[0]?.obligations_completed);
}

export function registerTournamentRoutes({ app, pool, resolveIdentity, isProduction }: RegisterTournamentRoutesOptions): void {
  app.get("/tournament/current", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const obligationsCompleted = await loadObligationsForUser(pool, identity.claims.sub);
      if (!isTournamentFeatureUnlocked(obligationsCompleted)) {
        res.status(403).json({
          error: 'Complete "Wait it out" to enter tournaments.',
          code: "TOURNAMENT_FEATURE_LOCKED"
        });
        return;
      }
      const tournament = await getCurrentTournamentForUser(pool, identity.claims.sub);
      res.json(tournament);
    } catch (error) {
      next(error);
    }
  });

  app.get("/tournament/history", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const obligationsCompleted = await loadObligationsForUser(pool, identity.claims.sub);
      if (!isTournamentFeatureUnlocked(obligationsCompleted)) {
        res.status(403).json({
          error: 'Complete "Wait it out" to enter tournaments.',
          code: "TOURNAMENT_FEATURE_LOCKED"
        });
        return;
      }
      const history = await getTournamentHistoryForUser(pool, identity.claims.sub);
      res.json({ history });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tournament/enter", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const obligationsCompleted = await loadObligationsForUser(pool, identity.claims.sub);
      if (!isTournamentFeatureUnlocked(obligationsCompleted)) {
        res.status(403).json({
          error: 'Complete "Wait it out" to enter tournaments.',
          code: "TOURNAMENT_FEATURE_LOCKED"
        });
        return;
      }
      const result = await enterCurrentTournament(pool, identity.claims.sub);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "TOURNAMENT_DRAW_IN_PROGRESS") {
        res.status(409).json({
          error: "Tournament draw is being finalized. Please retry in a moment.",
          code: "TOURNAMENT_DRAW_IN_PROGRESS"
        });
        return;
      }
      if (error instanceof Error && error.message === "TOURNAMENT_REWARD_UNCOLLECTED") {
        res.status(409).json({
          error: "Collect your prior tournament reward before entering a new one.",
          code: "TOURNAMENT_REWARD_UNCOLLECTED"
        });
        return;
      }
      next(error);
    }
  });

  app.post("/tournament/collect-reward", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const obligationsCompleted = await loadObligationsForUser(pool, identity.claims.sub);
      if (!isTournamentFeatureUnlocked(obligationsCompleted)) {
        res.status(403).json({
          error: 'Complete "Wait it out" to enter tournaments.',
          code: "TOURNAMENT_FEATURE_LOCKED"
        });
        return;
      }
      const result = await collectTournamentReward(pool, identity.claims.sub);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "NO_TOURNAMENT_REWARD_TO_COLLECT") {
        res.status(400).json({
          error: "No tournament reward to collect.",
          code: "NO_TOURNAMENT_REWARD_TO_COLLECT"
        });
        return;
      }
      next(error);
    }
  });

  if (isProduction) {
    return;
  }

  app.post("/tournament/debug/finalize-current", async (req, res, next) => {
    try {
      await resolveIdentity(req);
      const result = await debugFinalizeCurrentTournament(pool);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
