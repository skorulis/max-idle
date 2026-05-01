import { useNavigate } from "react-router-dom";
import type { SyncedPlayerState, SyncedTournamentState } from "../app/types";
import { isTournamentFeatureUnlocked } from "../shop";
import { TournamentPanel } from "./TournamentPanel";
import { RankedPlayerRow } from "./RankedPlayerRow";

type TournamentPageProps = {
  playerState: SyncedPlayerState | null;
  tournamentState: SyncedTournamentState | null;
  tournamentSecondsUntilDraw: number;
  enteringTournament: boolean;
  onEnterTournament: () => Promise<void>;
};

export function TournamentPage({
  playerState,
  tournamentState,
  tournamentSecondsUntilDraw,
  enteringTournament,
  onEnterTournament
}: TournamentPageProps) {
  const navigate = useNavigate();

  if (!playerState) {
    return (
      <section className="card">
        <p className="subtle">Sign in or start idling to view tournament details.</p>
      </section>
    );
  }

  if (!isTournamentFeatureUnlocked(playerState.shop)) {
    return (
      <section className="card">
        <h2>Weekly Tournament</h2>
        <p className="subtle">
          Purchase <strong>Weekly Tournament</strong> in the shop (1 Time Gem) to compete each week for gem rewards.
        </p>
        <button type="button" className="collect" onClick={() => navigate("/shop")}>
          Open shop
        </button>
      </section>
    );
  }

  if (!tournamentState) {
    return (
      <section className="card">
        <p className="subtle">Loading tournament…</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <TournamentPanel
          hasEntered={tournamentState.hasEntered}
          secondsUntilDraw={tournamentSecondsUntilDraw}
          enteringTournament={enteringTournament}
          onEnterTournament={onEnterTournament}
        />
      </section>
      <section className="card tournament-stack">
        <p className="shop-currency-title">Current Tournament Details</p>
        <p className="subtle">Total Players: {tournamentState.playerCount}</p>
        <p className="subtle">
          Expected reward:{" "}
          {tournamentState.expectedRewardGems === null
            ? "Enter the tournament to estimate your reward"
            : `${tournamentState.expectedRewardGems} Time Gem${tournamentState.expectedRewardGems === 1 ? "" : "s"}`}
        </p>
        {tournamentState.nearbyEntries.length > 0 ? (
          <div className="leaderboard-list">
            {tournamentState.nearbyEntries.map((entry) => (
              <RankedPlayerRow
                key={entry.userId}
                rank={entry.rank}
                userId={entry.userId}
                username={entry.username}
                totalIdleSeconds={entry.timeScoreSeconds}
                isCurrentPlayer={entry.isCurrentPlayer}
              />
            ))}
          </div>
        ) : (
          <p className="subtle">Enter the tournament to see nearby ranked players.</p>
        )}
      </section>
    </>
  );
}
