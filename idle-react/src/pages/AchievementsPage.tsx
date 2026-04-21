import type { AchievementsResponse } from "../app/types";

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
          <div className="achievements-list">
            {achievements.achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`achievement-row${achievement.completed ? " achievement-row-completed" : ""}`}
              >
                <p className="achievement-icon" aria-hidden>
                  {achievement.icon}
                </p>
                <div className="achievement-copy">
                  <p className="achievement-name">{achievement.name}</p>
                  <p className="achievement-description">{achievement.description}</p>
                </div>
                <p className="achievement-status">{achievement.completed ? "Complete" : "Locked"}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {!achievementsLoading && !achievements && !hasError ? <p>No achievements available.</p> : null}
    </>
  );
}
