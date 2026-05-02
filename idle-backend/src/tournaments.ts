import type { Pool, PoolClient } from "pg";
import { ACHIEVEMENT_IDS, GEM_HOARDER_MIN_AVAILABLE_GEMS, type AchievementId } from "@maxidle/shared/achievements";
import type { ShopState } from "@maxidle/shared/shop";
import {
  isAchievementMaxed,
  mergeAchievementLevels,
  normalizeAchievementLevels,
  updatePlayerAchievementLevels
} from "./achievementUpdates.js";
import { boostedUncollectedIdleSeconds } from "./boostedUncollectedIdle.js";

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

type TournamentRow = {
  id: number;
  draw_at_utc: Date;
  is_active: boolean;
};

type TournamentEntryRow = {
  id: number;
  user_id: string;
  entered_at: Date;
  shop: ShopState;
  last_collected_at: Date;
  real_time_available: string | number;
  achievement_count: string | number;
};

export type TournamentEntrySummary = {
  enteredAt: string;
  finalRank: number | null;
  timeScoreSeconds: number | null;
  gemsAwarded: number | null;
  finalizedAt: string | null;
};

export type TournamentCurrentSummary = {
  drawAt: string;
  isActive: boolean;
  hasEntered: boolean;
  playerCount: number;
  currentRank: number | null;
  expectedRewardGems: number | null;
  nearbyEntries: TournamentRankedEntry[];
  entry: TournamentEntrySummary | null;
};
export type TournamentRankedEntry = {
  rank: number;
  userId: string;
  username: string;
  timeScoreSeconds: number;
  isCurrentPlayer: boolean;
};


export type TournamentEnterResult = {
  tournament: TournamentCurrentSummary;
  enteredNow: boolean;
};

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export function getNextTournamentDrawAt(from: Date): Date {
  const todayUtcStart = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const daysUntilSunday = (7 - from.getUTCDay()) % 7;
  let drawAtMs = todayUtcStart + daysUntilSunday * 24 * 60 * 60 * 1000;
  if (drawAtMs <= from.getTime()) {
    drawAtMs += WEEK_IN_MS;
  }
  return new Date(drawAtMs);
}

async function insertActiveTournamentWithDrawAt(client: PoolClient, drawAtUtc: Date): Promise<TournamentRow> {
  try {
    const insertResult = await client.query<TournamentRow>(
      `
      INSERT INTO tournaments (draw_at_utc, is_active)
      VALUES ($1, TRUE)
      RETURNING id, draw_at_utc, is_active
      `,
      [drawAtUtc]
    );
    return insertResult.rows[0];
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const retryResult = await client.query<TournamentRow>(
      `
      SELECT id, draw_at_utc, is_active
      FROM tournaments
      WHERE is_active = TRUE
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `
    );
    const activeTournament = retryResult.rows[0];
    if (!activeTournament) {
      throw new Error("Failed to resolve active tournament after unique conflict");
    }
    return activeTournament;
  }
}

async function ensureActiveTournament(client: PoolClient, now: Date): Promise<TournamentRow> {
  const existingResult = await client.query<TournamentRow>(
    `
    SELECT id, draw_at_utc, is_active
    FROM tournaments
    WHERE is_active = TRUE
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
    `
  );
  const existing = existingResult.rows[0];
  if (existing) {
    return existing;
  }

  const drawAt = getNextTournamentDrawAt(now);
  try {
    const insertResult = await client.query<TournamentRow>(
      `
      INSERT INTO tournaments (draw_at_utc, is_active)
      VALUES ($1, TRUE)
      RETURNING id, draw_at_utc, is_active
      `,
      [drawAt]
    );
    return insertResult.rows[0];
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const retryResult = await client.query<TournamentRow>(
      `
      SELECT id, draw_at_utc, is_active
      FROM tournaments
      WHERE is_active = TRUE
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `
    );
    const activeTournament = retryResult.rows[0];
    if (!activeTournament) {
      throw new Error("Failed to resolve active tournament after unique conflict");
    }
    return activeTournament;
  }
}

