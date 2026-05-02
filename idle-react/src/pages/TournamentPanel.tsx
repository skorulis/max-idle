import { ChevronRight, Trophy } from "lucide-react";
import { formatSeconds } from "../formatSeconds";

type TournamentPanelProps = {
  hasEntered: boolean;
  secondsUntilDraw: number;
  enteringTournament: boolean;
  onEnterTournament: () => Promise<void>;
  onNavigateTournament?: () => void;
};

export function TournamentPanel({
  hasEntered,
  secondsUntilDraw,
  enteringTournament,
  onEnterTournament,
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
      {hasEntered ? (
        <p className="subtle">You are entered for this week.</p>
      ) : (
        <button className="collect" onClick={() => void onEnterTournament()} disabled={enteringTournament}>
          {enteringTournament ? "Entering tournament..." : "Enter tournament"}
        </button>
      )}
      <p className="subtle">Draw in {formatSeconds(secondsUntilDraw)} (Sunday 00:00:00 UTC)</p>
    </div>
  );
}
