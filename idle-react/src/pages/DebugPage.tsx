type DebugPageProps = {
  resettingDailyBonus: boolean;
  onResetDailyBonus: () => Promise<void>;
};

export function DebugPage({ resettingDailyBonus, onResetDailyBonus }: DebugPageProps) {
  return (
    <>
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
    </>
  );
}
