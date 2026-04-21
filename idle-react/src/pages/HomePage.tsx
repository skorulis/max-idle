import { formatSeconds } from "../formatSeconds";
import type { SyncedPlayerState } from "../app/types";

type HomePageProps = {
  playerState: SyncedPlayerState | null;
  starting: boolean;
  collecting: boolean;
  uncollectedIdleSeconds: number;
  realtimeElapsedSeconds: number;
  effectiveIdleSecondsRate: number;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<void>;
  onNavigateLogin: () => void;
};

export function HomePage({
  playerState,
  starting,
  collecting,
  uncollectedIdleSeconds,
  realtimeElapsedSeconds,
  effectiveIdleSecondsRate,
  onStartIdling,
  onCollect,
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
    </>
  );
}
