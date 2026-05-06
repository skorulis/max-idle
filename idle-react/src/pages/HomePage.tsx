import { useMemo, useState } from "react";
import { formatSeconds } from "../formatSeconds";
import { formatRewardAmount } from "../formatReward";
import {
  Atom,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Gem,
  Gift,
  ListTodo,
  PiggyBank
} from "lucide-react";
import GameIcon from "../GameIcon";
import { getLucidIcon } from "../getLucidIcon";
import type { AvailableSurveySummary, SyncedOutstandingTournamentResult, SyncedPlayerState } from "../app/types";
import { parseCompletedTutorialIds, TUTORIAL_STEPS } from "@maxidle/shared/tutorialSteps";
import {
  getMaxIdleCollectionRealtimeSeconds,
  getRestraintMinRealtimeSeconds
} from "../shop";
import { FlipDurationDisplay } from "../components/FlipDurationDisplay";
import { CurrentRateInfoOverlay } from "./CurrentRateInfoOverlay";
import { TournamentPanel } from "./TournamentPanel";
import { toast } from "../gameToast";
import { getDailyBonusDescription, isDailyRewardDoubledToday } from "../app/dailyBonus";
import type { SurveyCurrencyType } from "../app/types";
import {
  getCurrentObligationId,
  getObligationDefinition,
  isObligationConditionMet,
  isTournamentFeatureUnlocked,
  OBLIGATION_IDS,
  type ObligationId
} from "@maxidle/shared/obligations";

