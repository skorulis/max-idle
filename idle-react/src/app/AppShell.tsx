import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AppNav } from "./AppNav";
import { toast } from "../gameToast";
import { calculateBoostedIdleSecondsGain, getEffectiveIdleSecondsRate, isIdleCollectionBlockedByRestraint } from "../idleRate";
import { OBLIGATION_IDS, isTournamentFeatureUnlocked } from "@maxidle/shared/obligations";
import { type ShopUpgradeId } from "../shopUpgrades";
import { AccountPage } from "../pages/AccountPage";
import { AchievementsPage } from "../pages/AchievementsPage";
import { CollectionHistoryPage } from "../pages/CollectionHistoryPage";
import { HomePage } from "../pages/HomePage";
import { HelpPage } from "../pages/HelpPage";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { LoginPage } from "../pages/LoginPage";
import { PlayerPage } from "../pages/PlayerPage";
import { DebugPage } from "../pages/DebugPage";
import { DailyBonusPage } from "../pages/DailyBonusPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ShopPage } from "../pages/ShopPage";
import { TournamentPage } from "../pages/TournamentPage";
import { SurveyPage } from "../pages/SurveyPage";
import {
  completeSocialUpgrade,
  getPlayer,
  grantClientDrivenAchievement
} from "./api";
import { formatRestraintBlockedCollectMessage, hasAffordableIdleOrRealTimeShopPurchase } from "../shop";
import { ACHIEVEMENT_IDS } from "../achievements";
import { alignClientClock, useClientNowMs } from "./clientClock";
import { useAppAuthActions } from "./useAppAuthActions";
import { useAppGameplayActions } from "./useAppGameplayActions";
import { useDailyRewardNotifications } from "./useDailyRewardNotifications";
import { useAppRouteDataLoaders } from "./useAppRouteDataLoaders";
import { useAppSession } from "./useAppSession";
import {
  getSecondsUntilNextUtcDayBoundary,
  getTournamentSecondsUntilDraw,
  toSyncedState
} from "./playerState";
import { useBottomBulletinMessage, type BulletinContent } from "./useBottomBulletinMessage";
import { useReturnAfterAwayMessage } from "./useReturnAfterAwayMessage";
import { formatRewardAmount } from "../formatReward";
import type {
  AuthFormState,
} from "./types";

const TOKEN_KEY = "max-idle-token";
const UPGRADE_SOCIAL_INTENT_KEY = "max-idle-upgrade-social-intent";
const CONTEMPLATION_ACHIEVEMENT_HOME_TIME_MS = 10 * 60 * 1000;

function IdleBulletinBody({ content }: { content: BulletinContent }) {
  if (content.kind === "plain") {
    return (
      <p className="message-copy">
        {content.parts.map((part, index) => {
          if (part.to) {
            return (
              <Link key={`${part.to}-${index}`} to={part.to}>
                {part.text}
              </Link>
            );
          }
          return <span key={`${part.text}-${index}`}>{part.text}</span>;
        })}
      </p>
    );
  }
  return (
    <blockquote className="message-quote">
      <p className="message-quote__text">{content.quote}</p>
      <footer className="message-quote__footer">— {content.author}</footer>
    </blockquote>
  );
}

