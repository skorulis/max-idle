import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem } from "lucide-react";
import type { PlayerProfileResponse } from "../app/types";

type PlayerPageProps = {
  publicPlayerLoading: boolean;
  publicPlayerProfile: PlayerProfileResponse["player"] | null;
  hasError: boolean;
};

export function PlayerPage({ publicPlayerLoading, publicPlayerProfile, hasError }: PlayerPageProps) {
  return (
    <>
      <h2>{publicPlayerProfile?.username ?? "Player"}</h2>
      {publicPlayerLoading ? <p>Loading player profile...</p> : null}
      {!publicPlayerLoading && publicPlayerProfile ? (
        <>
          <p className="subtle">Totals</p>
          <div className="shop-currencies">
            <div className="shop-currency-card">
              <p className="shop-currency-title">
                <Atom size={16} aria-hidden="true" />
                Idle Time
              </p>
              <p className="shop-currency-value">{formatSeconds(publicPlayerProfile.idleTime.total, 2, "floor")}</p>
            </div>
            <div className="shop-currency-card">
              <p className="shop-currency-title">
                <Clock3 size={16} aria-hidden="true" />
                Real Time
              </p>
              <p className="shop-currency-value">{formatSeconds(publicPlayerProfile.realTime.total, 2, "floor")}</p>
            </div>
            <div className="shop-currency-card">
              <p className="shop-currency-title">
                <Gem size={16} aria-hidden="true" />
                Time Gems
              </p>
              <p className="shop-currency-value">{publicPlayerProfile.timeGems.total}</p>
            </div>
          </div>
          <p>
            <span>Account age:</span> {formatSeconds(publicPlayerProfile.accountAgeSeconds)}
          </p>
          <p>
            <span>Current idle time:</span> {formatSeconds(publicPlayerProfile.currentIdleSeconds)}
          </p>
          <p>
            <span>Total idle time collected:</span> {formatSeconds(publicPlayerProfile.idleTime.total)}
          </p>
          <p>
            <span>Shop purchases:</span> {publicPlayerProfile.upgradesPurchased}
          </p>
          <p>
            <span>Achievements earned:</span> {publicPlayerProfile.achievementCount}
          </p>
        </>
      ) : null}
      {!publicPlayerLoading && !publicPlayerProfile && !hasError ? <p>Player not found.</p> : null}
    </>
  );
}