const EARLY_COLLECT_WARNING_MESSAGES = [
  "Don't you think you should wait?",
  "This game isn't about clicking",
  "Stop being impatient",
  "Just relax a little"
];
const SURVEY_IDLE_TIME_REQUIRED_SECONDS = 6 * 60 * 60;

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
  estimatedServerNowMs: number;
  dailyRewardAvailable: boolean;
  dailyRewardSecondsUntilAvailable: number;
  dailyBonusSecondsUntilUtcReset: number;
  tournamentHasEntered: boolean;
  tournamentSecondsUntilDraw: number;
  enteringTournament: boolean;
  tournamentOutstandingResult: SyncedOutstandingTournamentResult | null;
  collectingTournamentReward: boolean;
  onCollectTournamentReward: () => Promise<void>;
  onStartIdling: () => Promise<void>;
  onCollect: () => Promise<{ collectedSeconds: number; realSecondsCollected: number } | undefined>;
  onCollectDailyReward: () => Promise<void>;
  onCollectDailyBonus: () => Promise<void>;
  onEnterTournament: () => Promise<void>;
  onNavigateTournament: () => void;
  onNavigateDailyBonusHistory: () => void;
  onNavigateCollectionHistory: () => void;
  onNavigateLogin: () => void;
  availableSurvey: AvailableSurveySummary | null;
  onNavigateSurvey: () => void;
  onCompleteTutorialStep: (tutorialId: string) => Promise<void>;
  collectingObligation: boolean;
  onCollectObligation: (obligationId: ObligationId) => Promise<void>;
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
  estimatedServerNowMs,
  dailyRewardAvailable,
  dailyRewardSecondsUntilAvailable,
  dailyBonusSecondsUntilUtcReset,
  tournamentHasEntered,
  tournamentSecondsUntilDraw,
  enteringTournament,
  tournamentOutstandingResult,
  collectingTournamentReward,
  onCollectTournamentReward,
  onStartIdling,
  onCollect,
  onCollectDailyReward,
  onCollectDailyBonus,
  onEnterTournament,
  onNavigateTournament,
  onNavigateDailyBonusHistory,
  onNavigateCollectionHistory,
  onNavigateLogin,
  availableSurvey,
  onNavigateSurvey,
  onCompleteTutorialStep,
  collectingObligation,
  onCollectObligation
}: HomePageProps) {
  const [collectWarningIndex, setCollectWarningIndex] = useState(0);
  const [showRateInfo, setShowRateInfo] = useState(false);
  const [collectFlashNonce, setCollectFlashNonce] = useState(0);
  const [tutorialSubmitting, setTutorialSubmitting] = useState(false);

  const completedTutorialIds = useMemo(
    () => parseCompletedTutorialIds(playerState?.tutorialProgress ?? ""),
    [playerState?.tutorialProgress]
  );

  const obligationSnapshot = useMemo(() => {
    if (!playerState) {
      return {
        idleTimeTotal: 0,
        realTimeTotal: 0,
        timeGemsTotal: 0,
        upgradesPurchased: 0,
        collectionCount: 0,
        achievementCount: 0,
        playerLevel: 0
      };
    }
    return {
      idleTimeTotal: playerState.idleTime.total,
      realTimeTotal: playerState.realTime.total,
      timeGemsTotal: playerState.timeGems.total,
      upgradesPurchased: playerState.upgradesPurchased,
      collectionCount: playerState.collectionCount,
      achievementCount: playerState.achievementCount,
      playerLevel: playerState.level
    };
  }, [playerState]);

  const currentObligationId = useMemo(
    () => (playerState ? getCurrentObligationId(playerState.obligationsCompleted) : null),
    [playerState]
  );

  const currentObligation = useMemo(() => {
    if (!currentObligationId) {
      return null;
    }
    return getObligationDefinition(currentObligationId) ?? null;
  }, [currentObligationId]);

  const obligationReady = useMemo(() => {
    if (!playerState || !currentObligation) {
      return false;
    }
    return isObligationConditionMet(currentObligation, obligationSnapshot);
  }, [playerState, currentObligation, obligationSnapshot]);

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

  const maxUncollectedIdleSeconds = getMaxIdleCollectionRealtimeSeconds(playerState.shop);
  const maxIdleCollectionReached = uncollectedIdleSeconds >= maxUncollectedIdleSeconds;

  const collectReady = !collecting && !collectBlockedByRestraint;

  const showSpendableTimeSection =
    playerState.idleTime.total > 0 ||
    playerState.realTime.total > 0 ||
    playerState.timeGems.total > 0;
  const showSurveyCard = availableSurvey && playerState.idleTime.total >= SURVEY_IDLE_TIME_REQUIRED_SECONDS;

  const remainingTutorials = TUTORIAL_STEPS.filter((s) => !completedTutorialIds.has(s.id));
  const currentTutorial = remainingTutorials[0];
  const isLastTutorialStep = remainingTutorials.length <= 1;

  return (
    <>
      {currentTutorial ? (
        <section className="card">
          <div className="card-section-header">
            <h2 className="section-title-with-icon">
              <GameIcon icon={getLucidIcon(currentTutorial.icon)} size={18} />
              {currentTutorial.title}
            </h2>
          </div>
          
          <p style={{ marginTop: 0 }}>{currentTutorial.body}</p>
          <div className="collect-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="collect collect-primary"
              disabled={tutorialSubmitting}
              onClick={() => {
                void (async () => {
                  setTutorialSubmitting(true);
                  try {
                    await onCompleteTutorialStep(currentTutorial.id);
                  } finally {
                    setTutorialSubmitting(false);
                  }
                })();
              }}
            >
              {tutorialSubmitting ? "Saving..." : isLastTutorialStep ? "Done" : "Next"}
            </button>
          </div>
        </section>
      ) : null}
      
      <section className="card idle-collect-card">
        <div className="card-section-header">
          <h2 className="section-title-with-icon">
            <Atom size={18} aria-hidden="true" />
            Idle time generator
          </h2>
          <button
            type="button"
            className="info-icon-button"
            onClick={onNavigateCollectionHistory}
            aria-label="View collection history"
            title="View collection history"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
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

        {maxIdleCollectionReached ? <p className="warning-alert">Max idle time reached</p> : null}

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
        </div>
      </section>

      {currentObligation ? (
        <section className="card">
          <div className="card-section-header">
            <h2 className="section-title-with-icon">
              <ListTodo size={18} aria-hidden="true" />
              Obligation
            </h2>
          </div>
          <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{currentObligation.name}</h3>
          <p style={{ marginTop: 0 }}>{currentObligation.description}</p>
          <p className="subtle" style={{ marginTop: "1rem", marginBottom: "0.25rem" }}>
            Compensation
          </p>
          <ul style={{ marginTop: 0, paddingLeft: "1.25rem" }}>
            {currentObligation.rewards.map((reward, index) => (
              <li key={index}>
                {reward.type === "text"
                  ? reward.label
                  : formatRewardAmount(reward.type as SurveyCurrencyType, reward.value)}
              </li>
            ))}
          </ul>
          <div className="collect-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="collect collect-primary"
              disabled={!obligationReady || collectingObligation}
              onClick={() => void onCollectObligation(currentObligation.id)}
            >
              {collectingObligation ? "Collecting..." : "Collect compensation"}
            </button>
          </div>
        </section>
      ) : null}

      {showSpendableTimeSection ? (
        <section className="card">
          <h2 className="section-title-with-icon">
            <PiggyBank size={18} aria-hidden="true" />
            Spendable time
          </h2>
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
          <p className="subtle" style={{ marginTop: "1rem" }}>
            Total earned
          </p>
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
        </section>
      ) : null}

      {showSurveyCard ? (
        <section className="card">
          <h2 className="section-title-with-icon">
            <ClipboardList size={18} aria-hidden="true" />
            Survey
          </h2>
          <p>
            Get {formatRewardAmount(availableSurvey.currencyType, availableSurvey.reward)} for answering a quick question.
          </p>
          <button type="button" className="collect" onClick={onNavigateSurvey}>
            Answer survey
          </button>
        </section>
      ) : null}

      {playerState.obligationsCompleted[OBLIGATION_IDS.ACHIEVE_SOMETHING] === true ? (
        <section className="card">
          <h2 className="section-title-with-icon">
            <Gem size={18} aria-hidden="true" />
            Daily Gem Reward
          </h2>
          {dailyRewardAvailable ? (
            <>
              <p>
                Ready to collect ({isDailyRewardDoubledToday(dailyBonus) ? "+2 Time Gems" : "+1 Time Gem"})
              </p>
              <button className="collect" onClick={() => void onCollectDailyReward()} disabled={collectingDailyReward}>
                {collectingDailyReward ? "Collecting daily reward..." : "Collect daily reward"}
              </button>
            </>
          ) : (
            <>
              <p>+1 Time Gem</p>
              <p className="subtle">Resets in {formatSeconds(dailyRewardSecondsUntilAvailable)}</p>
            </>
          )}
        </section>
      ) : null}
      {playerState.obligationsCompleted[OBLIGATION_IDS.RAMP_UP] === true ? (
        <section className="card">
          <div className="card-section-header">
            <h2 className="section-title-with-icon">
              <Gift size={18} aria-hidden="true" />
              Daily Bonus
            </h2>
            <button
              type="button"
              className="info-icon-button"
              onClick={onNavigateDailyBonusHistory}
              aria-label="View daily bonus history"
              title="View daily bonus details"
            >
              <ChevronRight size={16} aria-hidden="true" />
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
      {isTournamentFeatureUnlocked(playerState.obligationsCompleted) ? (
        <section className="card">
          <TournamentPanel
            hasEntered={tournamentHasEntered}
            outstandingResult={tournamentOutstandingResult}
            secondsUntilDraw={tournamentSecondsUntilDraw}
            enteringTournament={enteringTournament}
            collectingTournamentReward={collectingTournamentReward}
            onEnterTournament={onEnterTournament}
            onCollectTournamentReward={onCollectTournamentReward}
            onNavigateTournament={onNavigateTournament}
          />
        </section>
      ) : null}
      <CurrentRateInfoOverlay
        open={showRateInfo}
        onClose={() => setShowRateInfo(false)}
        secondsSinceLastCollection={realtimeElapsedSeconds}
        effectiveIdleSecondsRate={effectiveIdleSecondsRate}
        shop={playerState.shop}
        achievementCount={playerState.achievementCount}
        playerLevel={playerState.level}
        realTimeAvailable={playerState.realTime.available}
        estimatedServerNowMs={estimatedServerNowMs}
      />
    </>
  );
}
