import express from "express";
import type { Pool } from "pg";
import type { AuthClaims } from "./types.js";

type LeaderboardRouteIdentity = {
  claims: AuthClaims;
};

type RegisterLeaderboardRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<LeaderboardRouteIdentity>;
  toNumber: (value: unknown) => number;
};

export function registerLeaderboardRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber
}: RegisterLeaderboardRoutesOptions): void {
  app.get("/leaderboard", async (req, res, next) => {
    try {
      const requestedType = String(req.query.type ?? "current").toLowerCase();
      const leaderboardType = requestedType === "collected" || requestedType === "current" ? requestedType : null;
      if (!leaderboardType) {
        res.status(400).json({ error: "Invalid leaderboard type" });
        return;
      }

      const metricExpression = leaderboardType === "collected" ? "ps.idle_time_total" : "ps.current_seconds";

      let identity: LeaderboardRouteIdentity;
      try {
        identity = await resolveIdentity(req);
      } catch (error) {
        if (error instanceof Error && error.message === "MISSING_IDENTITY") {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        throw error;
      }

      const leaderboardResult = await pool.query<{
        user_id: string;
        username: string;
        leaderboard_seconds: string;
      }>(
        `
        SELECT
          ps.user_id,
          u.username,
          ${metricExpression} AS leaderboard_seconds
        FROM player_states ps
        INNER JOIN users u ON u.id = ps.user_id
        ORDER BY ${metricExpression} DESC
        LIMIT 200
        `
      );

      const currentPlayerResult = await pool.query<{
        user_id: string;
        leaderboard_seconds: string;
      }>(
        `
        SELECT
          ps.user_id,
          ${metricExpression} AS leaderboard_seconds
        FROM player_states ps
        WHERE ps.user_id = $1
        `,
        [identity.claims.sub]
      );

      const currentPlayerRow = currentPlayerResult.rows[0];
      if (!currentPlayerRow) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      const higherRankCountResult = await pool.query<{ higher_count: string }>(
        `SELECT COUNT(*) AS higher_count FROM player_states ps WHERE ${metricExpression} > $1`,
        [currentPlayerRow.leaderboard_seconds]
      );
      const currentPlayerRank = toNumber(higherRankCountResult.rows[0]?.higher_count ?? 0) + 1;

      let previousTotalIdleSeconds: number | null = null;
      let previousRank = 0;
      const entries = leaderboardResult.rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        totalIdleSeconds: toNumber(row.leaderboard_seconds)
      }));

      const rankedEntries = entries.map((entry, index) => {
        const rank =
          previousTotalIdleSeconds !== null && entry.totalIdleSeconds === previousTotalIdleSeconds
            ? previousRank
            : index + 1;
        previousTotalIdleSeconds = entry.totalIdleSeconds;
        previousRank = rank;
        return {
          ...entry,
          rank,
          isCurrentPlayer: entry.userId === identity.claims.sub
        };
      });

      res.json({
        type: leaderboardType,
        entries: rankedEntries,
        currentPlayer: {
          userId: currentPlayerRow.user_id,
          rank: currentPlayerRank,
          totalIdleSeconds: toNumber(currentPlayerRow.leaderboard_seconds),
          inTop: rankedEntries.some((entry) => entry.isCurrentPlayer)
        }
      });
    } catch (error) {
      next(error);
    }
  });
}
