import { Link } from "react-router-dom";
import { formatSeconds } from "../formatSeconds";

type RankedPlayerRowProps = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
};

export function RankedPlayerRow({ rank, userId, username, totalIdleSeconds, isCurrentPlayer }: RankedPlayerRowProps) {
  return (
    <div className={`leaderboard-row${isCurrentPlayer ? " leaderboard-row-current" : ""}`}>
      <p>#{rank}</p>
      <p>
        <Link className="leaderboard-player-link" to={`/player/${encodeURIComponent(userId)}`}>
          {username}
        </Link>
      </p>
      <p>{formatSeconds(totalIdleSeconds)}</p>
    </div>
  );
}
