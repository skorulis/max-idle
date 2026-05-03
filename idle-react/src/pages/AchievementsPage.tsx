import { Check, Lock } from "lucide-react";
import { ACHIEVEMENTS, totalAchievementLevelSlots, type AchievementId } from "../achievements";
import type { AchievementsResponse } from "../app/types";
import { formatSeconds } from "../formatSeconds";
import GameIcon from "../GameIcon";
import { getLucidIcon } from "../getLucidIcon";

type AchievementsPageProps = {
  achievements: AchievementsResponse | null;
  achievementsLoading: boolean;
  hasError: boolean;
};

export function AchievementsPage({ achievements, achievementsLoading, hasError }: AchievementsPageProps) {
  const achievementDefinitionById = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
  const renderAchievementStatus = (achievement: AchievementsResponse["achievements"][number], isCompleted: boolean) => {
    const hasLevels = achievement.maxLevel > 1;
    if (hasLevels && !isCompleted) {
      const inProgressTier = achievement.level + 1;
      return (
        <span className="achievement-status" aria-label={`Level ${inProgressTier} of ${achievement.maxLevel}`}>
          {inProgressTier}/{achievement.maxLevel}
        </span>
      );
    }
    if (isCompleted) {
      return (
        <span className="achievement-status" aria-label="Complete">
          <GameIcon icon={Check} />
        </span>
      );
    }
    return (
      <span className="achievement-status" aria-label="Locked">
        <GameIcon icon={Lock} />
      </span>
    );
  };

  const renderCollectedLeveledTierStatus = (achievement: AchievementsResponse["achievements"][number]) => (
    <span
      className="achievement-status"
      aria-label={`Collected level ${achievement.level} of ${achievement.maxLevel}`}
    >
      <GameIcon icon={Check} /> {achievement.level}/{achievement.maxLevel}
    </span>
  );

  const inProgressAchievements = achievements?.achievements.filter((achievement) => !achievement.completed) ?? [];

  type CollectedRow = {
    key: string;
    achievement: AchievementsResponse["achievements"][number];
    /** Highest completed tier (0-based), only for partial leveled rows shown in Collected */
    collectedTierIndex: number | null;
  };

  const collectedRows: CollectedRow[] = (() => {
    const maxed = achievements?.achievements.filter((achievement) => achievement.completed) ?? [];
    const partialLeveledCollected =
      achievements?.achievements.filter(
        (achievement) => !achievement.completed && achievement.maxLevel > 1 && achievement.level > 0
      ) ?? [];
    return [...maxed, ...partialLeveledCollected]
      .map((achievement) =>
        achievement.completed
          ? { key: achievement.id, achievement, collectedTierIndex: null as number | null }
          : {
              key: `${achievement.id}-collected-progress`,
              achievement,
              collectedTierIndex: achievement.level - 1
            }
      )
      .sort((left, right) => {
        const leftGrantedAtMs = left.achievement.grantedAt
          ? new Date(left.achievement.grantedAt).getTime()
          : Number.NEGATIVE_INFINITY;
        const rightGrantedAtMs = right.achievement.grantedAt
          ? new Date(right.achievement.grantedAt).getTime()
          : Number.NEGATIVE_INFINITY;
        return rightGrantedAtMs - leftGrantedAtMs;
      });
  })();
  const formatGrantedDate = (grantedAt: string | null): string | null => {
    if (!grantedAt) {
      return null;
    }
    const parsed = new Date(grantedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toLocaleDateString();
  };

  const renderAchievementDisplayName = (
    achievement: AchievementsResponse["achievements"][number],
    collectedTierIndex: number | null = null
  ): string => {
    const definition = achievementDefinitionById.get(achievement.id as AchievementId);
    const levels = definition?.levels;
    if (
      collectedTierIndex !== null &&
      levels &&
      collectedTierIndex >= 0 &&
      collectedTierIndex < levels.length
    ) {
      const tier = levels[collectedTierIndex];
      return tier?.name ?? achievement.name;
    }
    if (!levels || levels.length === 0) {
      return achievement.name;
    }
    if (achievement.completed) {
      const lastTier = levels[achievement.maxLevel - 1];
      if (lastTier?.name) {
        return lastTier.name;
      }
    } else if (achievement.level < levels.length) {
      const tier = levels[achievement.level];
      if (tier?.name) {
        return tier.name;
      }
    }
    return achievement.name;
  };

  const renderAchievementDescription = (
    achievement: AchievementsResponse["achievements"][number],
    collectedTierIndex: number | null = null
  ): string => {
    const definition = achievementDefinitionById.get(achievement.id as AchievementId);
    const levels = definition?.levels;
    if (!definition || !levels || levels.length === 0) {
      return achievement.description;
    }
    const formatWithValue = (value: number) => {
      if (!definition.description.includes("%s")) {
        return definition.description;
      }
      const display =
        definition.levelValueDisplay === "time_seconds" ? formatSeconds(value) : String(value);
      return definition.description.replace("%s", display);
    };
    if (
      collectedTierIndex !== null &&
      collectedTierIndex >= 0 &&
      collectedTierIndex < levels.length
    ) {
      return formatWithValue(levels[collectedTierIndex].value);
    }
    if (achievement.level < levels.length) {
      return formatWithValue(levels[achievement.level].value);
    }
    return formatWithValue(levels[levels.length - 1].value);
  };

  return (
    <section className="card">
      <h2>Achievements</h2>
      {achievementsLoading ? <p>Loading achievements...</p> : null}
      {!achievementsLoading && achievements ? (
        <>
          <p className="subtle">
            Completed {achievements.completedCount} of {totalAchievementLevelSlots()}
          </p>
          <p className="subtle">Earnings bonus multiplier: x{achievements.earningsBonusMultiplier.toFixed(2)}</p>
          <h3>In Progress</h3>
          <div className="achievements-list">
            {inProgressAchievements.map((achievement) => (
              <div key={achievement.id} className="achievement-row">
                <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                <div className="achievement-copy">
                  <p className="achievement-name">{renderAchievementDisplayName(achievement)}</p>
                  <p className="achievement-description">{renderAchievementDescription(achievement)}</p>
                </div>
                {renderAchievementStatus(achievement, false)}
              </div>
            ))}
          </div>
          <h3>Collected</h3>
          <div className="achievements-list">
            {collectedRows.map(({ key, achievement, collectedTierIndex }) => {
              const grantedDate = formatGrantedDate(achievement.grantedAt);
              const isPartialLeveledCollected =
                collectedTierIndex !== null && achievement.maxLevel > 1 && !achievement.completed;
              return (
                <div key={key} className="achievement-row achievement-row-completed">
                  <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                  <div className="achievement-copy">
                    <p className="achievement-name">
                      {renderAchievementDisplayName(achievement, collectedTierIndex)}
                    </p>
                    <p className="achievement-description">
                      {renderAchievementDescription(achievement, collectedTierIndex)}
                    </p>
                    {grantedDate ? (
                      <p className="achievement-description">Granted {grantedDate}</p>
                    ) : null}
                  </div>
                  {isPartialLeveledCollected
                    ? renderCollectedLeveledTierStatus(achievement)
                    : renderAchievementStatus(achievement, true)}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {!achievementsLoading && !achievements && !hasError ? <p>No achievements available.</p> : null}
    </section>
  );
}
