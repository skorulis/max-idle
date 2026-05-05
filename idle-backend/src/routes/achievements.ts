import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENTS, type AchievementId } from "@maxidle/shared/achievements";
import { getWorthwhileAchievementsMultiplier } from "@maxidle/shared/shop";
import type { ShopState } from "@maxidle/shared/shop";
import type { AuthClaims } from "../types.js";
import { getMaxAchievementLevel, grantAchievement, isAchievementMaxed, normalizeAchievementLevels } from "../achievementUpdates.js";

type RegisterAchievementsRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
};

export function registerAchievementsRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber
}: RegisterAchievementsRoutesOptions): void {
  const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

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
        achievement_count: number;
        achievement_levels: unknown;
        shop: ShopState;
      }>(
        `
        SELECT
          achievement_count,
          achievement_levels,
          shop
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

      const achievementLevels = normalizeAchievementLevels(playerStateRow.achievement_levels);
      const levelById = new Map(achievementLevels.map((entry) => [entry.id, entry]));
      const completedCount = toNumber(playerStateRow.achievement_count);
      const earningsBonusMultiplier = getWorthwhileAchievementsMultiplier(playerStateRow.shop, completedCount);
      res.json({
        completedCount,
        earningsBonusMultiplier,
        achievements: ACHIEVEMENTS.map((achievement) => {
          const levelEntry = levelById.get(achievement.id);
          const level = levelEntry?.level ?? 0;
          const maxLevel = getMaxAchievementLevel(achievement.id);
          const completed = isAchievementMaxed(level, achievement.id);
          return {
            ...achievement,
            level,
            maxLevel,
            completed,
            grantedAt: levelEntry?.grantedAt || null
          };
        })
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

  app.post("/achievements/grant", async (req, res, next) => {
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

      const achievementId = typeof req.body?.achievementId === "string" ? req.body.achievementId : "";
      const achievement = ACHIEVEMENTS_BY_ID.get(achievementId);
      if (!achievement) {
        res.status(400).json({ error: "Unknown achievement id", code: "INVALID_ACHIEVEMENT_ID" });
        return;
      }
      if (!achievement.clientDriven) {
        res.status(400).json({ error: "Achievement is not client-driven", code: "ACHIEVEMENT_NOT_CLIENT_DRIVEN" });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await grantAchievement(client, identity.claims.sub, achievementId as AchievementId);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof Error && error.message === "PLAYER_STATE_NOT_FOUND") {
          res.status(404).json({ error: "Player state not found" });
          return;
        }
        throw error;
      } finally {
        client.release();
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
