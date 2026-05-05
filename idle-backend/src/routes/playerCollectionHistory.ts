import express from "express";
import type { Pool } from "pg";
import type { AuthClaims } from "../types.js";

const COLLECTION_HISTORY_LIMIT = 100;

type CollectionHistoryRow = {
  id: number;
  collection_date: Date;
  real_time: number;
  idle_time: number;
};

export type CollectionHistoryItemResponse = {
  id: number;
  collectionDate: string;
  realTime: number;
  idleTime: number;
};

type RegisterPlayerCollectionHistoryRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: AuthClaims }>;
  toNumber: (value: unknown) => number;
};

export function registerPlayerCollectionHistoryRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber
}: RegisterPlayerCollectionHistoryRoutesOptions): void {
  app.get("/player/collection-history", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      req.auth = identity.claims;
      const userId = identity.claims.sub;

      const result = await pool.query<CollectionHistoryRow>(
        `
        SELECT id, collection_date, real_time, idle_time
        FROM player_collection_history
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT $2
        `,
        [userId, COLLECTION_HISTORY_LIMIT]
      );

      const history: CollectionHistoryItemResponse[] = result.rows.map((row) => ({
        id: toNumber(row.id),
        collectionDate: row.collection_date.toISOString(),
        realTime: toNumber(row.real_time),
        idleTime: toNumber(row.idle_time)
      }));

      res.json({ history });
    } catch (error) {
      next(error);
    }
  });
}
