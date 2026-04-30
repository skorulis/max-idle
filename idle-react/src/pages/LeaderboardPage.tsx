import { XIcon, XShareButton } from "react-share";
import { BlueskyShareButton, BlueskyIcon } from "react-share";
import { FacebookShareButton, FacebookIcon } from "react-share";
import { RedditShareButton, RedditIcon } from "react-share";
import { formatSeconds } from "../formatSeconds";
import type { LeaderboardResponse, LeaderboardType } from "../app/types";
import { RankedPlayerRow } from "./RankedPlayerRow";

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
  const currentPlayer = leaderboard?.currentPlayer ?? null;
  const shareIdleMetric = leaderboardType === "current" || leaderboardType === "collected";
  const shareDuration =
    shareIdleMetric && currentPlayer ? formatSeconds(currentPlayer.totalIdleSeconds) : null;
  const shareText =
    shareIdleMetric && currentPlayer && shareDuration
      ? `I'm rank #${currentPlayer.rank} in the worlds most pointless game after earning ${shareDuration} of idle time`
      : null;
  const shareUrl = "https://max-idle.com/leaderboard";

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
        <button
          type="button"
          className={`secondary${leaderboardType === "time_gems" ? " leaderboard-type-active" : ""}`}
          onClick={() => onTypeChange("time_gems")}
          disabled={leaderboardLoading}
        >
          Time gems
        </button>
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
                valueKind={leaderboardType === "time_gems" ? "time_gems" : "idle_seconds"}
              />
            ))}
          </div>
          {leaderboard.currentPlayer && !leaderboard.currentPlayer.inTop ? (
            <p className="subtle">
              Your rank is #{leaderboard.currentPlayer.rank} with{" "}
              {leaderboardType === "time_gems"
                ? `${leaderboard.currentPlayer.totalIdleSeconds.toLocaleString()} time gem${leaderboard.currentPlayer.totalIdleSeconds === 1 ? "" : "s"}`
                : formatSeconds(leaderboard.currentPlayer.totalIdleSeconds)}
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
    </>
  );
}
