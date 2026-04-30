import { Check, Lock } from "lucide-react";
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from "../achievements";
import type { AchievementsResponse } from "../app/types";
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
    if (hasLevels && achievement.level >= 1) {
      return (
        <span className="achievement-status" aria-label={`Level ${achievement.level}`}>
          X{achievement.level}
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

  const inProgressAchievements = achievements?.achievements.filter((achievement) => !achievement.completed) ?? [];
  const collectedAchievements = (achievements?.achievements.filter((achievement) => achievement.completed) ?? []).sort(
    (left, right) => {
      const leftGrantedAtMs = left.grantedAt ? new Date(left.grantedAt).getTime() : Number.NEGATIVE_INFINITY;
      const rightGrantedAtMs = right.grantedAt ? new Date(right.grantedAt).getTime() : Number.NEGATIVE_INFINITY;
      return rightGrantedAtMs - leftGrantedAtMs;
    }
  );
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

  const renderAchievementDescription = (achievement: AchievementsResponse["achievements"][number]): string => {
    if (achievement.id === ACHIEVEMENT_IDS.COLLECTION_COUNT) {
      const levels = achievementDefinitionById.get(achievement.id)?.levels ?? [];
      const nextLevelValue = achievement.level < levels.length ? levels[achievement.level]?.value ?? null : null;
      if (nextLevelValue !== null) {
        return `Collect ${nextLevelValue} times.`;
      }
      return "Collect all levels completed.";
    }
    return achievement.description;
  };

  return (
    <>
      <h2>Achievements</h2>
      {achievementsLoading ? <p>Loading achievements...</p> : null}
      {!achievementsLoading && achievements ? (
        <>
          <p className="subtle">
            Completed {achievements.completedCount} of {achievements.totalCount}
          </p>
          <p className="subtle">Earnings bonus multiplier: x{achievements.earningsBonusMultiplier.toFixed(2)}</p>
          <h3>In Progress</h3>
          <div className="achievements-list">
            {inProgressAchievements.map((achievement) => (
              <div key={achievement.id} className="achievement-row">
                <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                <div className="achievement-copy">
                  <p className="achievement-name">{achievement.name}</p>
                  <p className="achievement-description">{renderAchievementDescription(achievement)}</p>
                </div>
                {renderAchievementStatus(achievement, false)}
              </div>
            ))}
          </div>
          <h3>Collected</h3>
          <div className="achievements-list">
            {collectedAchievements.map((achievement) => {
              const grantedDate = formatGrantedDate(achievement.grantedAt);
              return (
              <div key={achievement.id} className="achievement-row achievement-row-completed">
                <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                <div className="achievement-copy">
                  <p className="achievement-name">{achievement.name}</p>
                  <p className="achievement-description">{renderAchievementDescription(achievement)}</p>
                  {grantedDate ? (
                    <p className="achievement-description">Granted {grantedDate}</p>
                  ) : null}
                </div>
                {renderAchievementStatus(achievement, true)}
              </div>
            );
            })}
          </div>
        </>
      ) : null}
      {!achievementsLoading && !achievements && !hasError ? <p>No achievements available.</p> : null}
    </>
  );
}
