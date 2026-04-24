import { BadgeCheck, Check, CircleHelp, Clock3, Lock, UserPlus, Repeat, type LucideIcon } from "lucide-react";
import type { AchievementsResponse } from "../app/types";
import GameIcon from "../GameIcon";

type AchievementsPageProps = {
  achievements: AchievementsResponse | null;
  achievementsLoading: boolean;
  hasError: boolean;
};

function getAchievementIcon(iconName: string): LucideIcon {
  switch (iconName) {
    case "user-plus":
      return UserPlus;
    case "badge-check":
      return BadgeCheck;
    case "clock":
      return Clock3;
    case "repeat":
      return Repeat;
    default:
      return CircleHelp;
  }
}

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
                <GameIcon icon={getAchievementIcon(achievement.icon)} className="achievement-icon" />
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
