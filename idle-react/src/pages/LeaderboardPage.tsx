import { XIcon, XShareButton } from "react-share";
import { BlueskyShareButton, BlueskyIcon } from "react-share";
import { FacebookShareButton, FacebookIcon } from "react-share";
import { RedditShareButton, RedditIcon } from "react-share";
import { formatSeconds } from "../formatSeconds";
import type { LeaderboardResponse, LeaderboardType } from "../app/types";
import { RankedPlayerRow } from "./RankedPlayerRow";

function formatLeaderboardValue(leaderboardType: LeaderboardType, value: number): string {
  if (leaderboardType === "time_gems") {
    return `${value.toLocaleString()} gem${value === 1 ? "" : "s"}`;
  }
  if (leaderboardType === "max_multiplier") {
    return `${value.toFixed(2)}x`;
  }
  if (leaderboardType === "level") {
    return `level ${Math.floor(value)}`;
  }
  return formatSeconds(value);
}

function leaderboardValueKind(leaderboardType: LeaderboardType): "idle_seconds" | "time_gems" | "max_multiplier" | "level" {
  if (leaderboardType === "time_gems") {
    return "time_gems";
  }
  if (leaderboardType === "max_multiplier") {
    return "max_multiplier";
  }
  if (leaderboardType === "level") {
    return "level";
  }
  return "idle_seconds";
}

function leaderboardShareText(
  leaderboardType: LeaderboardType,
  currentPlayer: LeaderboardResponse["currentPlayer"]
): string | null {
  if (!currentPlayer) {
    return null;
  }
  const rankPhrase = `I'm rank #${currentPlayer.rank} in the worlds most pointless game`;

  switch (leaderboardType) {
    case "collected": {
      const duration = formatSeconds(currentPlayer.totalIdleSeconds);
      return `${rankPhrase} after collecting ${duration} of idle time`;
    }
    case "collected_real": {
      const duration = formatSeconds(currentPlayer.totalIdleSeconds);
      return `${rankPhrase} after collecting ${duration} of real time`;
    }
    case "current": {
      const duration = formatSeconds(currentPlayer.totalIdleSeconds);
      return `${rankPhrase} patiently holding ${duration} of idle time`;
    }
    case "max_multiplier": {
      const multiplier = currentPlayer.totalIdleSeconds.toFixed(2);
      return `${rankPhrase} with a peak idle multiplier of ${multiplier}x`;
    }
    case "time_gems": {
      const gems = currentPlayer.totalIdleSeconds;
      const gemsLabel = `${gems.toLocaleString()} gem${gems === 1 ? "" : "s"}`;
      return `${rankPhrase} after collecting ${gemsLabel}`;
    }
    case "level": {
      const level = Math.floor(currentPlayer.totalIdleSeconds);
      return `${rankPhrase} at level ${level}`;
    }
    default:
      return null;
  }
}

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
  const shareText = leaderboardShareText(leaderboardType, leaderboard?.currentPlayer ?? null);
  const shareUrl = "https://max-idle.com/leaderboard";

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      {showStartJourneyButton ? (
        <button type="button" className="collect leaderboard-start-journey-button" onClick={() => void onStartJourney()}>
          Start your idle journey
        </button>
      ) : null}
      <div className="leaderboard-type-toggles">
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
            Collected idle
          </button>
          <button
            type="button"
            className={`secondary${leaderboardType === "time_gems" ? " leaderboard-type-active" : ""}`}
            onClick={() => onTypeChange("time_gems")}
            disabled={leaderboardLoading}
          >
            Time gems
          </button>
        </div>
        <div className="leaderboard-type-toggle">
          <button
            type="button"
            className={`secondary${leaderboardType === "collected_real" ? " leaderboard-type-active" : ""}`}
            onClick={() => onTypeChange("collected_real")}
            disabled={leaderboardLoading}
          >
            Collected real
          </button>
          <button
            type="button"
            className={`secondary${leaderboardType === "max_multiplier" ? " leaderboard-type-active" : ""}`}
            onClick={() => onTypeChange("max_multiplier")}
            disabled={leaderboardLoading}
          >
            Peak multiplier
          </button>
          <button
            type="button"
            className={`secondary${leaderboardType === "level" ? " leaderboard-type-active" : ""}`}
            onClick={() => onTypeChange("level")}
            disabled={leaderboardLoading}
          >
            Level
          </button>
        </div>
      </div>
      {leaderboardLoading ? <p>Loading leaderboard...</p> : null}
      {!leaderboardLoading && leaderboard ? (
        <>
          <div className="leaderboard-list">
            {leaderboard.entries.map((entry) => (
              <RankedPlayerRow
                key={entry.userId}
                rank={entry.rank}
                userId={entry.userId}
                username={entry.username}
                totalIdleSeconds={entry.totalIdleSeconds}
                isCurrentPlayer={entry.isCurrentPlayer}
                valueKind={leaderboardValueKind(leaderboardType)}
              />
            ))}
          </div>
          {leaderboard.currentPlayer && !leaderboard.currentPlayer.inTop ? (
            <p className="subtle">
              Your rank is #{leaderboard.currentPlayer.rank} with{" "}
              {formatLeaderboardValue(leaderboardType, leaderboard.currentPlayer.totalIdleSeconds)}
              .
            </p>
          ) : null}
          {shareText ? (
            <div className="leaderboard-share">
              <p className="subtle">Share your rank:</p>
              <div className="leaderboard-share-actions">
                <XShareButton title={shareText} url={shareUrl}>
                  <XIcon size={32} round />
                </XShareButton>
                <FacebookShareButton hashtag="#idle" title={shareText} url={shareUrl} aria-label="Share on Facebook">
                  <FacebookIcon size={32} round />
                </FacebookShareButton>
                <BlueskyShareButton title={shareText} url={shareUrl} aria-label="Share on Bluesky">
                  <BlueskyIcon size={32} round />
                </BlueskyShareButton>
                <RedditShareButton title={shareText} url={shareUrl} aria-label="Share on Reddit">
                  <RedditIcon size={32} round />
                </RedditShareButton>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {!leaderboardLoading && !leaderboard && !hasError ? <p>No leaderboard data available.</p> : null}
    </section>
  );
}
