import { Link } from "react-router-dom";
import { formatSeconds } from "../formatSeconds";

type RankedPlayerRowProps = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
  /** When set, the numeric column shows time gems or peak multiplier instead of a duration. */
  valueKind?: "idle_seconds" | "time_gems" | "max_multiplier";
};

export function RankedPlayerRow({
  rank,
  userId,
  username,
  totalIdleSeconds,
  isCurrentPlayer,
  valueKind = "idle_seconds"
}: RankedPlayerRowProps) {
  const valueLabel =
    valueKind === "time_gems"
      ? `${totalIdleSeconds.toLocaleString()} gem${totalIdleSeconds === 1 ? "" : "s"}`
      : valueKind === "max_multiplier"
        ? `${totalIdleSeconds.toFixed(2)}x`
        : formatSeconds(totalIdleSeconds);
  return (
    <div className={`leaderboard-row${isCurrentPlayer ? " leaderboard-row-current" : ""}`}>
      <p className="leaderboard-rank">#{rank}</p>
      <p>
        <Link className="leaderboard-player-link" to={`/player/${encodeURIComponent(userId)}`}>
          {username}
        </Link>
      </p>
      <p className="leaderboard-value">{valueLabel}</p>
    </div>
  );
}
