import type { SyncedTournamentState } from "../app/types";
import { TournamentPanel } from "./TournamentPanel";

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
    return <p className="subtle">Sign in or start idling to view tournament details.</p>;
  }

  return (
    <>
      <TournamentPanel
        hasEntered={tournamentState.hasEntered}
        secondsUntilDraw={tournamentSecondsUntilDraw}
        enteringTournament={enteringTournament}
        onEnterTournament={onEnterTournament}
      />
      <div className="panel tournament-details-panel">
        <p className="shop-currency-title">Current Tournament Details</p>
        <p className="subtle">Players entered: {tournamentState.playerCount}</p>
        <p className="subtle">
          Current rank: {tournamentState.currentRank === null ? "Enter the tournament to see your rank" : `#${tournamentState.currentRank}`}
        </p>
        <p className="subtle">
          Expected reward:{" "}
          {tournamentState.expectedRewardGems === null ? "Enter the tournament to estimate your reward" : `${tournamentState.expectedRewardGems} Time Gem${tournamentState.expectedRewardGems === 1 ? "" : "s"}`}
        </p>
      </div>
    </>
  );
}
