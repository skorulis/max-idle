import { Link } from "react-router-dom";
import { formatSeconds } from "../formatSeconds";

type RankedPlayerRowProps = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
  /** When set, the numeric column shows time gems instead of a duration. */
  valueKind?: "idle_seconds" | "time_gems";
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
      ? `${totalIdleSeconds.toLocaleString()} time gem${totalIdleSeconds === 1 ? "" : "s"}`
      : formatSeconds(totalIdleSeconds);
  return (
    <div className={`leaderboard-row${isCurrentPlayer ? " leaderboard-row-current" : ""}`}>
      <p>#{rank}</p>
      <p>
        <Link className="leaderboard-player-link" to={`/player/${encodeURIComponent(userId)}`}>
          {username}
        </Link>
      </p>
      <p>{valueLabel}</p>
    </div>
  );
}
