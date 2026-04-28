import { Link } from "react-router-dom";
import { formatSeconds } from "../formatSeconds";
import type { LeaderboardResponse, LeaderboardType } from "../app/types";

type LeaderboardPageProps = {
  leaderboardType: LeaderboardType;
  leaderboardLoading: boolean;
  leaderboard: LeaderboardResponse | null;
  hasError: boolean;
  showStartJourneyButton: boolean;
  onTypeChange: (type: LeaderboardType) => void;
  onStartJourney: () => Promise<void>;
};

export function LeaderboardPage({
  leaderboardType,
  leaderboardLoading,
  leaderboard,
  hasError,
  showStartJourneyButton,
  onTypeChange,
  onStartJourney
}: LeaderboardPageProps) {
  return (
    <>
      <h2>Leaderboard</h2>
      {showStartJourneyButton ? (
        <button type="button" className="collect leaderboard-start-journey-button" onClick={() => void onStartJourney()}>
          Start your idle journey
        </button>
      ) : null}
      <div className="leaderboard-type-toggle">
        <button
          type="button"
          className={`secondary${leaderboardType === "current" ? " leaderboard-type-active" : ""}`}
          onClick={() => onTypeChange("current")}
          disabled={leaderboardLoading}
        >
          Current idle
        </button>
        <button
          type="button"
          className={`secondary${leaderboardType === "collected" ? " leaderboard-type-active" : ""}`}
          onClick={() => onTypeChange("collected")}
          disabled={leaderboardLoading}
        >
          Collected
        </button>
      </div>
      {leaderboardLoading ? <p>Loading leaderboard...</p> : null}
      {!leaderboardLoading && leaderboard ? (
        <>
          <div className="leaderboard-list">
            {leaderboard.entries.map((entry) => (
              <div key={entry.userId} className={`leaderboard-row${entry.isCurrentPlayer ? " leaderboard-row-current" : ""}`}>
                <p>#{entry.rank}</p>
                <p>
                  <Link className="leaderboard-player-link" to={`/player/${encodeURIComponent(entry.userId)}`}>
                    {entry.username}
                  </Link>
                </p>
                <p>{formatSeconds(entry.totalIdleSeconds)}</p>
              </div>
            ))}
          </div>
          {leaderboard.currentPlayer && !leaderboard.currentPlayer.inTop ? (
            <p className="subtle">
              Your rank is #{leaderboard.currentPlayer.rank} with {formatSeconds(leaderboard.currentPlayer.totalIdleSeconds)}.
            </p>
          ) : null}
        </>
      ) : null}
      {!leaderboardLoading && !leaderboard && !hasError ? <p>No leaderboard data available.</p> : null}
    </>
  );
}
