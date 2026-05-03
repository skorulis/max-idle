import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import { AppNav } from "./AppNav";
import { toast, toastCollectIdle } from "../gameToast";
import { calculateBoostedIdleSecondsGain, getEffectiveIdleSecondsRate, isIdleCollectionBlockedByRestraint } from "../idleRate";
import { getCollectGemIdleSecondsMultiplier } from "../shopUpgrades";
import { isDailyBonusFeatureUnlocked, isTournamentFeatureUnlocked } from "../shop";
import { COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE, SHOP_UPGRADE_IDS, SHOP_UPGRADES_BY_ID } from "../shopUpgrades";
import {
  type ShopUpgradeId
} from "../shopUpgrades";
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
  collectDailyBonus,
  collectDailyReward,
  collectIdleTime,
  collectTournamentReward,
  createAnonymousSession,
  deletePushSubscription,
  debugAddGems,
  debugAddIdleTime,
  debugAddRealTime,
  debugFinalizeCurrentTournament,
  debugResetBalances,
  debugResetCurrentDailyBonus,
  completeSocialUpgrade,
  enterTournament,
  getAccount,
  getAchievements,
  getCollectionHistory,
  getDailyBonusHistory,
  getHome,
  getLeaderboard,
  getPlayer,
  grantClientDrivenAchievement,
  getPushConfig,
  getCurrentTournament,
  getTournamentHistory,
  getPublicPlayerProfile,
  loginWithEmail,
  markAchievementsSeen,
  logoutSession,
  purchaseUpgrade,
  registerWithEmail,
  upsertPushSubscription,
  updateUsername,
  upgradeAnonymous
} from "./api";
import { formatRestraintBlockedCollectMessage, hasAffordableIdleOrRealTimeShopPurchase } from "../shop";
import { ACHIEVEMENT_IDS } from "../achievements";
import { authClient } from "./authClient.ts";
import { alignClientClock, useClientNowMs } from "./clientClock";
import {
  getSecondsUntilNextUtcDayBoundary,
  getTournamentSecondsUntilDraw,
  toSyncedState,
  toSyncedTournamentState
} from "./playerState";
import { useBottomBulletinMessage, type BulletinContent } from "./useBottomBulletinMessage";
import { useReturnAfterAwayMessage } from "./useReturnAfterAwayMessage";
import { formatRewardAmount } from "../formatReward";
import type {
  AccountResponse,
  AchievementsResponse,
  AuthFormState,
  AvailableSurveySummary,
  CollectionHistoryItem,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  DailyBonusHistoryItem,
  SyncedTournamentState,
  SyncedPlayerState,
  TournamentHistoryItem
} from "./types";

const TOKEN_KEY = "max-idle-token";
const UPGRADE_SOCIAL_INTENT_KEY = "max-idle-upgrade-social-intent";
const DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY = "max-idle-daily-reward-notifications-enabled";
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
  collect_gem_time_boost: "Hasty collection is already maxed.",
  daily_bonus_feature: "Daily Bonus is already unlocked.",
  tournament_feature: "Weekly Tournament is already unlocked."
};

function isDailyRewardNotificationsEnabledStored(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY) === "true";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isValidPushSubscription(
  subscriptionJson: PushSubscriptionJSON
): subscriptionJson is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return Boolean(subscriptionJson.endpoint && subscriptionJson.keys?.p256dh && subscriptionJson.keys?.auth);
}

function isLikelyValidVapidPublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const decoded = window.atob(padded);
    return decoded.length === 65 && decoded.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

