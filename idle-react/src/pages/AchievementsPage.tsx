import { Check, Lock } from "lucide-react";
import type { AchievementsResponse } from "../app/types";
import GameIcon from "../GameIcon";
import { getLucidIcon } from "../getLucidIcon";

type AchievementsPageProps = {
  achievements: AchievementsResponse | null;
  achievementsLoading: boolean;
  hasError: boolean;
};

export function AchievementsPage({ achievements, achievementsLoading, hasError }: AchievementsPageProps) {
  const inProgressAchievements = achievements?.achievements.filter((achievement) => !achievement.completed) ?? [];
  const collectedAchievements = achievements?.achievements.filter((achievement) => achievement.completed) ?? [];

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
                  <p className="achievement-description">{achievement.description}</p>
                </div>
                <span
                  className="achievement-status"
                  aria-label="Locked"
                >
                  <GameIcon icon={Lock} />
                </span>
              </div>
            ))}
          </div>
          <h3>Collected</h3>
          <div className="achievements-list">
            {collectedAchievements.map((achievement) => (
              <div key={achievement.id} className="achievement-row achievement-row-completed">
                <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                <div className="achievement-copy">
                  <p className="achievement-name">{achievement.name}</p>
                  <p className="achievement-description">{achievement.description}</p>
                </div>
                <span className="achievement-status" aria-label="Complete">
                  <GameIcon icon={Check} />
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {!achievementsLoading && !achievements && !hasError ? <p>No achievements available.</p> : null}
    </>
  );
}
