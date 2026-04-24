import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENTS } from "@maxidle/shared/achievements";
import type { AuthClaims } from "../types.js";

type RegisterAchievementsRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
  getAchievementBonusMultiplier: (achievementCount: number) => number;
  parseCompletedAchievementIds: (value: unknown) => string[];
};

export function registerAchievementsRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  getAchievementBonusMultiplier,
  parseCompletedAchievementIds
}: RegisterAchievementsRoutesOptions): void {
  app.get("/achievements", async (req, res, next) => {
    try {
      let identity: { claims: AuthClaims };
      try {
        identity = await resolveIdentity(req);
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

  app.post("/achievements/seen", async (req, res, next) => {
    try {
      let identity: { claims: AuthClaims };
      try {
        identity = await resolveIdentity(req);
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_IDENTITY") {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        throw error;
      }

      const result = await pool.query<{ user_id: string }>(
        `
        UPDATE player_states
        SET has_unseen_achievements = FALSE
        WHERE user_id = $1
        RETURNING user_id
        `,
        [identity.claims.sub]
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
