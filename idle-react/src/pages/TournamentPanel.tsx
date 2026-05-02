import { ChevronRight, Trophy } from "lucide-react";
import type { SyncedOutstandingTournamentResult } from "../app/types";
import { formatSeconds } from "../formatSeconds";

type TournamentPanelProps = {
  hasEntered: boolean;
  outstandingResult: SyncedOutstandingTournamentResult | null;
  secondsUntilDraw: number;
  enteringTournament: boolean;
  collectingTournamentReward: boolean;
  onEnterTournament: () => Promise<void>;
  onCollectTournamentReward: () => Promise<void>;
  onNavigateTournament?: () => void;
};

export function TournamentPanel({
  hasEntered,
  outstandingResult,
  secondsUntilDraw,
  enteringTournament,
  collectingTournamentReward,
  onEnterTournament,
  onCollectTournamentReward,
  onNavigateTournament
}: TournamentPanelProps) {
  return (
    <div className="tournament-stack">
      <div className="card-section-header">
        <h2 className="section-title-with-icon">
          <Trophy size={18} aria-hidden="true" />
          Weekly Tournament
        </h2>
        {onNavigateTournament ? (
          <button
            type="button"
            className="info-icon-button"
            onClick={onNavigateTournament}
            aria-label="View tournament details"
            title="View tournament details"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="shop-currency-value">Compete for time gem rewards</p>
      {outstandingResult ? (
        <>
          <p className="subtle">
            You placed{" "}
            <strong>
              {outstandingResult.finalRank} of {outstandingResult.playerCount} 
            </strong>
            {" "}in the last tournament.
          </p>
          <p className="shop-currency-value">
            Reward: {outstandingResult.gemsAwarded} Time Gem{outstandingResult.gemsAwarded === 1 ? "" : "s"}
          </p>
          <button
            className="collect"
            type="button"
            onClick={() => void onCollectTournamentReward()}
            disabled={collectingTournamentReward}
          >
            {collectingTournamentReward ? "Collecting…" : "Collect winnings"}
          </button>
        </>
      ) : hasEntered ? (
        <p className="subtle">You are entered for this week.</p>
      ) : (
        <button className="collect" onClick={() => void onEnterTournament()} disabled={enteringTournament}>
          {enteringTournament ? "Entering tournament..." : "Enter tournament"}
        </button>
      )}
      <p className="subtle">Next draw in {formatSeconds(secondsUntilDraw)} (Sunday 00:00:00 UTC)</p>
    </div>
  );
}
