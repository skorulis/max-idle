import { formatSeconds } from "../formatSeconds";
import { Atom, Clock3, Gem, Gift } from "lucide-react";
import type { SyncedPlayerState } from "../app/types";

type HomePageProps = {
  playerState: SyncedPlayerState | null;
  starting: boolean;
  collecting: boolean;
  collectingDailyReward: boolean;
  uncollectedIdleSeconds: number;
  realtimeElapsedSeconds: number;
  effectiveIdleSecondsRate: number;
  dailyRewardAvailable: boolean;
  dailyRewardSecondsUntilAvailable: number;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<void>;
  onCollectDailyReward: () => Promise<void>;
  onNavigateLogin: () => void;
};

export function HomePage({
  playerState,
  starting,
  collecting,
  collectingDailyReward,
  uncollectedIdleSeconds,
  realtimeElapsedSeconds,
  effectiveIdleSecondsRate,
  dailyRewardAvailable,
  dailyRewardSecondsUntilAvailable,
  onStartIdling,
  onCollect,
  onCollectDailyReward,
  onNavigateLogin
}: HomePageProps) {
  if (!playerState) {
    return (
      <>
        <h1>Max Idle</h1>
        <p className="subtle">A game about doing nothing</p>
        <button className="collect" onClick={() => void onStartIdling()} disabled={starting}>
          {starting ? "Starting..." : "Start idling"}
        </button>
        <button type="button" className="secondary" onClick={onNavigateLogin}>
          Login
        </button>
      </>
    );
  }

  return (
    <>
      <p className="label">Current idle time</p>
      <p className="counter">{formatSeconds(uncollectedIdleSeconds)}</p>
      <p className="subtle">Realtime: {formatSeconds(realtimeElapsedSeconds)}</p>
      <p className="subtle">Current rate: {effectiveIdleSecondsRate.toFixed(2)}x</p>

      <button className="collect" onClick={() => void onCollect()} disabled={collecting}>
        {collecting ? "Collecting..." : "Collect"}
      </button>

      <p className="subtle">Totals</p>
      <div className="shop-currencies">
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Atom size={16} aria-hidden="true" />
            Idle Time
          </p>
          <p className="shop-currency-value">{formatSeconds(playerState.idleTime.total, 2, "floor")}</p>
        </div>
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Clock3 size={16} aria-hidden="true" />
            Real Time
          </p>
          <p className="shop-currency-value">{formatSeconds(playerState.realTime.total, 2, "floor")}</p>
        </div>
        <div className="shop-currency-card">
          <p className="shop-currency-title">
            <Gem size={16} aria-hidden="true" />
            Time Gems
          </p>
          <p className="shop-currency-value">{playerState.timeGems.total}</p>
        </div>
      </div>

      

      <div className="panel">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Reward
        </p>
        {dailyRewardAvailable ? (
          <>
            <p className="shop-currency-value">Ready to collect (+1 Time Gem)</p>
            <button className="collect" onClick={() => void onCollectDailyReward()} disabled={collectingDailyReward}>
              {collectingDailyReward ? "Collecting daily reward..." : "Collect daily reward"}
            </button>
          </>
        ) : (
          <>
            <p className="shop-currency-value">+1 Time Gem</p>
            <p className="subtle">Resets in {formatSeconds(dailyRewardSecondsUntilAvailable)}</p>
          </>
        )}
      </div>
    </>
  );
}
