import { useState } from "react";
import { formatSeconds } from "../formatSeconds";
import { Atom, CircleHelp, Clock3, Gem, Gift, History } from "lucide-react";
import type { SyncedPlayerState } from "../app/types";
import { getRestraintMinRealtimeSeconds, isDailyBonusFeatureUnlocked } from "../shop";
import { FlipDurationDisplay } from "../components/FlipDurationDisplay";
import { CurrentRateInfoOverlay } from "./CurrentRateInfoOverlay";
import { TournamentPanel } from "./TournamentPanel";
import { toast } from "../gameToast";
import { getDailyBonusDescription, isDailyRewardDoubledToday } from "../app/dailyBonus";

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
  dailyBonusSecondsUntilUtcReset: number;
  tournamentHasEntered: boolean;
  tournamentSecondsUntilDraw: number;
  enteringTournament: boolean;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<{ collectedSeconds: number; realSecondsCollected: number } | undefined>;
  onCollectDailyReward: () => Promise<void>;
  onCollectDailyBonus: () => Promise<void>;
  onEnterTournament: () => Promise<void>;
  onNavigateTournament: () => void;
  onNavigateDailyBonusHistory: () => void;
  onNavigateCollectionHistory: () => void;
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
  dailyBonusSecondsUntilUtcReset,
  tournamentHasEntered,
  tournamentSecondsUntilDraw,
  enteringTournament,
  onStartIdling,
  onCollect,
  onCollectDailyReward,
  onCollectDailyBonus,
  onEnterTournament,
  onNavigateTournament,
  onNavigateDailyBonusHistory,
  onNavigateCollectionHistory,
  onNavigateLogin
}: HomePageProps) {
  const [collectWarningIndex, setCollectWarningIndex] = useState(0);
  const [showRateInfo, setShowRateInfo] = useState(false);
  const [collectFlashNonce, setCollectFlashNonce] = useState(0);

  const handleCollect = async () => {
    if (realtimeElapsedSeconds < 15) {
      toast.warning(EARLY_COLLECT_WARNING_MESSAGES[collectWarningIndex]);
      setCollectWarningIndex((prev) => (prev + 1) % EARLY_COLLECT_WARNING_MESSAGES.length);
      return;
    }

    const result = await onCollect();
    if (!result) return;

    setCollectFlashNonce((n) => n + 1);
  };

  if (!playerState) {
    return (
      <section className="card">
        <img
          className="home-hero-image"
          src="/og-image.png"
          width={1424}
          height={752}
          alt="A game about doing nothing"
        />
        <button className="collect" onClick={() => void onStartIdling()} disabled={starting}>
          {starting ? "Starting..." : "Start idling"}
        </button>
        <button type="button" className="secondary" onClick={onNavigateLogin}>
          Login
        </button>
      </section>
    );
  }

  const dailyBonus = playerState.dailyBonus;
  const dailyBonusDescription = getDailyBonusDescription(dailyBonus);

  const restraintRequiredRealtimeSeconds = getRestraintMinRealtimeSeconds(playerState.shop);
  const restraintWaitRemainingSeconds =
    collectBlockedByRestraint && restraintRequiredRealtimeSeconds > 0
      ? Math.max(0, restraintRequiredRealtimeSeconds - realtimeElapsedSeconds)
      : 0;

  const collectReady = !collecting && !collectBlockedByRestraint;

  return (
    <>
      <section className="card">
          <p className="label">Current idle time</p>
          <FlipDurationDisplay
            totalSeconds={uncollectedIdleSeconds}
            collectFlashNonce={collectFlashNonce}
          />
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

          <div className="collect-row collect-row--primary">
            <button
              type="button"
              className={
                "collect collect-primary" +
                (collecting ? " collect-primary--collecting" : "") +
                (collectReady ? " collect-primary--ready" : "")
              }
              onClick={() => void handleCollect()}
              disabled={collecting || collectBlockedByRestraint}
            >
              <span className="collect-primary-label">
                {collecting
                  ? "Collecting..."
                  : collectBlockedByRestraint
                    ? `Collect (wait ${formatSeconds(restraintWaitRemainingSeconds)})`
                    : "Collect idle time"}
              </span>
            </button>
            <button
              type="button"
              className="info-icon-button"
              onClick={onNavigateCollectionHistory}
              aria-label="View collection history"
              title="View collection history"
            >
              <History size={16} aria-hidden="true" />
            </button>
          </div>
      </section>

      <section className="card">
        <h2>All time gains</h2>
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
        <p className="subtle" style={{ marginTop: "1rem" }}>
          Available to spend
        </p>
        <div className="shop-currencies">
          <div className="shop-currency-card">
            <p className="shop-currency-title">
              <Atom size={16} aria-hidden="true" />
              Idle Time
            </p>
            <p className="shop-currency-value">{formatSeconds(playerState.idleTime.available, 2, "floor")}</p>
          </div>
          <div className="shop-currency-card">
            <p className="shop-currency-title">
              <Clock3 size={16} aria-hidden="true" />
              Real Time
            </p>
            <p className="shop-currency-value">{formatSeconds(playerState.realTime.available, 2, "floor")}</p>
          </div>
          <div className="shop-currency-card">
            <p className="shop-currency-title">
              <Gem size={16} aria-hidden="true" />
              Time Gems
            </p>
            <p className="shop-currency-value">{playerState.timeGems.available}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="shop-currency-title">
          <Gift size={16} aria-hidden="true" />
          Daily Gem Reward
        </p>
        {dailyRewardAvailable ? (
          <>
            <p className="shop-currency-value">
              Ready to collect ({isDailyRewardDoubledToday(dailyBonus) ? "+2 Time Gems" : "+1 Time Gem"})
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
      </section>
      {isDailyBonusFeatureUnlocked(playerState.shop) ? (
        <section className="card">
          <div className="daily-bonus-header">
            <p className="shop-currency-title">
              <Gift size={16} aria-hidden="true" />
              Daily Bonus
            </p>
            <button
              type="button"
              className="info-icon-button"
              onClick={onNavigateDailyBonusHistory}
              aria-label="View daily bonus history"
              title="View history"
            >
              <History size={14} aria-hidden="true" />
            </button>
          </div>
          <p className="shop-currency-value">{dailyBonusDescription}</p>
          {dailyBonus ? (
            <>
              <p className="subtle">
                {dailyBonus.isClaimed
                  ? `Resets in ${formatSeconds(dailyBonusSecondsUntilUtcReset)}`
                  : `Activation costs ${formatSeconds(dailyBonus.activationCostIdleSeconds)} idle time.`}
              </p>
              <button
                className="collect"
                onClick={() => void onCollectDailyBonus()}
                disabled={
                  collectingDailyBonus ||
                  dailyBonus.isClaimed ||
                  playerState.idleTime.available < dailyBonus.activationCostIdleSeconds
                }
              >
                {dailyBonus.isClaimed
                  ? "Daily bonus activated"
                  : collectingDailyBonus
                    ? "Activating daily bonus..."
                    : "Activate daily bonus"}
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      <section className="card">
        <TournamentPanel
          hasEntered={tournamentHasEntered}
          secondsUntilDraw={tournamentSecondsUntilDraw}
          enteringTournament={enteringTournament}
          onEnterTournament={onEnterTournament}
          onNavigateTournament={onNavigateTournament}
        />
      </section>
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