async function getTournamentEntry(client: PoolClient, tournamentId: number, userId: string): Promise<TournamentEntrySummary | null> {
  const entryResult = await client.query<{
    entered_at: Date;
    final_rank: string | number | null;
    time_score_seconds: string | number | null;
    gems_awarded: string | number | null;
    finalized_at: Date | null;
  }>(
    `
    SELECT entered_at, final_rank, time_score_seconds, gems_awarded, finalized_at
    FROM tournament_entries
    WHERE tournament_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [tournamentId, userId]
  );
  const entry = entryResult.rows[0];
  if (!entry) {
    return null;
  }
  return {
    enteredAt: entry.entered_at.toISOString(),
    finalRank: entry.final_rank === null ? null : toNumber(entry.final_rank),
    timeScoreSeconds: entry.time_score_seconds === null ? null : toNumber(entry.time_score_seconds),
    gemsAwarded: entry.gems_awarded === null ? null : toNumber(entry.gems_awarded),
    finalizedAt: entry.finalized_at ? entry.finalized_at.toISOString() : null
  };
}

async function getTournamentEntriesForScoring(
  client: PoolClient,
  tournamentId: number
): Promise<
  Array<{
    user_id: string;
    username: string;
    entered_at: Date;
    shop: ShopState;
    last_collected_at: Date;
    real_time_available: string | number;
    achievement_count: string | number;
  }>
> {
  const result = await client.query<{
    user_id: string;
    username: string;
    entered_at: Date;
    shop: ShopState;
    last_collected_at: Date;
    real_time_available: string | number;
    achievement_count: string | number;
  }>(
    `
    SELECT
      te.user_id,
      u.username,
      te.entered_at,
      ps.shop,
      ps.last_collected_at,
      ps.real_time_available,
      ps.achievement_count
    FROM tournament_entries te
    INNER JOIN player_states ps ON ps.user_id = te.user_id
    INNER JOIN users u ON u.id = te.user_id
    WHERE te.tournament_id = $1
    ORDER BY te.entered_at ASC, te.user_id ASC
    `,
    [tournamentId]
  );
  return result.rows;
}

function calculateExpectedGemsByRank(rankIndexZeroBased: number, totalEntries: number): number {
  const rewardBucket = Math.floor((rankIndexZeroBased * 5) / totalEntries) + 1;
  return 6 - rewardBucket;
}

async function buildTournamentSummary(
  client: PoolClient,
  tournament: TournamentRow,
  userId: string,
  now: Date,
  options?: { includeNearbyEntries?: boolean }
): Promise<TournamentCurrentSummary> {
  const includeNearbyEntries = options?.includeNearbyEntries !== false;
  const entry = await getTournamentEntry(client, tournament.id, userId);
  const playerCountResult = await client.query<{ player_count: string | number }>(
    `
    SELECT COUNT(*) AS player_count
    FROM tournament_entries
    WHERE tournament_id = $1
    `,
    [tournament.id]
  );
  const playerCount = toNumber(playerCountResult.rows[0]?.player_count ?? 0);

  if (!entry) {
    return {
      drawAt: tournament.draw_at_utc.toISOString(),
      isActive: tournament.is_active,
      hasEntered: false,
      playerCount,
      currentRank: null,
      expectedRewardGems: null,
      nearbyEntries: [],
      entry: null
    };
  }

  if (entry.finalRank !== null && entry.gemsAwarded !== null) {
    return {
      drawAt: tournament.draw_at_utc.toISOString(),
      isActive: tournament.is_active,
      hasEntered: true,
      playerCount,
      currentRank: entry.finalRank,
      expectedRewardGems: entry.gemsAwarded,
      nearbyEntries: [],
      entry
    };
  }

  const entriesForScoring = await getTournamentEntriesForScoring(client, tournament.id);
  const scoredEntries = entriesForScoring
    .map((row) => {
      const achievementCount = toNumber(row.achievement_count);
      const score = boostedUncollectedIdleSeconds(
        row.last_collected_at,
        now,
        row.shop,
        achievementCount,
        toNumber(row.real_time_available)
      );
      return {
        userId: row.user_id,
        username: row.username,
        enteredAtMs: row.entered_at.getTime(),
        score
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.enteredAtMs !== b.enteredAtMs) {
        return a.enteredAtMs - b.enteredAtMs;
      }
      return a.userId.localeCompare(b.userId);
    });

  const userRankIndex = scoredEntries.findIndex((row) => row.userId === userId);
  const currentRank = userRankIndex >= 0 ? userRankIndex + 1 : null;
  const expectedRewardGems = userRankIndex >= 0 ? calculateExpectedGemsByRank(userRankIndex, scoredEntries.length) : null;
  const nearbyEntries =
    includeNearbyEntries && userRankIndex >= 0
      ? scoredEntries
          .slice(Math.max(0, userRankIndex - 20), Math.min(scoredEntries.length, userRankIndex + 21))
          .map((row, index) => {
            const absoluteIndex = Math.max(0, userRankIndex - 20) + index;
            return {
              rank: absoluteIndex + 1,
              userId: row.userId,
              username: row.username,
              timeScoreSeconds: row.score,
              isCurrentPlayer: row.userId === userId
            };
          })
      : [];

  return {
    drawAt: tournament.draw_at_utc.toISOString(),
    isActive: tournament.is_active,
    hasEntered: true,
    playerCount,
    currentRank,
    expectedRewardGems,
    nearbyEntries,
    entry
  };
}

export async function getCurrentTournamentForUser(
  pool: Pool,
  userId: string,
  now = new Date(),
  options?: { includeNearbyEntries?: boolean }
): Promise<TournamentCurrentSummary> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tournament = await ensureActiveTournament(client, now);
    const summary = await buildTournamentSummary(client, tournament, userId, now, options);
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function enterCurrentTournament(pool: Pool, userId: string, now = new Date()): Promise<TournamentEnterResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tournament = await ensureActiveTournament(client, now);
    if (tournament.draw_at_utc.getTime() <= now.getTime()) {
      await client.query("ROLLBACK");
      throw new Error("TOURNAMENT_DRAW_IN_PROGRESS");
    }

    const existingEntry = await getTournamentEntry(client, tournament.id, userId);
    let enteredNow = false;
    if (!existingEntry) {
      await client.query(
        `
        INSERT INTO tournament_entries (tournament_id, user_id, entered_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (tournament_id, user_id) DO NOTHING
        `,
        [tournament.id, userId, now]
      );
      enteredNow = true;
    }
    const summary = await buildTournamentSummary(client, tournament, userId, now);
    await client.query("COMMIT");
    return {
      tournament: summary,
      enteredNow
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeTournamentCore(client: PoolClient, tournament: TournamentRow, now: Date): Promise<void> {
  const entriesResult = await client.query<TournamentEntryRow>(
    `
    SELECT
      te.id,
      te.user_id,
      te.entered_at,
      ps.shop,
      ps.last_collected_at,
      ps.real_time_available,
      ps.achievement_count
    FROM tournament_entries te
    INNER JOIN player_states ps ON ps.user_id = te.user_id
    WHERE te.tournament_id = $1
    ORDER BY te.id ASC
    FOR UPDATE
    `,
    [tournament.id]
  );

  for (const row of entriesResult.rows) {
    const achievementCount = toNumber(row.achievement_count);
    const score = boostedUncollectedIdleSeconds(
      row.last_collected_at,
      now,
      row.shop,
      achievementCount,
      toNumber(row.real_time_available)
    );
    await client.query(
      `
      UPDATE tournament_entries
      SET
        time_score_seconds = $2
      WHERE id = $1
      `,
      [row.id, score]
    );
    await client.query(
      `
      UPDATE player_states
      SET
        current_seconds = $2,
        current_seconds_last_updated = $3
      WHERE user_id = $1
      `,
      [row.user_id, score, now]
    );
  }

  const scoredEntriesResult = await client.query<{
    id: number;
    user_id: string;
    entered_at: Date;
    time_score_seconds: string | number | null;
  }>(
    `
    SELECT id, user_id, entered_at, time_score_seconds
    FROM tournament_entries
    WHERE tournament_id = $1
    ORDER BY time_score_seconds DESC, entered_at ASC, user_id ASC
    FOR UPDATE
    `,
    [tournament.id]
  );
  const scoredEntries = scoredEntriesResult.rows;
  const totalEntries = scoredEntries.length;
  for (let index = 0; index < totalEntries; index += 1) {
    const entry = scoredEntries[index];
    const rank = index + 1;
    const rewardBucket = Math.floor((index * 5) / totalEntries) + 1;
    const gemsAwarded = 6 - rewardBucket;
    await client.query(
      `
      UPDATE tournament_entries
      SET
        final_rank = $2,
        gems_awarded = $3,
        finalized_at = $4
      WHERE id = $1
      `,
      [entry.id, rank, gemsAwarded, now]
    );
    const gemUpdate = await client.query<{
      time_gems_available: string | number;
      achievement_levels: unknown;
      achievement_count: string | number;
      has_unseen_achievements: boolean;
    }>(
      `
      UPDATE player_states
      SET
        time_gems_total = time_gems_total + $2,
        time_gems_available = time_gems_available + $2,
        updated_at = $3
      WHERE user_id = $1
      RETURNING
        time_gems_available,
        achievement_levels,
        achievement_count,
        has_unseen_achievements
      `,
      [entry.user_id, gemsAwarded, now]
    );
    const afterGems = gemUpdate.rows[0];
    if (afterGems && toNumber(afterGems.time_gems_available) >= GEM_HOARDER_MIN_AVAILABLE_GEMS) {
      const achievementLevels = normalizeAchievementLevels(afterGems.achievement_levels, now);
      const currentLevelById = new Map<AchievementId, number>(
        achievementLevels.map((entry) => [entry.id, entry.level] as const)
      );
      if (!isAchievementMaxed(currentLevelById.get(ACHIEVEMENT_IDS.GEM_HOARDER) ?? 0, ACHIEVEMENT_IDS.GEM_HOARDER)) {
        const nextAchievementLevels = mergeAchievementLevels(
          afterGems.achievement_levels,
          new Map([[ACHIEVEMENT_IDS.GEM_HOARDER, 1]]),
          now
        );
        await updatePlayerAchievementLevels(client, entry.user_id, nextAchievementLevels);
      }
    }
  }

  await client.query(
    `
    UPDATE tournaments
    SET
      is_active = FALSE,
      finalized_at = $2
    WHERE id = $1
    `,
    [tournament.id, now]
  );
}

async function finalizeOneDueTournament(pool: Pool, now: Date): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dueTournamentResult = await client.query<TournamentRow>(
      `
      SELECT id, draw_at_utc, is_active
      FROM tournaments
      WHERE is_active = TRUE
        AND draw_at_utc <= $1
      ORDER BY draw_at_utc ASC, id ASC
      LIMIT 1
      FOR UPDATE
      `,
      [now]
    );
    const dueTournament = dueTournamentResult.rows[0];
    if (!dueTournament) {
      await client.query("COMMIT");
      return 0;
    }

    await finalizeTournamentCore(client, dueTournament, now);
    await ensureActiveTournament(client, new Date(dueTournament.draw_at_utc.getTime() + 1));
    await client.query("COMMIT");
    return 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type DebugFinalizeCurrentTournamentResult =
  | {
      ok: true;
      finalizedTournamentId: number;
      newTournamentId: number;
      drawAtUtc: string;
      entryCount: number;
    }
  | { ok: false; reason: "NO_ACTIVE_TOURNAMENT" };

export async function debugFinalizeCurrentTournament(pool: Pool, now = new Date()): Promise<DebugFinalizeCurrentTournamentResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activeResult = await client.query<TournamentRow>(
      `
      SELECT id, draw_at_utc, is_active
      FROM tournaments
      WHERE is_active = TRUE
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
      `
    );
    const active = activeResult.rows[0];
    if (!active) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "NO_ACTIVE_TOURNAMENT" };
    }

    const countResult = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM tournament_entries WHERE tournament_id = $1`,
      [active.id]
    );
    const entryCount = toNumber(countResult.rows[0]?.n ?? 0);

    const savedDrawAt = active.draw_at_utc;
    await finalizeTournamentCore(client, active, now);
    const inserted = await insertActiveTournamentWithDrawAt(client, savedDrawAt);

    await client.query("COMMIT");
    return {
      ok: true,
      finalizedTournamentId: active.id,
      newTournamentId: inserted.id,
      drawAtUtc: savedDrawAt.toISOString(),
      entryCount
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeDueTournaments(pool: Pool, now = new Date()): Promise<number> {
  let finalizedCount = 0;
  while (true) {
    const finalizedThisPass = await finalizeOneDueTournament(pool, now);
    if (finalizedThisPass === 0) {
      return finalizedCount;
    }
    finalizedCount += finalizedThisPass;
  }
}

export function getDelayUntilNextTournamentDrawMs(now: Date): number {
  const nextDrawAt = getNextTournamentDrawAt(now);
  return Math.max(1_000, nextDrawAt.getTime() - now.getTime());
}
