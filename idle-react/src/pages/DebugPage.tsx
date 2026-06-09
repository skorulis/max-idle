type DebugPageProps = {
  resettingDailyBonus: boolean;
  onResetDailyBonus: () => Promise<void>;
  debugPendingAction: "real" | "idle" | "gems" | "balances" | "tournament" | null;
  onDebugAddRealTime: () => Promise<void>;
  onDebugAddIdleTime: () => Promise<void>;
  onDebugAddGems: () => Promise<void>;
  onDebugResetBalances: () => Promise<void>;
  onDebugFinalizeTournament: () => Promise<void>;
};

export function DebugPage({
  resettingDailyBonus,
  onResetDailyBonus,
  debugPendingAction,
  onDebugAddRealTime,
  onDebugAddIdleTime,
  onDebugAddGems,
  onDebugResetBalances,
  onDebugFinalizeTournament
}: DebugPageProps) {
  const debugBusy = debugPendingAction !== null;

  return (
    <section className="card">
      <h2>Debug</h2>
      <div className="panel">
        <h3>Daily Bonus</h3>
        <p className="subtle">Reset today's daily bonus roll so you can test the flow again immediately.</p>
        <button
          type="button"
          className="collect"
          onClick={() => void onResetDailyBonus()}
          disabled={resettingDailyBonus}
        >
          {resettingDailyBonus ? "Resetting..." : "Reset current daily bonus"}
        </button>
      </div>
      <div className="panel">
        <h3>Time currencies</h3>
        <p className="subtle">
          Grant banked real time, idle time (12 hours each), or time gems for shop spending and tests. Non-production API only.
        </p>
        <div className="debug-time-buttons">
          <button
            type="button"
            className="collect"
            onClick={() => void onDebugAddRealTime()}
            disabled={debugBusy}
          >
            {debugPendingAction === "real" ? "Adding..." : "Add 12h real time"}
          </button>
          <button
            type="button"
            className="collect"
            onClick={() => void onDebugAddIdleTime()}
            disabled={debugBusy}
          >
            {debugPendingAction === "idle" ? "Adding..." : "Add 12h idle time"}
          </button>
          <button
            type="button"
            className="collect"
            onClick={() => void onDebugAddGems()}
            disabled={debugBusy}
          >
            {debugPendingAction === "gems" ? "Adding gems..." : "Add 5 Time Gems"}
          </button>
        </div>
        <p className="subtle" style={{ marginTop: "0.75rem" }}>
          Reset all banked real time, idle time, and time gems to zero.
        </p>
        <button
          type="button"
          className="collect"
          onClick={() => void onDebugResetBalances()}
          disabled={debugBusy}
        >
          {debugPendingAction === "balances" ? "Resetting..." : "Reset all balances"}
        </button>
      </div>
      <div className="panel">
        <h3>Tournament</h3>
        <p className="subtle">
          Finalize the active weekly tournament immediately (same rewards as the real draw), then start a new round with the same draw time. Non-production API only.
        </p>
        <button
          type="button"
          className="collect"
          onClick={() => void onDebugFinalizeTournament()}
          disabled={debugBusy}
        >
          {debugPendingAction === "tournament" ? "Finalizing..." : "Finalize current tournament"}
        </button>
      </div>
    </section>
  );
}
