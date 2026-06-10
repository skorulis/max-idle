import type { Pool } from "pg";
import type { ResearchState } from "@maxidle/shared/research";
import type { ShopState } from "@maxidle/shared/shop";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";
import { getEffectiveIdleSecondsRate } from "./idleRate.js";
import { parseResearchState } from "./researchState.js";
import { calculateElapsedSeconds } from "./time.js";

/** Row snapshot with server_time from the same DB clock used for the idle calculation. */
export type PlayerCurrentSecondsSourceRow = {
  last_collected_at: Date;
  shop: ShopState;
  achievement_count: number;
  real_time_available: number;
  level: number;
  blackhole_time?: number;
  research?: unknown;
  server_time: Date;
};

export function effectiveIdleSecondsRateFromPlayerRow(
  row: PlayerCurrentSecondsSourceRow,
  toNumber: (value: unknown) => number
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(row.last_collected_at, row.server_time);
  const research = parseResearchState(row.research, row.shop);
  return getEffectiveIdleSecondsRate({
    secondsSinceLastCollection: elapsedSinceLastCollection,
    shop: row.shop,
    achievementCount: toNumber(row.achievement_count),
    playerLevel: toNumber(row.level),
    realTimeAvailable: toNumber(row.real_time_available),
    wallClockMs: row.server_time.getTime(),
    blackholeTimeSeconds: toNumber(row.blackhole_time ?? 0),
    research
  });
}

export async function persistCurrentSecondsFromPlayerRow(
  pool: Pool,
  userId: string,
  row: PlayerCurrentSecondsSourceRow,
  toNumber: (value: unknown) => number
): Promise<number> {
  const achievementCount = toNumber(row.achievement_count);
  const research = parseResearchState(row.research, row.shop);
  const currentIdleSeconds = boostedUncollectedIdleSeconds(
    row.last_collected_at,
    row.server_time,
    row.shop,
    achievementCount,
    toNumber(row.real_time_available),
    toNumber(row.level),
    toNumber(row.blackhole_time ?? 0),
    research
  );
  const idleSecondsRate = effectiveIdleSecondsRateFromPlayerRow(row, toNumber);
  await pool.query(
    `
    UPDATE player_states
    SET
      current_seconds = $2,
      current_seconds_last_updated = $3,
      max_multiplier = GREATEST(max_multiplier::double precision, $4::double precision)
    WHERE user_id = $1
    `,
    [userId, currentIdleSeconds, row.server_time, idleSecondsRate]
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
      level,
      blackhole_time,
      research,
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