const SHOP_ALREADY_OWNED_MESSAGE: Partial<Record<ShopUpgradeId, string>> = {
  restraint: "Restraint is already active.",
  patience: "Patience is already maxed.",
  luck: "Luck is already active.",
  idle_hoarder: "Idle hoarder is already maxed.",
  worthwhile_achievements: "Worthwhile Achievements is already maxed.",
  anti_consumerist: "Anti-consumerist is already maxed.",
  consolidation: "Consolidation is already maxed.",
  quick_collector: "Quick Collector is already maxed.",
  collect_gem_time_boost: "Hasty collection is already maxed."
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const playerRouteMatch = useMatch("/player/:playerId");
  const {
    token,
    setToken,
    playerState,
    setPlayerState,
    tournamentState,
    setTournamentState,
    availableSurvey,
    account,
    setAccount,
    usernameDraft,
    setUsernameDraft,
    error,
    setError,
    loading,
    setStatus,
    refreshAccount,
    refreshPlayer,
    refreshTournament,
    refreshHome
  } = useAppSession({ tokenStorageKey: TOKEN_KEY });
  const [loginForm, setLoginForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [signupForm, setSignupForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [upgradeForm, setUpgradeForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [socialUpgradePending, setSocialUpgradePending] = useState(false);
  const isAuthenticated = Boolean(playerState);
  const availableSurveyForUi = playerState ? availableSurvey : null;

  const { displayedContent, isFadingOutMessage, isFadingInMessage } = useBottomBulletinMessage(isAuthenticated);
  const showDebugFeatures = !import.meta.env.PROD;
  const clientNowMs = useClientNowMs();

  useReturnAfterAwayMessage();

  const {
    publicPlayerProfile,
    publicPlayerLoading,
    leaderboard,
    leaderboardLoading,
    leaderboardType,
    setLeaderboardType,
    achievements,
    achievementsLoading,
    dailyBonusHistory,
    dailyBonusHistoryLoading,
    collectionHistory,
    collectionHistoryLoading,
    tournamentHistory,
    tournamentHistoryLoading,
    clearRouteDataOnLogout
  } = useAppRouteDataLoaders({
    locationPathname: location.pathname,
    token,
    accountGameUserId: account?.gameUserId ?? undefined,
    playerState,
    setPlayerState,
    routePlayerIdParam: playerRouteMatch?.params.playerId,
    setError
  });
  const dailyBonusHistoryUnlocked =
    playerState != null && playerState.obligationsCompleted[OBLIGATION_IDS.RAMP_UP] === true;
  const dailyBonusHistoryForPage = dailyBonusHistoryUnlocked ? dailyBonusHistory : [];
  const dailyBonusHistoryLoadingForPage = dailyBonusHistoryUnlocked ? dailyBonusHistoryLoading : false;

  useEffect(() => {
    if (!isAuthenticated || location.pathname !== "/") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void grantClientDrivenAchievement(token, ACHIEVEMENT_IDS.CONTEMPLATION)
        .then(async () => {
          if (cancelled) {
            return;
          }
          const nextPlayer = await getPlayer(token);
          if (cancelled) {
            return;
          }
          alignClientClock();
          setPlayerState((prev) => toSyncedState(nextPlayer, prev));
        })
        .catch(() => {
          // Ignore errors here to avoid interrupting normal home-page flow.
        });
    }, CONTEMPLATION_ACHIEVEMENT_HOME_TIME_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, location.pathname, token, setPlayerState]);

  const tournamentFeatureUnlocked = Boolean(playerState && isTournamentFeatureUnlocked(playerState.obligationsCompleted));

  useEffect(() => {
    if (location.pathname !== "/tournament" || !tournamentFeatureUnlocked) {
      return;
    }
    const refreshTimer = window.setTimeout(() => {
      void refreshTournament(token).catch(() => {
        // Keep existing state if refresh fails.
      });
    }, 0);
    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [location.pathname, token, refreshTournament, tournamentFeatureUnlocked]);

  useEffect(() => {
    if (location.pathname !== "/account") {
      return;
    }

    const params = new URLSearchParams(location.search);
    const upgradeSocial = params.get("upgradeSocial");
    if (!upgradeSocial) {
      return;
    }

    const clearUpgradeQuery = () => {
      navigate("/account", { replace: true });
    };

    if (upgradeSocial === "error") {
      sessionStorage.removeItem(UPGRADE_SOCIAL_INTENT_KEY);
      setTimeout(() => {
        setError("Could not complete Google account upgrade.");
        setStatus("Could not upgrade account.");
        clearUpgradeQuery();
      }, 0);
      return;
    }

    if (upgradeSocial !== "google") {
      clearUpgradeQuery();
      return;
    }

    const pendingIntent = sessionStorage.getItem(UPGRADE_SOCIAL_INTENT_KEY);
    const anonymousToken = localStorage.getItem(TOKEN_KEY);
    if (pendingIntent !== "google" || !anonymousToken) {
      clearUpgradeQuery();
      return;
    }

    let cancelled = false;
    const finalizeSocialUpgrade = async () => {
      setSocialUpgradePending(true);
      setError(null);
      setStatus("Finalizing Google account upgrade...");
      try {
        await completeSocialUpgrade(anonymousToken);
        if (cancelled) {
          return;
        }
        sessionStorage.removeItem(UPGRADE_SOCIAL_INTENT_KEY);
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        await refreshHome(null);
        setStatus("Anonymous account upgraded.");
      } catch (upgradeError) {
        if (cancelled) {
          return;
        }
        sessionStorage.removeItem(UPGRADE_SOCIAL_INTENT_KEY);
        setError(upgradeError instanceof Error ? upgradeError.message : "Upgrade failed");
        setStatus("Could not upgrade account.");
        setToken(anonymousToken);
        try {
          await refreshHome(anonymousToken);
        } catch {
          // Keep existing state if refresh fails.
        }
      } finally {
        if (!cancelled) {
          setSocialUpgradePending(false);
          clearUpgradeQuery();
        }
      }
    };

    void finalizeSocialUpgrade();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, refreshHome, setError, setStatus, setToken]);

  const estimatedServerNowMs = useMemo(() => {
    if (!playerState) {
      return 0;
    }
    return playerState.serverTimeMs + (clientNowMs - playerState.syncedAtClientMs);
  }, [playerState, clientNowMs]);

  const uncollectedIdleSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }

    const elapsedSinceLastCollection = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: Math.max(0, elapsedSinceLastCollection),
      shop: playerState.shop,
      achievementCount: playerState.achievementCount,
      playerLevel: playerState.level,
      realTimeAvailable: playerState.realTime.available,
      wallClockMs: estimatedServerNowMs
    });
  }, [estimatedServerNowMs, playerState]);

  const realtimeElapsedSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }

    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return Math.max(0, elapsed);
  }, [estimatedServerNowMs, playerState]);

  const effectiveIdleSecondsRate = useMemo(() => {
    if (!playerState) {
      return 1;
    }
    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return getEffectiveIdleSecondsRate({
      secondsSinceLastCollection: Math.max(0, elapsed),
      shop: playerState.shop,
      achievementCount: playerState.achievementCount,
      playerLevel: playerState.level,
      realTimeAvailable: playerState.realTime.available,
      wallClockMs: estimatedServerNowMs
    });
  }, [estimatedServerNowMs, playerState]);

  const isCollectBlockedByRestraint = useMemo(() => {
    if (!playerState) {
      return false;
    }
    return isIdleCollectionBlockedByRestraint({
      secondsSinceLastCollection: realtimeElapsedSeconds,
      shop: playerState.shop
    });
  }, [playerState, realtimeElapsedSeconds]);

  const restraintCollectBlockedMessage = useMemo(
    () =>
      playerState
        ? formatRestraintBlockedCollectMessage(playerState.shop)
        : "Restraint blocks collection until the required realtime has passed.",
    [playerState]
  );

  const showShopAffordableBadge = useMemo(() => {
    if (!playerState) {
      return false;
    }
    return hasAffordableIdleOrRealTimeShopPurchase(
      playerState.shop,
      playerState.idleTime.available,
      playerState.realTime.available
    );
  }, [playerState]);

  const dailyRewardAvailable = useMemo(() => {
    if (!playerState) {
      return false;
    }
    const now = new Date(estimatedServerNowMs);
    const currentUtcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const lastCollectedMs = playerState.lastDailyRewardCollectedAtMs;
    if (lastCollectedMs === null) {
      return true;
    }
    return lastCollectedMs < currentUtcDayStartMs;
  }, [estimatedServerNowMs, playerState]);

  const dailyRewardSecondsUntilAvailable = useMemo(() => {
    if (!playerState || dailyRewardAvailable) {
      return 0;
    }
    return getSecondsUntilNextUtcDayBoundary(estimatedServerNowMs);
  }, [dailyRewardAvailable, estimatedServerNowMs, playerState]);

  const dailyBonusSecondsUntilUtcReset = useMemo(() => {
    if (!playerState) {
      return 0;
    }
    return getSecondsUntilNextUtcDayBoundary(estimatedServerNowMs);
  }, [estimatedServerNowMs, playerState]);
  const {
    dailyRewardNotificationsSupported,
    dailyRewardNotificationPermission,
    dailyRewardNotificationsEnabled,
    dailyRewardNotificationPermissionPending,
    onToggleDailyRewardNotifications
  } = useDailyRewardNotifications({
    token,
    setError,
    setStatus
  });

  const tournamentHasEntered = useMemo(() => {
    return Boolean(tournamentState?.hasEntered);
  }, [tournamentState]);

  const tournamentSecondsUntilDraw = useMemo(() => {
    if (!playerState || !tournamentState) {
      return 0;
    }
    return getTournamentSecondsUntilDraw(tournamentState.drawAtMs, estimatedServerNowMs);
  }, [estimatedServerNowMs, playerState, tournamentState]);

  useEffect(() => {
    if (!playerState || !tournamentState || tournamentSecondsUntilDraw > 0) {
      return;
    }
    const refreshTimer = window.setTimeout(() => {
      void refreshTournament(token).catch(() => {
        // Keep current state if refresh fails.
      });
    }, 1_000);
    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [playerState, refreshTournament, token, tournamentSecondsUntilDraw, tournamentState]);

  const {
    starting,
    collecting,
    collectingDailyReward,
    collectingDailyBonus,
    collectingObligation,
    enteringTournament,
    collectingTournamentReward,
    shopPendingQuantity,
    resettingDailyBonus,
    debugPendingAction,
    onCollect,
    onPurchaseUpgrade,
    onUpgradePlayerLevel,
    onDebugAddGems,
    onDebugResetDailyBonus,
    onDebugAddRealTime,
    onDebugAddIdleTime,
    onDebugResetBalances,
    onDebugFinalizeTournament,
    onCollectDailyReward,
    onCollectObligation,
    onCompleteTutorialStep,
    onResetTutorial,
    onCollectDailyBonus,
    onEnterTournament,
    onCollectTournamentReward,
    onStartIdling
  } = useAppGameplayActions({
    token,
    setToken,
    playerState,
    setPlayerState,
    setTournamentState,
    setAccount,
    setStatus,
    setError,
    refreshAccount,
    refreshPlayer,
    refreshTournament,
    refreshHome,
    isCollectBlockedByRestraint,
    restraintCollectBlockedMessage,
    tokenStorageKey: TOKEN_KEY,
    shopAlreadyOwnedMessage: SHOP_ALREADY_OWNED_MESSAGE
  });
  const {
    authPending,
    usernamePending,
    onStartJourneyFromLeaderboard,
    onLogin,
    onRegister,
    onGoogleLogin,
    onGoogleUpgrade,
    onUpgrade,
    onLogout,
    onUsernameChange,
    onSaveUsername
  } = useAppAuthActions({
    token,
    setToken,
    setPlayerState: (value) => setPlayerState(value),
    setTournamentState: (value) => setTournamentState(value),
    setAccount,
    setStatus,
    setError,
    refreshHome,
    refreshAccount,
    account,
    usernameDraft,
    setUsernameDraft,
    clearRouteDataOnLogout,
    onStartIdling,
    tokenStorageKey: TOKEN_KEY,
    upgradeSocialIntentKey: UPGRADE_SOCIAL_INTENT_KEY
  });

  const renderAuthButtons = () => (
    <div className="social">
      <button type="button" className="secondary" onClick={() => void onGoogleLogin()} disabled={authPending || socialUpgradePending}>
        <img src="/google-logo.svg" alt="" width={20} height={20} className="social-button-icon" />
        Continue with Google
      </button>
    </div>
  );

  const renderUpgradeAuthButtons = () => (
    <div className="social">
      <button type="button" className="secondary" onClick={() => void onGoogleUpgrade()} disabled={authPending || socialUpgradePending}>
        <img src="/google-logo.svg" alt="" width={20} height={20} className="social-button-icon" />
        Continue with Google
      </button>
    </div>
  );

  const requireAuthenticatedRoute = (element: ReactElement) => {
    if (!isAuthenticated) {
      return <Navigate to="/" replace />;
    }
    return element;
  };

  if (loading) {
    return (
      <main className="app">
        <p>Preparing your idle session...</p>
        <section className="card message-card" aria-live="polite">
          <p className="label">Idle bulletin</p>
          <div className={`message-bulletin-body message-fade${isFadingOutMessage ? " is-fading-out" : ""}${isFadingInMessage ? " is-fading-in" : ""}`}>
            <IdleBulletinBody content={displayedContent} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <AppNav
        isAuthenticated={isAuthenticated}
        hasUnseenAchievements={Boolean(playerState?.hasUnseenAchievements)}
        showShopAffordableBadge={showShopAffordableBadge}
        showDebugFeatures={showDebugFeatures}
      />

      <>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                playerState={playerState}
                starting={starting}
                collecting={collecting}
                collectBlockedByRestraint={isCollectBlockedByRestraint}
                uncollectedIdleSeconds={uncollectedIdleSeconds}
                realtimeElapsedSeconds={realtimeElapsedSeconds}
                effectiveIdleSecondsRate={effectiveIdleSecondsRate}
                estimatedServerNowMs={estimatedServerNowMs}
                collectingDailyReward={collectingDailyReward}
                collectingDailyBonus={collectingDailyBonus}
                dailyRewardAvailable={dailyRewardAvailable}
                dailyRewardSecondsUntilAvailable={dailyRewardSecondsUntilAvailable}
                dailyBonusSecondsUntilUtcReset={dailyBonusSecondsUntilUtcReset}
                tournamentHasEntered={tournamentHasEntered}
                tournamentSecondsUntilDraw={tournamentSecondsUntilDraw}
                enteringTournament={enteringTournament}
                tournamentOutstandingResult={tournamentState?.outstandingResult ?? null}
                collectingTournamentReward={collectingTournamentReward}
                onCollectTournamentReward={onCollectTournamentReward}
                onStartIdling={onStartIdling}
                onCollect={onCollect}
                onCollectDailyReward={onCollectDailyReward}
                onCollectDailyBonus={onCollectDailyBonus}
                onEnterTournament={onEnterTournament}
                onNavigateTournament={() => navigate("/tournament")}
                onNavigateDailyBonusHistory={() => navigate("/dailybonus")}
                onNavigateCollectionHistory={() => navigate("/collection")}
                onNavigateLogin={() => navigate("/login")}
                availableSurvey={availableSurveyForUi}
                onNavigateSurvey={() => navigate("/survey")}
                onCompleteTutorialStep={onCompleteTutorialStep}
                collectingObligation={collectingObligation}
                onCollectObligation={onCollectObligation}
              />
            }
          />
          <Route
            path="/survey"
            element={requireAuthenticatedRoute(
              <SurveyPage
                token={token}
                onSurveyCompleted={async (granted) => {
                  await refreshHome(token);
                  if (granted) {
                    toast.success(
                      `You earned ${formatRewardAmount(granted.currencyType, granted.reward)}. Thanks for helping out!`
                    );
                  } else {
                    toast.success("Thanks for helping out!");
                  }
                }}
              />
            )}
          />
          <Route
            path="/dailybonus"
            element={requireAuthenticatedRoute(
              <DailyBonusPage
                playerState={playerState}
                collectingDailyReward={collectingDailyReward}
                collectingDailyBonus={collectingDailyBonus}
                dailyRewardAvailable={dailyRewardAvailable}
                dailyRewardSecondsUntilAvailable={dailyRewardSecondsUntilAvailable}
                dailyBonusSecondsUntilUtcReset={dailyBonusSecondsUntilUtcReset}
                dailyBonusHistory={dailyBonusHistoryForPage}
                dailyBonusHistoryLoading={dailyBonusHistoryLoadingForPage}
                onCollectDailyReward={onCollectDailyReward}
                onCollectDailyBonus={onCollectDailyBonus}
              />
            )}
          />
          <Route
            path="/collection"
            element={requireAuthenticatedRoute(
              <CollectionHistoryPage
                history={collectionHistory}
                loading={collectionHistoryLoading}
              />
            )}
          />
          <Route
            path="/help"
            element={<HelpPage />}
          />
          <Route
            path="/tournament"
            element={requireAuthenticatedRoute(
              <TournamentPage
                playerState={playerState}
                tournamentState={tournamentState}
                tournamentSecondsUntilDraw={tournamentSecondsUntilDraw}
                enteringTournament={enteringTournament}
                collectingTournamentReward={collectingTournamentReward}
                tournamentHistory={tournamentHistory}
                tournamentHistoryLoading={tournamentHistoryLoading}
                onEnterTournament={onEnterTournament}
                onCollectTournamentReward={onCollectTournamentReward}
              />
            )}
          />
          <Route
            path="/shop"
            element={requireAuthenticatedRoute(
              <ShopPage
                playerState={playerState}
                estimatedServerNowMs={estimatedServerNowMs}
                shopPendingQuantity={shopPendingQuantity}
                onPurchase={onPurchaseUpgrade}
                onUpgradePlayerLevel={onUpgradePlayerLevel}
                onNavigateHome={() => navigate("/")}
              />
            )}
          />
          {showDebugFeatures ? (
            <Route
              path="/debug"
              element={requireAuthenticatedRoute(
                <DebugPage
                  resettingDailyBonus={resettingDailyBonus}
                  onResetDailyBonus={onDebugResetDailyBonus}
                  debugPendingAction={debugPendingAction}
                  onDebugAddRealTime={onDebugAddRealTime}
                  onDebugAddIdleTime={onDebugAddIdleTime}
                  onDebugAddGems={onDebugAddGems}
                  onDebugResetBalances={onDebugResetBalances}
                  onDebugFinalizeTournament={onDebugFinalizeTournament}
                />
              )}
            />
          ) : null}
          <Route
            path="/login"
            element={
              <LoginPage
                authPending={authPending || socialUpgradePending}
                loginForm={loginForm}
                onLoginFormChange={(field, value) => setLoginForm((prev) => ({ ...prev, [field]: value }))}
                onLogin={() => onLogin(loginForm)}
                onNavigateRegister={() => navigate("/register")}
                renderAuthButtons={renderAuthButtons}
              />
            }
          />
          <Route
            path="/register"
            element={
              <RegisterPage
                authPending={authPending || socialUpgradePending}
                registerForm={signupForm}
                onRegisterFormChange={(field, value) => setSignupForm((prev) => ({ ...prev, [field]: value }))}
                onRegister={() => onRegister(signupForm)}
                onNavigateLogin={() => navigate("/login")}
                renderAuthButtons={renderAuthButtons}
              />
            }
          />
          <Route
            path="/account"
            element={requireAuthenticatedRoute(
              <AccountPage
                account={account}
                token={token}
                authPending={authPending || socialUpgradePending}
                usernamePending={usernamePending}
                dailyRewardNotificationsSupported={dailyRewardNotificationsSupported}
                dailyRewardNotificationsEnabled={dailyRewardNotificationsEnabled}
                dailyRewardNotificationPermission={dailyRewardNotificationPermission}
                dailyRewardNotificationPermissionPending={dailyRewardNotificationPermissionPending}
                usernameDraft={usernameDraft}
                upgradeForm={upgradeForm}
                onUsernameChange={onUsernameChange}
                onSaveUsername={onSaveUsername}
                onUpgradeFormChange={(field, value) => setUpgradeForm((prev) => ({ ...prev, [field]: value }))}
                onUpgrade={() => onUpgrade(upgradeForm)}
                onLogout={onLogout}
                onToggleDailyRewardNotifications={onToggleDailyRewardNotifications}
                onNavigateLogin={() => navigate("/login")}
                renderAuthButtons={renderUpgradeAuthButtons}
                onResetTutorial={onResetTutorial}
              />
            )}
          />
          <Route
            path="/leaderboard"
            element={
              <LeaderboardPage
                leaderboardType={leaderboardType}
                leaderboardLoading={leaderboardLoading}
                leaderboard={leaderboard}
                hasError={Boolean(error)}
                showStartJourneyButton={!isAuthenticated}
                onTypeChange={setLeaderboardType}
                onStartJourney={onStartJourneyFromLeaderboard}
              />
            }
          />
          <Route
            path="/achievements"
            element={requireAuthenticatedRoute(
              <AchievementsPage
                achievements={achievements}
                achievementsLoading={achievementsLoading}
                hasError={Boolean(error)}
              />
            )}
          />
          <Route
            path="/player/:playerId"
            element={
              <PlayerPage
                publicPlayerLoading={publicPlayerLoading}
                publicPlayerProfile={publicPlayerProfile}
                hasError={Boolean(error)}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {error ? <p className="error">{error}</p> : null}
      </>
      <section className="card message-card" aria-live="polite">
        <p className="label">Idle bulletin</p>
        <div className={`message-bulletin-body message-fade${isFadingOutMessage ? " is-fading-out" : ""}${isFadingInMessage ? " is-fading-in" : ""}`}>
          <IdleBulletinBody content={displayedContent} />
        </div>
      </section>
    </main>
  );
}
