import { Trophy } from "lucide-react";
import { formatSeconds } from "../formatSeconds";

type TournamentPanelProps = {
  hasEntered: boolean;
  secondsUntilDraw: number;
  enteringTournament: boolean;
  onEnterTournament: () => Promise<void>;
  onNavigateTournament?: () => void;
  showTopSpacing?: boolean;
};

export function TournamentPanel({
  hasEntered,
  secondsUntilDraw,
  enteringTournament,
  onEnterTournament,
  onNavigateTournament,
  showTopSpacing = false
}: TournamentPanelProps) {
  return (
    <div className={`panel${showTopSpacing ? " tournament-panel" : ""}`}>
      <p className="shop-currency-title">
        <Trophy size={16} aria-hidden="true" />
        Weekly Tournament
      </p>
      <p className="shop-currency-value">Compete for time gem rewards</p>
      {hasEntered ? (
        <p className="subtle">You are entered for this week.</p>
      ) : (
        <button className="collect" onClick={() => void onEnterTournament()} disabled={enteringTournament}>
          {enteringTournament ? "Entering tournament..." : "Enter tournament"}
        </button>
      )}
      <p className="subtle">Draw in {formatSeconds(secondsUntilDraw)} (Sunday 00:00:00 UTC)</p>
      {onNavigateTournament ? (
        <button type="button" className="secondary" onClick={onNavigateTournament}>
          View tournament details
        </button>
      ) : null}
    </div>
  );
}
