import type { Pool } from "pg";
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, type AchievementId } from "@maxidle/shared/achievements";

type Queryable = Pick<Pool, "query">;

const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
const MAX_LEVEL_BY_ACHIEVEMENT_ID = new Map(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement.levels?.length ?? 1] as const)
);

export type CompletedAchievementEntry = {
  id: AchievementId;
  grantedAt: string;
};

export type AchievementLevelEntry = {
  id: AchievementId;
  level: number;
  grantedAt: string;
};

type LegacyCompletedAchievementEntry = {
  id?: unknown;
  grantedAt?: unknown;
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
  idle_time_collector_3h_7m: ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR
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

function parseCompletedAchievementEntries(value: unknown): CompletedAchievementEntry[] {
  const parsed = parseArrayLikeEntries<LegacyCompletedAchievementEntry>(value);

  const entries: CompletedAchievementEntry[] = [];
  const seenIds = new Set<AchievementId>();
  for (const item of parsed) {
    if (typeof item === "string") {
      const id = canonicalizeStoredAchievementId(item);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        entries.push({ id, grantedAt: "" });
      }
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const idRaw = item.id;
    if (typeof idRaw !== "string") {
      continue;
    }
    const id = canonicalizeStoredAchievementId(idRaw);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    entries.push({
      id,
      grantedAt: typeof item.grantedAt === "string" ? item.grantedAt : ""
    });
  }
  return entries;
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
    seenIds.add(id);
    entries.push({
      id,
      level: Math.min(level, MAX_LEVEL_BY_ACHIEVEMENT_ID.get(id) ?? 1),
      grantedAt: typeof item.grantedAt === "string" ? item.grantedAt : ""
    });
  }
  return entries;
}

export function parseCompletedAchievementIds(value: unknown): string[] {
  return parseCompletedAchievementEntries(value).map((entry) => entry.id);
}

export function getMaxAchievementLevel(achievementId: AchievementId): number {
  return MAX_LEVEL_BY_ACHIEVEMENT_ID.get(achievementId) ?? 1;
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

export function normalizeAchievementLevels(
  achievementLevelsValue: unknown,
  completedAchievementsValue: unknown,
  grantedAt: Date = new Date()
): AchievementLevelEntry[] {
  const grantedAtIso = grantedAt.toISOString();
  const levelById = new Map<AchievementId, AchievementLevelEntry>();
  for (const entry of parseAchievementLevelEntries(achievementLevelsValue)) {
    levelById.set(entry.id, {
      ...entry,
      grantedAt: entry.grantedAt || grantedAtIso
    });
  }
  if (levelById.size === 0) {
    for (const legacyEntry of parseCompletedAchievementEntries(completedAchievementsValue)) {
      levelById.set(legacyEntry.id, {
        id: legacyEntry.id,
        level: 1,
        grantedAt: legacyEntry.grantedAt || grantedAtIso
      });
    }
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
  currentCompletedAchievementsValue: unknown,
  nextLevelsById: Map<AchievementId, number>,
  grantedAt: Date = new Date()
): AchievementLevelEntry[] {
  const grantedAtIso = grantedAt.toISOString();
  const mergedById = new Map<AchievementId, AchievementLevelEntry>();
  for (const entry of normalizeAchievementLevels(currentAchievementLevelsValue, currentCompletedAchievementsValue, grantedAt)) {
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

export function normalizeCompletedAchievements(
  currentValue: unknown,
  idsToAdd: string[] = [],
  grantedAt: Date = new Date()
): CompletedAchievementEntry[] {
  const grantedAtIso = grantedAt.toISOString();
  const ordered: CompletedAchievementEntry[] = [];
  const seen = new Set<AchievementId>();
  const addIfKnown = (id: string, existingGrantedAt = "") => {
    if (!isKnownAchievementId(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    ordered.push({
      id,
      grantedAt: existingGrantedAt || grantedAtIso
    });
  };

  for (const existing of parseCompletedAchievementEntries(currentValue)) {
    addIfKnown(existing.id, existing.grantedAt);
  }
  for (const idToAdd of idsToAdd) {
    addIfKnown(idToAdd);
  }

  return ordered;
}

export function toCompletedAchievementsFromLevels(levelEntries: AchievementLevelEntry[]): CompletedAchievementEntry[] {
  return levelEntries.map((entry) => ({
    id: entry.id,
    grantedAt: entry.grantedAt
  }));
}

export function sumAchievementLevels(levelEntries: AchievementLevelEntry[]): number {
  return levelEntries.reduce((sum, entry) => sum + entry.level, 0);
}

export async function updateCompletedAchievements(
  db: Queryable,
  userId: string,
  completedAchievements: CompletedAchievementEntry[],
  achievementLevels: AchievementLevelEntry[] = completedAchievements.map((entry) => ({ ...entry, level: 1 }))
): Promise<void> {
  const achievementCount = sumAchievementLevels(achievementLevels);
  await db.query(
    `
    UPDATE player_states
    SET
      completed_achievements = $2::jsonb,
      achievement_levels = $3::jsonb,
      achievement_count = $4,
      has_unseen_achievements = TRUE
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(completedAchievements), JSON.stringify(achievementLevels), achievementCount]
  );
}

export async function grantAchievement(db: Queryable, userId: string, achievementId: AchievementId): Promise<void> {
  const playerStateResult = await db.query<{ completed_achievements: unknown; achievement_levels: unknown }>(
    `SELECT completed_achievements, achievement_levels FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const playerStateRow = playerStateResult.rows[0];
  if (!playerStateRow) {
    throw new Error("PLAYER_STATE_NOT_FOUND");
  }

  const achievementLevels = mergeAchievementLevels(
    playerStateRow.achievement_levels,
    playerStateRow.completed_achievements,
    new Map([[achievementId, 1]])
  );
  const completedAchievements = toCompletedAchievementsFromLevels(achievementLevels);
  await updateCompletedAchievements(db, userId, completedAchievements, achievementLevels);
}
