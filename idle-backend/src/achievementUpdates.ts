import type { Pool } from "pg";
import { ACHIEVEMENTS, type AchievementId } from "@maxidle/shared/achievements";

type Queryable = Pick<Pool, "query">;

const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

export function parseCompletedAchievementIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeCompletedAchievementIds(currentValue: unknown, idsToAdd: string[] = []): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const addIfKnown = (id: string) => {
    if (!KNOWN_ACHIEVEMENT_IDS.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    ordered.push(id);
  };

  for (const existingId of parseCompletedAchievementIds(currentValue)) {
    addIfKnown(existingId);
  }
  for (const idToAdd of idsToAdd) {
    addIfKnown(idToAdd);
  }

  return ordered;
}

export async function updateCompletedAchievements(db: Queryable, userId: string, completedAchievementIds: string[]): Promise<void> {
  await db.query(
    `
    UPDATE player_states
    SET
      completed_achievements = $2::jsonb,
      achievement_count = $3
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(completedAchievementIds), completedAchievementIds.length]
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

  const completedAchievementIds = normalizeCompletedAchievementIds(playerStateRow.completed_achievements, [achievementId]);
  await updateCompletedAchievements(db, userId, completedAchievementIds);
}
