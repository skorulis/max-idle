import type { Pool } from "pg";
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, type AchievementId } from "@maxidle/shared/achievements";

type Queryable = Pick<Pool, "query">;

const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
const MAX_LEVEL_BY_ACHIEVEMENT_ID = new Map(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement.levels?.length ?? 1] as const)
);

export type AchievementLevelEntry = {
  id: AchievementId;
  level: number;
  grantedAt: string;
};

type LegacyAchievementLevelEntry = {
  id?: unknown;
  level?: unknown;
  grantedAt?: unknown;
};

function isKnownAchievementId(value: string): value is AchievementId {
  return KNOWN_ACHIEVEMENT_IDS.has(value);
}

const LEGACY_ACHIEVEMENT_ID_TO_CANONICAL: Readonly<Record<string, AchievementId>> = {
  idle_time_collector_3h_7m: ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR,
  real_time_streak_2d_14h: ACHIEVEMENT_IDS.REAL_TIME_STREAK
};

/** Maps stored achievement ids (including pre-rename ids) to the canonical {@link AchievementId}. */
export function canonicalizeStoredAchievementId(id: string): AchievementId | null {
  const mapped = LEGACY_ACHIEVEMENT_ID_TO_CANONICAL[id] ?? id;
  return isKnownAchievementId(mapped) ? mapped : null;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const floored = Math.floor(value);
  if (floored < 1) {
    return null;
  }
  return floored;
}

function parseArrayLikeEntries<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseAchievementLevelEntries(value: unknown): AchievementLevelEntry[] {
  const parsed = parseArrayLikeEntries<LegacyAchievementLevelEntry>(value);
  const entries: AchievementLevelEntry[] = [];
  const seenIds = new Set<AchievementId>();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const idRaw = item.id;
    const level = toPositiveInteger(item.level);
    if (typeof idRaw !== "string" || level === null) {
      continue;
    }
    const id = canonicalizeStoredAchievementId(idRaw);
    if (!id || seenIds.has(id)) {
      continue;
    }
    let resolvedLevel = level;
    if (idRaw === "real_time_streak_2d_14h" && id === ACHIEVEMENT_IDS.REAL_TIME_STREAK && resolvedLevel >= 1) {
      resolvedLevel = Math.max(resolvedLevel, 3);
    }
    seenIds.add(id);
    entries.push({
      id,
      level: Math.min(resolvedLevel, MAX_LEVEL_BY_ACHIEVEMENT_ID.get(id) ?? 1),
      grantedAt: typeof item.grantedAt === "string" ? item.grantedAt : ""
    });
  }
  return entries;
}

export function getMaxAchievementLevel(achievementId: AchievementId): number {
  return MAX_LEVEL_BY_ACHIEVEMENT_ID.get(achievementId) ?? 1;
}

export function isAchievementMaxed(currentLevel: number, achievementId: AchievementId): boolean {
  return currentLevel >= getMaxAchievementLevel(achievementId);
}

export function getAchievementLevelForValue(achievementId: AchievementId, value: number): number {
  const definition = ACHIEVEMENTS.find((achievement) => achievement.id === achievementId);
  if (!definition) {
    return 0;
  }
  if (!definition.levels || definition.levels.length === 0) {
    return value > 0 ? 1 : 0;
  }
  let level = 0;
  for (let index = 0; index < definition.levels.length; index += 1) {
    if (value >= definition.levels[index].value) {
      level = index + 1;
    }
  }
  return level;
}

export function normalizeAchievementLevels(achievementLevelsValue: unknown, grantedAt: Date = new Date()): AchievementLevelEntry[] {
  const grantedAtIso = grantedAt.toISOString();
  const levelById = new Map<AchievementId, AchievementLevelEntry>();
  for (const entry of parseAchievementLevelEntries(achievementLevelsValue)) {
    levelById.set(entry.id, {
      ...entry,
      grantedAt: entry.grantedAt || grantedAtIso
    });
  }
  return ACHIEVEMENTS.flatMap((achievement) => {
    const entry = levelById.get(achievement.id);
    if (!entry) {
      return [];
    }
    return [
      {
        id: achievement.id,
        level: Math.min(Math.max(1, entry.level), getMaxAchievementLevel(achievement.id)),
        grantedAt: entry.grantedAt || grantedAtIso
      }
    ];
  });
}

export function mergeAchievementLevels(
  currentAchievementLevelsValue: unknown,
  nextLevelsById: Map<AchievementId, number>,
  grantedAt: Date = new Date()
): AchievementLevelEntry[] {
  const grantedAtIso = grantedAt.toISOString();
  const mergedById = new Map<AchievementId, AchievementLevelEntry>();
  for (const entry of normalizeAchievementLevels(currentAchievementLevelsValue, grantedAt)) {
    mergedById.set(entry.id, entry);
  }
  for (const [id, requestedLevel] of nextLevelsById.entries()) {
    const clampedLevel = Math.min(Math.max(1, requestedLevel), getMaxAchievementLevel(id));
    const existing = mergedById.get(id);
    mergedById.set(id, {
      id,
      level: existing ? Math.max(existing.level, clampedLevel) : clampedLevel,
      grantedAt: existing?.grantedAt || grantedAtIso
    });
  }
  return ACHIEVEMENTS.flatMap((achievement) => {
    const entry = mergedById.get(achievement.id);
    return entry ? [entry] : [];
  });
}

export function sumAchievementLevels(levelEntries: AchievementLevelEntry[]): number {
  return levelEntries.reduce((sum, entry) => sum + entry.level, 0);
}

export async function updatePlayerAchievementLevels(db: Queryable, userId: string, achievementLevels: AchievementLevelEntry[]): Promise<void> {
  const achievementCount = sumAchievementLevels(achievementLevels);
  await db.query(
    `
    UPDATE player_states
    SET
      achievement_levels = $2::jsonb,
      achievement_count = $3,
      has_unseen_achievements = TRUE
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(achievementLevels), achievementCount]
  );
}

export async function grantAchievement(db: Queryable, userId: string, achievementId: AchievementId): Promise<void> {
  const playerStateResult = await db.query<{ achievement_levels: unknown }>(
    `SELECT achievement_levels FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const playerStateRow = playerStateResult.rows[0];
  if (!playerStateRow) {
    throw new Error("PLAYER_STATE_NOT_FOUND");
  }

  const achievementLevels = mergeAchievementLevels(playerStateRow.achievement_levels, new Map([[achievementId, 1]]));
  await updatePlayerAchievementLevels(db, userId, achievementLevels);
}
