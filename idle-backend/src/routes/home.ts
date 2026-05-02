import express from "express";
import type { Pool } from "pg";
import type { ShopState } from "@maxidle/shared/shop";
import { isTournamentFeatureUnlocked } from "@maxidle/shared/shop";
import type { AuthClaims } from "../types.js";
import { finalizeDueTournaments, getCurrentTournamentForUser } from "../tournaments.js";
import type { BetterAuthSession } from "./account.js";
import { buildAccountPayloadForIdentity } from "./account.js";
import { buildPlayerStatePayload } from "./player.js";
import { getAvailableSurveySummaryForUser } from "./surveys.js";

type RegisterHomeRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims; session: BetterAuthSession }>;
  toNumber: (value: unknown) => number;
  socialConfig: { googleEnabled: boolean; appleEnabled: boolean };
};

export function registerHomeRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  socialConfig
}: RegisterHomeRoutesOptions): void {
  app.get("/home", async (req, res, next) => {
    try {
      let identity: { claims: AuthClaims; session: BetterAuthSession };
      try {
        identity = await resolveIdentity(req);
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_IDENTITY") {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        throw error;
      }

      req.auth = identity.claims;
      await finalizeDueTournaments(pool);
      const userId = identity.claims.sub;

      const playerPayload = await buildPlayerStatePayload(pool, userId, toNumber);

      if (!playerPayload) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const shop = playerPayload.shop as ShopState;
      const [accountPayload, tournamentPayload, availableSurvey] = await Promise.all([
        buildAccountPayloadForIdentity(pool, socialConfig, identity),
        isTournamentFeatureUnlocked(shop)
          ? getCurrentTournamentForUser(pool, userId, new Date(), { includeNearbyEntries: false })
          : Promise.resolve(null),
        getAvailableSurveySummaryForUser(pool, userId)
      ]);

      res.json({
        player: playerPayload,
        account: accountPayload,
        tournament: tournamentPayload,
        availableSurvey
      });
    } catch (error) {
      next(error);
    }
  });
}
