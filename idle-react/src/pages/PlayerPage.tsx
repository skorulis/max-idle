import { useEffect, useMemo, useState } from "react";
import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem } from "lucide-react";
import type { PlayerProfileResponse } from "../app/types";

type PlayerPageProps = {
  publicPlayerLoading: boolean;
  publicPlayerProfile: PlayerProfileResponse["player"] | null;
  hasError: boolean;
};

export function PlayerPage({ publicPlayerLoading, publicPlayerProfile, hasError }: PlayerPageProps) {
  const [timeAwayBaseline, setTimeAwayBaseline] = useState<{ seconds: number; atMs: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!publicPlayerProfile) {
      setTimeAwayBaseline(null);
      return;
    }
    setTimeAwayBaseline({ seconds: publicPlayerProfile.timeAwaySeconds, atMs: Date.now() });
  }, [publicPlayerProfile?.id, publicPlayerProfile?.timeAwaySeconds]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const displayedTimeAwaySeconds = useMemo(() => {
    if (timeAwayBaseline === null) {
      return 0;
    }
    return timeAwayBaseline.seconds + Math.floor((Date.now() - timeAwayBaseline.atMs) / 1000);
  }, [timeAwayBaseline, tick]);

  return (
    <section className="card">
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
            <span>Time away:</span> {formatSeconds(displayedTimeAwaySeconds, 2, "floor")}
          </p>
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
    </section>
  );
}
