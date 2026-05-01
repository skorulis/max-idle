import type { SyncedTournamentState } from "../app/types";
import { TournamentPanel } from "./TournamentPanel";
import { RankedPlayerRow } from "./RankedPlayerRow";

type TournamentPageProps = {
  tournamentState: SyncedTournamentState | null;
  tournamentSecondsUntilDraw: number;
  enteringTournament: boolean;
  onEnterTournament: () => Promise<void>;
};

export function TournamentPage({
  tournamentState,
  tournamentSecondsUntilDraw,
  enteringTournament,
  onEnterTournament
}: TournamentPageProps) {
  if (!tournamentState) {
    return (
      <section className="card">
        <p className="subtle">Sign in or start idling to view tournament details.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <TournamentPanel
        hasEntered={tournamentState.hasEntered}
        secondsUntilDraw={tournamentSecondsUntilDraw}
        enteringTournament={enteringTournament}
        onEnterTournament={onEnterTournament}
      />
      <div className="panel tournament-details-panel">
        <p className="shop-currency-title">Current Tournament Details</p>
        <p className="subtle">Total Players: {tournamentState.playerCount}</p>
        <p className="subtle">
          Expected reward:{" "}
          {tournamentState.expectedRewardGems === null ? "Enter the tournament to estimate your reward" : `${tournamentState.expectedRewardGems} Time Gem${tournamentState.expectedRewardGems === 1 ? "" : "s"}`}
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
      </div>
    </section>
  );
}