async function getActivePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existingRegistration = await navigator.serviceWorker.getRegistration("/push-sw.js");
  if (existingRegistration?.active) {
    return existingRegistration;
  }
  await navigator.serviceWorker.register("/push-sw.js");
  return navigator.serviceWorker.ready;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const playerRouteMatch = useMatch("/player/:playerId");
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
  const [tournamentState, setTournamentState] = useState<SyncedTournamentState | null>(null);
  const [availableSurvey, setAvailableSurvey] = useState<AvailableSurveySummary | null>(null);
  const [publicPlayerProfile, setPublicPlayerProfile] = useState<PlayerProfileResponse["player"] | null>(null);
  const [publicPlayerLoading, setPublicPlayerLoading] = useState(false);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("current");
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [dailyBonusHistory, setDailyBonusHistory] = useState<DailyBonusHistoryItem[]>([]);
  const [dailyBonusHistoryLoading, setDailyBonusHistoryLoading] = useState(false);
  const [collectionHistory, setCollectionHistory] = useState<CollectionHistoryItem[]>([]);
  const [collectionHistoryLoading, setCollectionHistoryLoading] = useState(false);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistoryItem[]>([]);
  const [tournamentHistoryLoading, setTournamentHistoryLoading] = useState(false);
  const [, setStatus] = useState("Press start when you are ready to do nothing.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectingDailyReward, setCollectingDailyReward] = useState(false);
  const [collectingDailyBonus, setCollectingDailyBonus] = useState(false);
  const [enteringTournament, setEnteringTournament] = useState(false);
  const [collectingTournamentReward, setCollectingTournamentReward] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [shopPendingQuantity, setShopPendingQuantity] = useState<
    | "seconds_multiplier"
    | "another_seconds_multiplier"
    | "patience"
    | "restraint"
    | "idle_hoarder"
    | "luck"
    | "worthwhile_achievements"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "purchase_refund"
    | "daily_bonus_feature"
    | "tournament_feature"
    | "storage_extension"
    | null
  >(null);
  const [resettingDailyBonus, setResettingDailyBonus] = useState(false);
  const [debugPendingAction, setDebugPendingAction] = useState<"real" | "idle" | "gems" | "balances" | "tournament" | null>(
    null
  );
  const [dailyRewardNotificationsEnabled, setDailyRewardNotificationsEnabled] = useState(() =>
    isDailyRewardNotificationsEnabledStored()
  );
  const [dailyRewardNotificationPermissionPending, setDailyRewardNotificationPermissionPending] = useState(false);
  const [loginForm, setLoginForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [signupForm, setSignupForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [upgradeForm, setUpgradeForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const isAuthenticated = Boolean(playerState);
  const availableSurveyForUi = playerState ? availableSurvey : null;

  const { displayedContent, isFadingOutMessage, isFadingInMessage } = useBottomBulletinMessage(isAuthenticated);
  const showDebugFeatures = !import.meta.env.PROD;
  const clientNowMs = useClientNowMs();
  const dailyBonusHistoryUnlocked =
    playerState != null && isDailyBonusFeatureUnlocked(playerState.shop);
  const dailyBonusHistoryForPage = dailyBonusHistoryUnlocked ? dailyBonusHistory : [];
  const dailyBonusHistoryLoadingForPage = dailyBonusHistoryUnlocked ? dailyBonusHistoryLoading : false;

  useReturnAfterAwayMessage();

  const routePlayerId = useMemo(() => {
    const rawPlayerId = playerRouteMatch?.params.playerId;
    if (!rawPlayerId) {
      return null;
    }
    try {
      return decodeURIComponent(rawPlayerId);
    } catch {
      return rawPlayerId;
    }
  }, [playerRouteMatch?.params.playerId]);

  useEffect(() => {
    if (location.pathname !== "/dailybonus") {
      return;
    }

    if (!playerState || !isDailyBonusFeatureUnlocked(playerState.shop)) {
      return;
    }

    let cancelled = false;
    const loadDailyBonusHistory = async () => {
      setDailyBonusHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getDailyBonusHistory(token);
        if (!cancelled) {
          setDailyBonusHistory(nextHistory);
        }
      } catch (dailyBonusHistoryError) {
        if (cancelled) {
          return;
        }
        setDailyBonusHistory([]);
        if (dailyBonusHistoryError instanceof Error && dailyBonusHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view daily bonus history.");
          return;
        }
        if (dailyBonusHistoryError instanceof Error && dailyBonusHistoryError.message === "DAILY_BONUS_FEATURE_LOCKED") {
          setError("Purchase Daily Bonus in the shop to view history.");
          return;
        }
        setError(dailyBonusHistoryError instanceof Error ? dailyBonusHistoryError.message : "Failed to load daily bonus history.");
      } finally {
        if (!cancelled) {
          setDailyBonusHistoryLoading(false);
        }
      }
    };

    void loadDailyBonusHistory();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, account?.gameUserId, playerState]);

  useEffect(() => {
    if (location.pathname !== "/collection") {
      return;
    }

    let cancelled = false;
    const loadCollectionHistory = async () => {
      setCollectionHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getCollectionHistory(token);
        if (!cancelled) {
          setCollectionHistory(nextHistory);
        }
      } catch (collectionHistoryError) {
        if (cancelled) {
          return;
        }
        setCollectionHistory([]);
        if (collectionHistoryError instanceof Error && collectionHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view collection history.");
          return;
        }
        setError(collectionHistoryError instanceof Error ? collectionHistoryError.message : "Failed to load collection history.");
      } finally {
        if (!cancelled) {
          setCollectionHistoryLoading(false);
        }
      }
    };

    void loadCollectionHistory();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, account?.gameUserId]);

  useEffect(() => {
    if (location.pathname !== "/tournament") {
      return;
    }

    if (!playerState || !isTournamentFeatureUnlocked(playerState.shop)) {
      return;
    }

    let cancelled = false;
    const loadTournamentHistory = async () => {
      setTournamentHistoryLoading(true);
      setError(null);
      try {
        const nextHistory = await getTournamentHistory(token);
        if (!cancelled) {
          setTournamentHistory(nextHistory);
        }
      } catch (tournamentHistoryError) {
        if (cancelled) {
          return;
        }
        setTournamentHistory([]);
        if (tournamentHistoryError instanceof Error && tournamentHistoryError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view tournament history.");
          return;
        }
        if (tournamentHistoryError instanceof Error && tournamentHistoryError.message === "TOURNAMENT_FEATURE_LOCKED") {
          setError("Purchase Weekly Tournament in the shop to view history.");
          return;
        }
        setError(
          tournamentHistoryError instanceof Error ? tournamentHistoryError.message : "Failed to load tournament history."
        );
      } finally {
        if (!cancelled) {
          setTournamentHistoryLoading(false);
        }
      }
    };

    void loadTournamentHistory();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, account?.gameUserId, playerState]);

  useEffect(() => {
    if (location.pathname !== "/leaderboard") {
      return;
    }

    let cancelled = false;
    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      setError(null);
      try {
        const nextLeaderboard = await getLeaderboard(token, leaderboardType);
        if (!cancelled) {
          setLeaderboard(nextLeaderboard);
        }
      } catch (leaderboardError) {
        if (cancelled) {
          return;
        }
        setLeaderboard(null);
        if (leaderboardError instanceof Error && leaderboardError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view the leaderboard.");
          return;
        }
        setError(leaderboardError instanceof Error ? leaderboardError.message : "Failed to load leaderboard.");
      } finally {
        if (!cancelled) {
          setLeaderboardLoading(false);
        }
      }
    };

    void loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, account?.gameUserId, leaderboardType]);

  useEffect(() => {
    if (location.pathname !== "/achievements") {
      return;
    }

    let cancelled = false;
    const loadAchievements = async () => {
      setAchievementsLoading(true);
      setError(null);
      try {
        const nextAchievements = await getAchievements(token);
        if (!cancelled) {
          setAchievements(nextAchievements);
        }
      } catch (achievementsError) {
        if (cancelled) {
          return;
        }
        setAchievements(null);
        if (achievementsError instanceof Error && achievementsError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view achievements.");
          return;
        }
        setError(achievementsError instanceof Error ? achievementsError.message : "Failed to load achievements.");
      } finally {
        if (!cancelled) {
          setAchievementsLoading(false);
        }
      }
    };

    void loadAchievements();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, account?.gameUserId]);

  useEffect(() => {
    if (location.pathname !== "/achievements" || !playerState?.hasUnseenAchievements) {
      return;
    }

    let cancelled = false;
    const clearUnseenAchievements = async () => {
      try {
        await markAchievementsSeen(token);
        if (!cancelled) {
          setPlayerState((previousState) =>
            previousState
              ? {
                  ...previousState,
                  hasUnseenAchievements: false
                }
              : previousState
          );
        }
      } catch (markSeenError) {
        if (cancelled) {
          return;
        }
        if (markSeenError instanceof Error && markSeenError.message === "UNAUTHORIZED") {
          setError("Login or start idling to view achievements.");
          return;
        }
        setError(markSeenError instanceof Error ? markSeenError.message : "Failed to clear achievement badge.");
      }
    };

    void clearUnseenAchievements();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token, playerState?.hasUnseenAchievements]);

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
          const synced = toSyncedState(nextPlayer);
          alignClientClock();
          setPlayerState(synced);
        })
        .catch(() => {
          // Ignore errors here to avoid interrupting normal home-page flow.
        });
    }, CONTEMPLATION_ACHIEVEMENT_HOME_TIME_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, location.pathname, token]);

  useEffect(() => {
    if (!routePlayerId) {
      return;
    }

    let cancelled = false;
    const loadPlayerProfile = async () => {
      setPublicPlayerLoading(true);
      setError(null);
      try {
        const profileResponse = await getPublicPlayerProfile(routePlayerId);
        if (!cancelled) {
          setPublicPlayerProfile(profileResponse.player);
        }
      } catch (profileError) {
        if (cancelled) {
          return;
        }
        setPublicPlayerProfile(null);
        if (profileError instanceof Error && profileError.message === "PLAYER_NOT_FOUND") {
          return;
        }
        setError(profileError instanceof Error ? profileError.message : "Failed to load player profile.");
      } finally {
        if (!cancelled) {
          setPublicPlayerLoading(false);
        }
      }
    };

    void loadPlayerProfile();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, routePlayerId]);

  const refreshAccount = async (currentToken: string | null) => {
    try {
      const accountResponse = await getAccount(currentToken);
      setAccount(accountResponse);
      setUsernameDraft(accountResponse.username ?? "");
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message === "UNAUTHORIZED") {
        setAccount(null);
        setUsernameDraft("");
        return;
      }
      throw accountError;
    }
  };

  const refreshPlayer = async (currentToken: string | null) => {
    const player = await getPlayer(currentToken);
    const synced = toSyncedState(player);
    alignClientClock();
    setPlayerState(synced);
  };

  const refreshTournament = useCallback(async (currentToken: string | null) => {
    try {
      const tournament = await getCurrentTournament(currentToken);
      const synced = toSyncedTournamentState(tournament);
      setTournamentState(synced);
    } catch (tournamentError) {
      if (tournamentError instanceof Error && tournamentError.message === "UNAUTHORIZED") {
        setTournamentState(null);
        return;
      }
      if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setTournamentState(null);
        return;
      }
      throw tournamentError;
    }
  }, []);

  const tournamentFeatureUnlocked = Boolean(playerState && isTournamentFeatureUnlocked(playerState.shop));

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

  const refreshHome = useCallback(async (currentToken: string | null) => {
    const home = await getHome(currentToken);
    const synced = toSyncedState(home.player);
    alignClientClock();
    setPlayerState(synced);
    setAccount(home.account);
    setUsernameDraft(home.account.username ?? "");
    if (home.tournament) {
      setTournamentState(toSyncedTournamentState(home.tournament));
    } else {
      setTournamentState(null);
    }
    setAvailableSurvey(home.availableSurvey ?? null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        let currentToken = localStorage.getItem(TOKEN_KEY);

        try {
          await refreshHome(currentToken);
          setToken(currentToken);
          setStatus("You are doing nothing. Excellent.");
          return;
        } catch (bootstrapError) {
          if (bootstrapError instanceof Error && bootstrapError.message === "UNAUTHORIZED" && currentToken) {
            localStorage.removeItem(TOKEN_KEY);
            currentToken = null;
            setToken(null);
            try {
              await refreshHome(null);
              setStatus("You are doing nothing. Excellent.");
              return;
            } catch {
              // Fall through to empty state.
            }
          }
        }

        setPlayerState(null);
        setTournamentState(null);
        setAccount(null);
        setUsernameDraft("");
        setStatus("Press start when you are ready to do nothing.");
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [refreshHome]);

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
      setAuthPending(true);
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
          setAuthPending(false);
          clearUpgradeQuery();
        }
      }
    };

    void finalizeSocialUpgrade();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, refreshHome]);

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
    const base = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: Math.max(0, elapsedSinceLastCollection),
      shop: playerState.shop,
      achievementCount: playerState.achievementCount,
      realTimeAvailable: playerState.realTime.available
    });
    return Math.floor(
      base * getCollectGemIdleSecondsMultiplier(COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.currentLevel(playerState.shop))
    );
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
      realTimeAvailable: playerState.realTime.available
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

  const dailyRewardNotificationsSupported = typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const dailyRewardNotificationPermission: NotificationPermission | "unsupported" = dailyRewardNotificationsSupported
    ? Notification.permission
    : "unsupported";

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

  const onToggleDailyRewardNotifications = async (enabled: boolean) => {
    if (!dailyRewardNotificationsSupported) {
      setError("Push notifications are not supported on this device.");
      return;
    }
    if (!enabled) {
      try {
        setDailyRewardNotificationPermissionPending(true);
        const serviceWorkerRegistration = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const existingSubscription = await serviceWorkerRegistration?.pushManager.getSubscription();
        if (existingSubscription?.endpoint) {
          await deletePushSubscription(token, existingSubscription.endpoint).catch(() => {
            // Keep UX responsive if backend cleanup fails.
          });
        }
        await existingSubscription?.unsubscribe();
        setDailyRewardNotificationsEnabled(false);
        localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
        setStatus("Daily reward notifications disabled.");
        setError(null);
      } finally {
        setDailyRewardNotificationPermissionPending(false);
      }
      return;
    }

    try {
      setDailyRewardNotificationPermissionPending(true);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDailyRewardNotificationsEnabled(false);
        localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
        setError("Enable browser notifications to receive daily reward alerts.");
        return;
      }
      const config = await getPushConfig();
      if (!isLikelyValidVapidPublicKey(config.vapidPublicKey)) {
        throw new Error("INVALID_VAPID_PUBLIC_KEY");
      }
      const serviceWorkerRegistration = await getActivePushServiceWorkerRegistration();
      const existingSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
      const pushSubscription = existingSubscription ?? (await serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) as BufferSource
      }));
      const subscriptionJson = pushSubscription.toJSON();
      if (!isValidPushSubscription(subscriptionJson)) {
        throw new Error("Failed to create push subscription");
      }
      await upsertPushSubscription(token, {
        endpoint: subscriptionJson.endpoint,
        keys: {
          p256dh: subscriptionJson.keys.p256dh,
          auth: subscriptionJson.keys.auth
        }
      });
      setDailyRewardNotificationsEnabled(true);
      localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "true");
      setStatus("Daily reward notifications enabled.");
      setError(null);
    } catch (notificationError) {
      setDailyRewardNotificationsEnabled(false);
      localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
      const message = notificationError instanceof Error ? notificationError.message : "Could not enable daily reward notifications.";
      if (message === "INVALID_VAPID_PUBLIC_KEY") {
        setError("Push registration failed. Check backend VAPID keys and regenerate them as a matching pair.");
      } else if (message.toLowerCase().includes("push service error")) {
        setError("Push service is unavailable in this browser profile right now. Localhost is supported; try reloading, re-enabling notifications, and checking browser push/privacy settings.");
      } else {
        setError(message);
      }
    } finally {
      setDailyRewardNotificationPermissionPending(false);
    }
  };

  const onCollect = async (): Promise<
    { collectedSeconds: number; realSecondsCollected: number } | undefined
  > => {
    if (!playerState) {
      return undefined;
    }
    if (isCollectBlockedByRestraint) {
      setError(restraintCollectBlockedMessage);
      setStatus("Keep idling to satisfy Restraint.");
      return undefined;
    }

    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");

    try {
      const nextPlayer = await collectIdleTime(token);
      const collectedSeconds = nextPlayer.collectedSeconds ?? 0;
      const realSecondsCollected = nextPlayer.realSecondsCollected ?? 0;
      toastCollectIdle(collectedSeconds, realSecondsCollected);
      const synced = toSyncedState(nextPlayer);
      alignClientClock();
      setPlayerState(synced);
      await refreshAccount(token);
      setStatus("Collected. You may now continue doing nothing.");
      return { collectedSeconds, realSecondsCollected };
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (collectError instanceof Error && collectError.message === "RESTRAINT_BLOCKED") {
        setError(restraintCollectBlockedMessage);
        setStatus("Keep idling to satisfy Restraint.");
        return;
      }
      setError(collectError instanceof Error ? collectError.message : "Collect failed");
      setStatus("Your inactivity transfer was interrupted.");
      return undefined;
    } finally {
      setCollecting(false);
    }
  };

  const onPurchaseUpgrade = async (upgradeId: ShopUpgradeId) => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity(upgradeId);
    setError(null);
    try {
      const updatedPlayer = await purchaseUpgrade(token, upgradeId);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      if (upgradeId === SHOP_UPGRADE_IDS.TOURNAMENT_FEATURE) {
        void refreshTournament(token).catch(() => {
          // Ignore; user can refresh from home or tournament page.
        });
      }
      const purchasedUpgrade = SHOP_UPGRADES_BY_ID[upgradeId];
      const purchasedLevel = purchasedUpgrade.currentLevel(synced.shop);
      const shopToastMessage =
        purchasedLevel > 0
          ? `Purchased ${purchasedUpgrade.name} level ${purchasedLevel}`
          : `Purchased ${purchasedUpgrade.name}`;
      toast.success(shopToastMessage);
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough resources for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError(SHOP_ALREADY_OWNED_MESSAGE[upgradeId] ?? purchaseError.message);
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onDebugAddGems = async () => {
    if (!playerState) {
      return;
    }

    setDebugPendingAction("gems");
    setError(null);
    setStatus("Adding debug gems...");
    try {
      const updatedPlayer = await debugAddGems(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 5 debug gems.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug gems");
      toast.error("Could not add debug gems.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugResetDailyBonus = async () => {
    if (!playerState) {
      return;
    }

    setResettingDailyBonus(true);
    setError(null);
    try {
      await debugResetCurrentDailyBonus(token);
      await refreshPlayer(token);
      toast.success("Reset current daily bonus.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to reset daily bonus");
    } finally {
      setResettingDailyBonus(false);
    }
  };

  const onDebugAddRealTime = async () => {
    if (!playerState) {
      return;
    }

    setDebugPendingAction("real");
    setError(null);
    setStatus("Adding debug real time...");
    try {
      const updatedPlayer = await debugAddRealTime(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 12 hours of real time.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug real time");
      toast.error("Could not add debug real time.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugAddIdleTime = async () => {
    if (!playerState) {
      return;
    }

    setDebugPendingAction("idle");
    setError(null);
    setStatus("Adding debug idle time...");
    try {
      const updatedPlayer = await debugAddIdleTime(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Added 12 hours of idle time.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug idle time");
      toast.error("Could not add debug idle time.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugResetBalances = async () => {
    if (!playerState) {
      return;
    }

    setDebugPendingAction("balances");
    setError(null);
    setStatus("Resetting balances...");
    try {
      const updatedPlayer = await debugResetBalances(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      toast.success("Reset all balances to zero.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to reset balances");
      toast.error("Could not reset balances.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onDebugFinalizeTournament = async () => {
    if (!playerState) {
      return;
    }

    setDebugPendingAction("tournament");
    setError(null);
    setStatus("Finalizing tournament...");
    try {
      const result = await debugFinalizeCurrentTournament(token);
      if (!result.ok) {
        toast.error("No active tournament.");
        return;
      }
      await refreshHome(token);
      toast.success(
        `Tournament finalized (${result.entryCount} entr${result.entryCount === 1 ? "y" : "ies"}). New round #${result.newTournamentId}.`
      );
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to finalize tournament");
      toast.error("Could not finalize tournament.");
    } finally {
      setDebugPendingAction(null);
    }
  };

  const onCollectDailyReward = async () => {
    if (!playerState) {
      return;
    }

    setCollectingDailyReward(true);
    setError(null);
    try {
      const nextPlayer = await collectDailyReward(token);
      const synced = toSyncedState(nextPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Daily reward collected.");
    } catch (dailyRewardError) {
      if (dailyRewardError instanceof Error && dailyRewardError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (dailyRewardError instanceof Error && dailyRewardError.message === "DAILY_REWARD_NOT_AVAILABLE") {
        setError("Daily reward already collected today. Next reset is 00:00:00 UTC.");
      } else {
        setError(dailyRewardError instanceof Error ? dailyRewardError.message : "Daily reward collection failed");
      }
    } finally {
      setCollectingDailyReward(false);
    }
  };

  const onCollectDailyBonus = async () => {
    if (!playerState) {
      return;
    }
    setCollectingDailyBonus(true);
    setError(null);
    try {
      const nextPlayer = await collectDailyBonus(token);
      const synced = toSyncedState(nextPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Daily bonus activated.");
    } catch (dailyBonusError) {
      if (dailyBonusError instanceof Error && dailyBonusError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_INSUFFICIENT_IDLE") {
        setError("Not enough idle time in the bank to activate today's daily bonus.");
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_ALREADY_CLAIMED") {
        setError("Daily bonus already activated today.");
      } else if (dailyBonusError instanceof Error && dailyBonusError.message === "DAILY_BONUS_FEATURE_LOCKED") {
        setError("Purchase Daily Bonus in the shop to activate.");
      } else {
        setError(dailyBonusError instanceof Error ? dailyBonusError.message : "Daily bonus collection failed");
      }
    } finally {
      setCollectingDailyBonus(false);
    }
  };

  const onEnterTournament = async () => {
    if (!playerState) {
      return;
    }
    setEnteringTournament(true);
    setError(null);
    try {
      const response = await enterTournament(token);
      setTournamentState(toSyncedTournamentState(response.tournament));
      setStatus(response.enteredNow ? "Entered weekly tournament." : "Already entered in this week's tournament.");
    } catch (tournamentError) {
      if (tournamentError instanceof Error && tournamentError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setTournamentState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_DRAW_IN_PROGRESS") {
        setError("Tournament draw is finalizing. Please retry in a moment.");
        void refreshTournament(token).catch(() => {
          // Ignore refresh errors and keep current state.
        });
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setError("Purchase Weekly Tournament in the shop to enter.");
      } else if (tournamentError instanceof Error && tournamentError.message === "TOURNAMENT_REWARD_UNCOLLECTED") {
        setError("Collect your last tournament reward before entering this week's draw.");
      } else {
        setError(tournamentError instanceof Error ? tournamentError.message : "Failed to enter tournament");
      }
    } finally {
      setEnteringTournament(false);
    }
  };

  const onCollectTournamentReward = async () => {
    if (!playerState) {
      return;
    }
    setCollectingTournamentReward(true);
    setError(null);
    try {
      const result = await collectTournamentReward(token);
      await refreshHome(token);
      toast.success(`Collected ${result.gemsCollected} Time Gem${result.gemsCollected === 1 ? "" : "s"}.`);
      setStatus("Tournament reward collected.");
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setTournamentState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (collectError instanceof Error && collectError.message === "TOURNAMENT_FEATURE_LOCKED") {
        setError("Purchase Weekly Tournament in the shop.");
      } else if (collectError instanceof Error && collectError.message === "NO_TOURNAMENT_REWARD_TO_COLLECT") {
        setError("No tournament reward to collect.");
        void refreshHome(token).catch(() => {
          // Ignore refresh errors.
        });
      } else {
        setError(collectError instanceof Error ? collectError.message : "Failed to collect tournament reward");
      }
    } finally {
      setCollectingTournamentReward(false);
    }
  };

  const onStartIdling = async () => {
    setStarting(true);
    setError(null);
    setStatus("Creating your anonymous idle identity...");

    try {
      const auth = await createAnonymousSession();
      localStorage.setItem(TOKEN_KEY, auth.token);
      setToken(auth.token);
      await refreshHome(auth.token);
      setStatus("You are doing nothing. Excellent.");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start idling");
      setStatus("Unable to begin idling right now.");
    } finally {
      setStarting(false);
    }
  };

  const onStartJourneyFromLeaderboard = async () => {
    await onStartIdling();
    if (localStorage.getItem(TOKEN_KEY)) {
      navigate("/");
    }
  };

  const onLogin = async () => {
    setAuthPending(true);
    setError(null);
    setStatus("Logging in...");
    try {
      await loginWithEmail(loginForm.email, loginForm.password);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      await refreshHome(null);
      setStatus("Welcome back. Nothing waits for you.");
      navigate("/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
      setStatus("Could not log in.");
    } finally {
      setAuthPending(false);
    }
  };

  const onRegister = async () => {
    setAuthPending(true);
    setError(null);
    setStatus("Creating account...");
    try {
      await registerWithEmail(signupForm.email, signupForm.password);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      await refreshHome(null);
      setStatus("Account created. Continue doing nothing.");
      navigate("/");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed");
      setStatus("Could not create account.");
    } finally {
      setAuthPending(false);
    }
  };

  const onGoogleLogin = async () => {
    setAuthPending(true);
    setError(null);
    setStatus("Redirecting to Google...");
    try {
      const frontendOrigin = window.location.origin;
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${frontendOrigin}/`,
        errorCallbackURL: `${frontendOrigin}/login`
      });
    } catch (socialLoginError) {
      setError(socialLoginError instanceof Error ? socialLoginError.message : "Google sign-in failed");
      setStatus("Could not start Google sign-in.");
      setAuthPending(false);
    }
  };

  const onGoogleUpgrade = async () => {
    if (!token) {
      return;
    }

    setAuthPending(true);
    setError(null);
    setStatus("Redirecting to Google...");
    try {
      const frontendOrigin = window.location.origin;
      sessionStorage.setItem(UPGRADE_SOCIAL_INTENT_KEY, "google");
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${frontendOrigin}/account?upgradeSocial=google`,
        errorCallbackURL: `${frontendOrigin}/account?upgradeSocial=error`
      });
    } catch (socialLoginError) {
      sessionStorage.removeItem(UPGRADE_SOCIAL_INTENT_KEY);
      setError(socialLoginError instanceof Error ? socialLoginError.message : "Google sign-in failed");
      setStatus("Could not start Google sign-in.");
      setAuthPending(false);
    }
  };

  const onUpgrade = async () => {
    if (!token) {
      return;
    }

    setAuthPending(true);
    setError(null);
    setStatus("Upgrading anonymous account...");
    try {
      await upgradeAnonymous(token, upgradeForm.name, upgradeForm.email, upgradeForm.password);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      await refreshHome(null);
      setStatus("Anonymous account upgraded.");
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "Upgrade failed");
      setStatus("Could not upgrade account.");
    } finally {
      setAuthPending(false);
    }
  };

  const onLogout = async () => {
    setAuthPending(true);
    setError(null);
    try {
      await logoutSession();
    } catch {
      // Ignore logout failures; local state reset still proceeds.
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setPlayerState(null);
      setTournamentState(null);
      setAccount(null);
      setLeaderboard(null);
      setAchievements(null);
      setStatus("Press start when you are ready to do nothing.");
      setAuthPending(false);
      navigate("/");
    }
  };

  const onUsernameChange = (value: string) => {
    setUsernameDraft(value);
  };

  const onSaveUsername = async () => {
    if (!account) {
      return;
    }

    const nextUsername = usernameDraft.trim();
    if (!nextUsername || nextUsername === account.username) {
      return;
    }

    setUsernamePending(true);

    try {
      await updateUsername(token, nextUsername);
      await refreshAccount(token);
      toast.success("Username updated successfully.");
    } catch (usernameUpdateError) {
      if (usernameUpdateError instanceof Error && usernameUpdateError.message === "USERNAME_TAKEN") {
        toast.error("That username is already taken.");
      } else {
        toast.error(usernameUpdateError instanceof Error ? usernameUpdateError.message : "Could not update username.");
      }
    } finally {
      setUsernamePending(false);
    }
  };

  const renderAuthButtons = () => (
    <div className="social">
      <button type="button" className="secondary" onClick={() => void onGoogleLogin()} disabled={authPending}>
        <img src="/google-logo.svg" alt="" width={20} height={20} className="social-button-icon" />
        Continue with Google
      </button>
    </div>
  );

  const renderUpgradeAuthButtons = () => (
    <div className="social">
      <button type="button" className="secondary" onClick={() => void onGoogleUpgrade()} disabled={authPending}>
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
                shopPendingQuantity={shopPendingQuantity}
                onPurchase={onPurchaseUpgrade}
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
                authPending={authPending}
                loginForm={loginForm}
                onLoginFormChange={(field, value) => setLoginForm((prev) => ({ ...prev, [field]: value }))}
                onLogin={onLogin}
                onNavigateRegister={() => navigate("/register")}
                renderAuthButtons={renderAuthButtons}
              />
            }
          />
          <Route
            path="/register"
            element={
              <RegisterPage
                authPending={authPending}
                registerForm={signupForm}
                onRegisterFormChange={(field, value) => setSignupForm((prev) => ({ ...prev, [field]: value }))}
                onRegister={onRegister}
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
                authPending={authPending}
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
                onUpgrade={onUpgrade}
                onLogout={onLogout}
                onToggleDailyRewardNotifications={onToggleDailyRewardNotifications}
                onNavigateLogin={() => navigate("/login")}
                renderAuthButtons={renderUpgradeAuthButtons}
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
