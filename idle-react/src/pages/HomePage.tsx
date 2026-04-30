import { useState } from "react";
import { formatSeconds } from "../formatSeconds";
import { Atom, CircleHelp, Clock3, Gem, Gift } from "lucide-react";
import type { SyncedPlayerState } from "../app/types";
import { getRestraintMinRealtimeSeconds } from "../shop";
import { FlipDurationDisplay } from "../components/FlipDurationDisplay";
import { CurrentRateInfoOverlay } from "./CurrentRateInfoOverlay";
import { TournamentPanel } from "./TournamentPanel";

const EARLY_COLLECT_WARNING_MESSAGES = [
  "Don't you think you should wait?",
  "This game isn't about clicking",
  "Stop being impatient",
  "Just relax a little"
];

type HomePageProps = {
  playerState: SyncedPlayerState | null;
  starting: boolean;
  collecting: boolean;
  collectBlockedByRestraint: boolean;
  collectingDailyReward: boolean;
  collectingDailyBonus: boolean;
  uncollectedIdleSeconds: number;
  realtimeElapsedSeconds: number;
  effectiveIdleSecondsRate: number;
  dailyRewardAvailable: boolean;
  dailyRewardSecondsUntilAvailable: number;
  tournamentHasEntered: boolean;
  tournamentSecondsUntilDraw: number;
  enteringTournament: boolean;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<void>;
  onCollectDailyReward: () => Promise<void>;
  onCollectDailyBonus: () => Promise<void>;
  onEnterTournament: () => Promise<void>;
  onNavigateTournament: () => void;
  onNavigateLogin: () => void;
};

export function HomePage({
  playerState,
  starting,
  collecting,
  collectBlockedByRestraint,
  collectingDailyReward,
  collectingDailyBonus,
  uncollectedIdleSeconds,
  realtimeElapsedSeconds,
  effectiveIdleSecondsRate,
  dailyRewardAvailable,
  dailyRewardSecondsUntilAvailable,
  tournamentHasEntered,
  tournamentSecondsUntilDraw,
  enteringTournament,
  onStartIdling,
  onCollect,
  onCollectDailyReward,
  onCollectDailyBonus,
  onEnterTournament,
  onNavigateTournament,
  onNavigateLogin
}: HomePageProps) {
  const [collectWarning, setCollectWarning] = useState<string | null>(null);
  const [collectWarningIndex, setCollectWarningIndex] = useState(0);
  const [showRateInfo, setShowRateInfo] = useState(false);

  const visibleCollectWarning = realtimeElapsedSeconds >= 15 ? null : collectWarning;

  const handleCollect = async () => {
    if (realtimeElapsedSeconds < 15) {
      setCollectWarning(EARLY_COLLECT_WARNING_MESSAGES[collectWarningIndex]);
      setCollectWarningIndex((prev) => (prev + 1) % EARLY_COLLECT_WARNING_MESSAGES.length);
      return;
    }

    setCollectWarning(null);
    await onCollect();
  };

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

  const dailyBonus = playerState.dailyBonus;
  const dailyBonusDescription = (() => {
    if (!dailyBonus) {
      return "Loading daily bonus...";
    }
    switch (dailyBonus.type) {
      case "collect_idle_percent":
        return `+${dailyBonus.value}% idle time on collect`;
      case "collect_real_percent":
        return `+${dailyBonus.value}% real time on collect`;
      case "double_gems_daily_reward":
        return "Double gems from daily reward collection";
      case "free_real_time_hours":
        return `Collect ${dailyBonus.value}h free real time`;
      case "free_idle_time_hours":
        return `Collect ${dailyBonus.value}h free idle time`;
    }
  })();

  const restraintRequiredRealtimeSeconds = getRestraintMinRealtimeSeconds(playerState.shop);
  const restraintWaitRemainingSeconds =
    collectBlockedByRestraint && restraintRequiredRealtimeSeconds > 0
      ? Math.max(0, restraintRequiredRealtimeSeconds - realtimeElapsedSeconds)
      : 0;

  return (
    <>
      <p className="label">Current idle time</p>
      <FlipDurationDisplay totalSeconds={uncollectedIdleSeconds} />
      <div className="idle-rate-meta">
        <div className="idle-rate-lines">
          <p className="subtle">Realtime: {formatSeconds(realtimeElapsedSeconds)}</p>
          <p className="subtle">Multiplier: {effectiveIdleSecondsRate.toFixed(2)}x</p>
        </div>
        <button
          type="button"
          className="info-icon-button"
          aria-label="Show current rate factors"
          onClick={() => setShowRateInfo(true)}
        >
          <CircleHelp size={15} aria-hidden="true" />
        </button>
      </div>

      <button className="collect" onClick={() => void handleCollect()} disabled={collecting || collectBlockedByRestraint}>
        {collecting
          ? "Collecting..."
          : collectBlockedByRestraint
            ? `Collect (wait ${formatSeconds(restraintWaitRemainingSeconds)})`
            : "Collect"}
      </button>
      {visibleCollectWarning ? <p className="warning-alert">{visibleCollectWarning}</p> : null}

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
          Daily Gem Reward
        </p>
        {dailyRewardAvailable ? (
          <>
            <p className="shop-currency-value">
              Ready to collect ({dailyBonus?.type === "double_gems_daily_reward" ? "+2 Time Gems" : "+1 Time Gem"})
            </p>
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
      <div className="panel">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Bonus
        </p>
        <p className="shop-currency-value">{dailyBonusDescription}</p>
        {dailyBonus?.isCollectable ? (
          <button
            className="collect"
            onClick={() => void onCollectDailyBonus()}
            disabled={collectingDailyBonus || dailyBonus.isClaimed}
          >
            {dailyBonus.isClaimed
              ? "Daily bonus claimed"
              : collectingDailyBonus
                ? "Collecting daily bonus..."
                : "Collect daily bonus"}
          </button>
        ) : (
          <p className="subtle">Applies automatically today.</p>
        )}
      </div>
      <TournamentPanel
        hasEntered={tournamentHasEntered}
        secondsUntilDraw={tournamentSecondsUntilDraw}
        enteringTournament={enteringTournament}
        onEnterTournament={onEnterTournament}
        onNavigateTournament={onNavigateTournament}
        showTopSpacing
      />
      <CurrentRateInfoOverlay
        open={showRateInfo}
        onClose={() => setShowRateInfo(false)}
        secondsSinceLastCollection={realtimeElapsedSeconds}
        effectiveIdleSecondsRate={effectiveIdleSecondsRate}
        shop={playerState.shop}
        achievementCount={playerState.achievementCount}
        realTimeAvailable={playerState.realTime.available}
      />
    </>
  );
}
