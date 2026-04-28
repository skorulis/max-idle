import type { Pool } from "pg";
import { ACHIEVEMENTS, type AchievementId } from "@maxidle/shared/achievements";

type Queryable = Pick<Pool, "query">;

const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

export type CompletedAchievementEntry = {
  id: AchievementId;
  grantedAt: string;
};

type LegacyCompletedAchievementEntry = {
  id?: unknown;
  grantedAt?: unknown;
};

function isKnownAchievementId(value: string): value is AchievementId {
  return KNOWN_ACHIEVEMENT_IDS.has(value);
}

function parseCompletedAchievementEntries(value: unknown): CompletedAchievementEntry[] {
  const parsed: LegacyCompletedAchievementEntry[] = [];
  if (Array.isArray(value)) {
    parsed.push(...value);
  } else if (typeof value === "string") {
    try {
      const json = JSON.parse(value) as unknown;
      if (Array.isArray(json)) {
        parsed.push(...json);
      }
    } catch {
      return [];
    }
  } else {
    return [];
  }

  const entries: CompletedAchievementEntry[] = [];
  const seenIds = new Set<AchievementId>();
  for (const item of parsed) {
    if (typeof item === "string") {
      if (isKnownAchievementId(item) && !seenIds.has(item)) {
        seenIds.add(item);
        entries.push({ id: item, grantedAt: "" });
      }
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const id = item.id;
    if (typeof id !== "string" || !isKnownAchievementId(id) || seenIds.has(id)) {
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

export function parseCompletedAchievementIds(value: unknown): string[] {
  return parseCompletedAchievementEntries(value).map((entry) => entry.id);
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

export async function updateCompletedAchievements(
  db: Queryable,
  userId: string,
  completedAchievements: CompletedAchievementEntry[]
): Promise<void> {
  await db.query(
    `
    UPDATE player_states
    SET
      completed_achievements = $2::jsonb,
      achievement_count = $3,
      has_unseen_achievements = TRUE
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(completedAchievements), completedAchievements.length]
  );
}

export async function grantAchievement(db: Queryable, userId: string, achievementId: AchievementId): Promise<void> {
  const playerStateResult = await db.query<{ completed_achievements: unknown }>(
    `SELECT completed_achievements FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const playerStateRow = playerStateResult.rows[0];
  if (!playerStateRow) {
    throw new Error("PLAYER_STATE_NOT_FOUND");
  }

  const completedAchievements = normalizeCompletedAchievements(playerStateRow.completed_achievements, [achievementId]);
  await updateCompletedAchievements(db, userId, completedAchievements);
}
