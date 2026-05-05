import type { Pool } from "pg";
import type { ShopState } from "@maxidle/shared/shop";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";

/** Row snapshot with server_time from the same DB clock used for the idle calculation. */
export type PlayerCurrentSecondsSourceRow = {
  last_collected_at: Date;
  shop: ShopState;
  achievement_count: number;
  real_time_available: number;
  server_time: Date;
};

export async function persistCurrentSecondsFromPlayerRow(
  pool: Pool,
  userId: string,
  row: PlayerCurrentSecondsSourceRow,
  toNumber: (value: unknown) => number
): Promise<number> {
  const achievementCount = toNumber(row.achievement_count);
  const currentIdleSeconds = boostedUncollectedIdleSeconds(
    row.last_collected_at,
    row.server_time,
    row.shop,
    achievementCount,
    toNumber(row.real_time_available)
  );
  await pool.query(
    `
    UPDATE player_states
    SET
      current_seconds = $2,
      current_seconds_last_updated = $3
    WHERE user_id = $1
    `,
    [userId, currentIdleSeconds, row.server_time]
  );
  return currentIdleSeconds;
}

/** Loads latest player row, recomputes current idle from clock and shop state, persists, returns seconds or null if missing. */
export async function refreshStoredCurrentIdleSeconds(
  pool: Pool,
  userId: string,
  toNumber: (value: unknown) => number
): Promise<number | null> {
  const result = await pool.query<PlayerCurrentSecondsSourceRow>(
    `
    SELECT
      last_collected_at,
      shop,
      achievement_count,
      real_time_available,
      NOW() AS server_time
    FROM player_states
    WHERE user_id = $1
    `,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return persistCurrentSecondsFromPlayerRow(pool, userId, row, toNumber);
}
