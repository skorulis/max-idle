import express from "express";
import type { Pool } from "pg";
import type { ShopState } from "@maxidle/shared/shop";
import { isTournamentFeatureUnlocked } from "@maxidle/shared/shop";
import type { AuthClaims } from "../types.js";
import { enterCurrentTournament, finalizeDueTournaments, getCurrentTournamentForUser } from "../tournaments.js";

type RegisterTournamentRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
};

async function loadShopForUser(pool: Pool, userId: string): Promise<ShopState | null> {
  const result = await pool.query<{ shop: ShopState }>(
    `
    SELECT shop
    FROM player_states
    WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows[0]?.shop ?? null;
}

export function registerTournamentRoutes({ app, pool, resolveIdentity }: RegisterTournamentRoutesOptions): void {
  app.get("/tournament/current", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const shop = await loadShopForUser(pool, identity.claims.sub);
      if (!shop || !isTournamentFeatureUnlocked(shop)) {
        res.status(403).json({
          error: "Purchase Weekly Tournament in the shop to enter.",
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

  app.post("/tournament/enter", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const shop = await loadShopForUser(pool, identity.claims.sub);
      if (!shop || !isTournamentFeatureUnlocked(shop)) {
        res.status(403).json({
          error: "Purchase Weekly Tournament in the shop to enter.",
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
      next(error);
    }
  });
}
