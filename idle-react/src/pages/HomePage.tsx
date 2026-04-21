import { formatSeconds } from "../formatSeconds";
import type { SyncedPlayerState } from "../app/types";

type HomePageProps = {
  playerState: SyncedPlayerState | null;
  starting: boolean;
  collecting: boolean;
  shopPendingQuantity: 1 | 5 | 10 | null;
  uncollectedIdleSeconds: number;
  realtimeElapsedSeconds: number;
  effectiveIdleSecondsRate: number;
  shopCosts: Record<1 | 5 | 10, number>;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<void>;
  onPurchaseUpgrade: (quantity: 1 | 5 | 10) => Promise<void>;
  onNavigateLogin: () => void;
};

export function HomePage({
  playerState,
  starting,
  collecting,
  shopPendingQuantity,
  uncollectedIdleSeconds,
  realtimeElapsedSeconds,
  effectiveIdleSecondsRate,
  shopCosts,
  onStartIdling,
  onCollect,
  onPurchaseUpgrade,
  onNavigateLogin
}: HomePageProps) {
  if (!playerState) {
    return (
      <>
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

      <div className="stats">
        <p>
          <span>Total collected:</span> {formatSeconds(playerState.totalIdleSeconds)}
        </p>
      </div>

      <button className="collect" onClick={() => void onCollect()} disabled={collecting}>
        {collecting ? "Collecting..." : "Collect"}
      </button>
      <h2>Shop</h2>
      <p>
        <span>Spendable:</span> {formatSeconds(playerState.collectedIdleSeconds)}
      </p>
      <p className="subtle">Upgrade: seconds multiplier (+0.1x per purchase)</p>
      <p className="subtle">Current multiplier: {playerState.secondsMultiplier.toFixed(1)}x</p>
      <div className="shop-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void onPurchaseUpgrade(1)}
          disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[1]}
        >
          {shopPendingQuantity === 1 ? "Purchasing..." : `Buy x1 (${formatSeconds(shopCosts[1])})`}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void onPurchaseUpgrade(5)}
          disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[5]}
        >
          {shopPendingQuantity === 5 ? "Purchasing..." : `Buy x5 (${formatSeconds(shopCosts[5])})`}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void onPurchaseUpgrade(10)}
          disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[10]}
        >
          {shopPendingQuantity === 10 ? "Purchasing..." : `Buy x10 (${formatSeconds(shopCosts[10])})`}
        </button>
      </div>
    </>
  );
}
