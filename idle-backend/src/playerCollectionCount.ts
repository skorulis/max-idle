import type { Pool, PoolClient } from "pg";

/** Rows in `player_collection_history` for this user (idle collects). */
export async function getPlayerCollectionCount(db: Pool | PoolClient, userId: string): Promise<number> {
  const r = await db.query<{ c: unknown }>(
    `SELECT COUNT(*)::bigint AS c FROM player_collection_history WHERE user_id = $1`,
    [userId]
  );
  const v = r.rows[0]?.c;
  if (typeof v === "bigint") {
    return Number(v);
  }
  if (typeof v === "number") {
    return v;
  }
  if (typeof v === "string") {
    return Number(v);
  }
  return 0;
}
