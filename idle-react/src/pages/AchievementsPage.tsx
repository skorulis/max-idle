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
          <div className="achievements-list">
            {achievements.achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`achievement-row${achievement.completed ? " achievement-row-completed" : ""}`}
              >
                <GameIcon icon={getLucidIcon(achievement.icon)} className="achievement-icon" />
                <div className="achievement-copy">
                  <p className="achievement-name">{achievement.name}</p>
                  <p className="achievement-description">{achievement.description}</p>
                </div>
                <span
                  className="achievement-status"
                  aria-label={achievement.completed ? "Complete" : "Locked"}
                >
                  <GameIcon icon={achievement.completed ? Check : Lock} />
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
