import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp, CircleUserRound, Hourglass, Medal, ShoppingCart, Star } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import GameIcon from "../GameIcon";
import { calculateBoostedIdleSecondsGain, getEffectiveIdleSecondsRate, isIdleCollectionBlockedByRestraint } from "../idleRate";
import { getCollectGemBoostLevel } from "../shop";
import { getCollectGemIdleSecondsMultiplier, SECONDS_MULTIPLIER_SHOP_UPGRADE } from "../shopUpgrades";
import {
  getIdleHoarderLevel,
  getLuckLevel,
  getRestraintLevel,
  getSecondsMultiplierLevel,
  getWorthwhileAchievementsLevel
} from "../shop";
import {
  IDLE_HOARDER_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE
} from "../shopUpgrades";
import { AccountPage } from "../pages/AccountPage";
import { AchievementsPage } from "../pages/AchievementsPage";
import { HomePage } from "../pages/HomePage";
import { HelpPage } from "../pages/HelpPage";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { LoginPage } from "../pages/LoginPage";
import { PlayerPage } from "../pages/PlayerPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ShopPage } from "../pages/ShopPage";
import { TournamentPage } from "../pages/TournamentPage";
import {
  collectDailyReward,
  collectIdleTime,
  createAnonymousSession,
  deletePushSubscription,
  debugAddGems,
  completeSocialUpgrade,
  enterTournament,
  getAccount,
  getAchievements,
  getLeaderboard,
  getPlayer,
  getPushConfig,
  getCurrentTournament,
  getPublicPlayerProfile,
  loginWithEmail,
  markAchievementsSeen,
  logoutSession,
  purchaseExtraRealtimeWait,
  purchaseCollectGemTimeBoost,
  purchaseIdleHoarder,
  purchaseLuck,
  purchaseWorthwhileAchievements,
  purchaseRefund,
  purchaseRestraint,
  purchaseSecondsMultiplier,
  registerWithEmail,
  upsertPushSubscription,
  updateUsername,
  upgradeAnonymous
} from "./api";
import { authClient } from "./authClient.ts";
import { alignClientClock, useClientNowMs } from "./clientClock";
import { getTournamentSecondsUntilDraw, toSyncedState, toSyncedTournamentState } from "./playerState";
import type {
  AccountResponse,
  AchievementsResponse,
  AuthFormState,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  SyncedTournamentState,
  SyncedPlayerState
} from "./types";

const TOKEN_KEY = "max-idle-token";
const UPGRADE_SOCIAL_INTENT_KEY = "max-idle-upgrade-social-intent";
const DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY = "max-idle-daily-reward-notifications-enabled";
const FALLBACK_MESSAGE = "The message board is taking a snack break.";
const WELCOME_MESSAGE = "Welcome to the world of competitive waiting.";
const HUMOROUS_MESSAGES = [
  "Your productivity has entered low-power mode.",
  "Another second has passed without incident",
  "Your idle engine is purring like a very relaxed cat.",
  "If you stare at the counter it will stare back.",
  "Make sure to keep hydrated, you could be waiting a while.",
  "Doing nothing remains unexpectedly effective.",
  "Competitive idling isn't for the faint of heart.",
  "What will you do with all of that time?",
  "Your goal is simple.  Be idle for longer than anyone else.",
  "To catch up, try doing nothing faster.",
  "If you keep going, you’ll waste a full day in only 24 hours.",
  "Who has time? But then if we do not ever take time, how can we ever have time? -Merovingian",
];

function getRandomMessageIndex(excludeIndex?: number): number {
  if (HUMOROUS_MESSAGES.length === 0) {
    return -1;
  }
  if (HUMOROUS_MESSAGES.length === 1) {
    return 0;
  }
  let nextIndex = Math.floor(Math.random() * HUMOROUS_MESSAGES.length);
  while (nextIndex === excludeIndex) {
    nextIndex = Math.floor(Math.random() * HUMOROUS_MESSAGES.length);
  }
  return nextIndex;
}

function getMessageFromIndex(index: number): string {
  return HUMOROUS_MESSAGES[index] ?? FALLBACK_MESSAGE;
}

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
  const [publicPlayerProfile, setPublicPlayerProfile] = useState<PlayerProfileResponse["player"] | null>(null);
  const [publicPlayerLoading, setPublicPlayerLoading] = useState(false);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("current");
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [, setStatus] = useState("Press start when you are ready to do nothing.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectingDailyReward, setCollectingDailyReward] = useState(false);
  const [enteringTournament, setEnteringTournament] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [shopPendingQuantity, setShopPendingQuantity] = useState<
    | "seconds_multiplier"
    | "restraint"
    | "idle_hoarder"
    | "luck"
    | "worthwhile_achievements"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "purchase_refund"
    | "debug_add_gems"
    | null
  >(null);
  const [messageCardRandomIndex, setMessageCardRandomIndex] = useState(() => getRandomMessageIndex());
  const [displayedMessage, setDisplayedMessage] = useState(WELCOME_MESSAGE);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [messageFadeStage, setMessageFadeStage] = useState<"idle" | "fading-out" | "fading-in">("idle");
  const [dailyRewardNotificationsEnabled, setDailyRewardNotificationsEnabled] = useState(() =>
    isDailyRewardNotificationsEnabledStored()
  );
  const [dailyRewardNotificationPermissionPending, setDailyRewardNotificationPermissionPending] = useState(false);
  const [loginForm, setLoginForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [signupForm, setSignupForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [upgradeForm, setUpgradeForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const isAuthenticated = Boolean(playerState);
  const clientNowMs = useClientNowMs();

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
    if (!isAuthenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      setMessageCardRandomIndex((previousIndex) => getRandomMessageIndex(previousIndex));
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

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
      setUsernameError(null);
      setUsernameSuccess(null);
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message === "UNAUTHORIZED") {
        setAccount(null);
        setUsernameDraft("");
        setUsernameError(null);
        setUsernameSuccess(null);
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
      throw tournamentError;
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        let currentToken = localStorage.getItem(TOKEN_KEY);

        try {
          await refreshPlayer(currentToken);
          setToken(currentToken);
          await refreshAccount(currentToken);
          await refreshTournament(currentToken);
          setStatus("You are doing nothing. Excellent.");
          return;
        } catch (bootstrapError) {
          if (bootstrapError instanceof Error && bootstrapError.message === "UNAUTHORIZED" && currentToken) {
            localStorage.removeItem(TOKEN_KEY);
            currentToken = null;
            setToken(null);
            try {
              await refreshPlayer(null);
              await refreshAccount(null);
              await refreshTournament(null);
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
  }, [refreshTournament]);

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
        await refreshPlayer(null);
        await refreshAccount(null);
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
          await refreshPlayer(anonymousToken);
          await refreshAccount(anonymousToken);
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
  }, [location.pathname, location.search, navigate]);

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
    return Math.floor(base * getCollectGemIdleSecondsMultiplier(getCollectGemBoostLevel(playerState.shop)));
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
    const now = new Date(estimatedServerNowMs);
    const nextUtcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(0, Math.ceil((nextUtcDayStartMs - estimatedServerNowMs) / 1000));
  }, [dailyRewardAvailable, estimatedServerNowMs, playerState]);

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

  const secondsMultiplierLevel = useMemo(() => {
    return playerState ? getSecondsMultiplierLevel(playerState.shop) : 0;
  }, [playerState]);

  const secondsMultiplierCost = useMemo(() => {
    const maxLevel = SECONDS_MULTIPLIER_SHOP_UPGRADE.maxLevel();
    if (secondsMultiplierLevel >= maxLevel) {
      return null;
    }
    return SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(secondsMultiplierLevel);
  }, [secondsMultiplierLevel]);
  const restraintLevel = playerState ? getRestraintLevel(playerState.shop) : 0;
  const restraintMaxLevel = RESTRAINT_SHOP_UPGRADE.maxLevel();
  const luckLevel = playerState ? getLuckLevel(playerState.shop) : 0;
  const luckMaxLevel = LUCK_SHOP_UPGRADE.maxLevel();
  const idleHoarderLevel = playerState ? getIdleHoarderLevel(playerState.shop) : 0;
  const idleHoarderMaxLevel = IDLE_HOARDER_SHOP_UPGRADE.maxLevel();
  const worthwhileAchievementsLevel = playerState ? getWorthwhileAchievementsLevel(playerState.shop) : 0;
  const worthwhileAchievementsMaxLevel = WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.maxLevel();

  const activeMessageCardText = isAuthenticated
    ? getMessageFromIndex(messageCardRandomIndex)
    : WELCOME_MESSAGE;
  const isFadingOutMessage = messageFadeStage === "fading-out";
  const isFadingInMessage = messageFadeStage === "fading-in";

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

  useEffect(() => {
    if (activeMessageCardText === displayedMessage || activeMessageCardText === pendingMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingMessage(activeMessageCardText);
      setMessageFadeStage("fading-out");
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeMessageCardText, displayedMessage, pendingMessage]);

  useEffect(() => {
    if (messageFadeStage !== "fading-out") {
      return;
    }
    const timer = window.setTimeout(() => {
      setDisplayedMessage(pendingMessage ?? activeMessageCardText);
      setMessageFadeStage("fading-in");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage, pendingMessage, activeMessageCardText]);

  useEffect(() => {
    if (messageFadeStage !== "fading-in") {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingMessage(null);
      setMessageFadeStage("idle");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage]);

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

  const onCollect = async () => {
    if (!playerState) {
      return;
    }
    if (isCollectBlockedByRestraint) {
      setError("Restraint blocks collection until at least 1 hour of realtime has passed.");
      setStatus("Keep idling to satisfy Restraint.");
      return;
    }

    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");

    try {
      const nextPlayer = await collectIdleTime(token);
      const synced = toSyncedState(nextPlayer);
      alignClientClock();
      setPlayerState(synced);
      await refreshAccount(token);
      setStatus("Collected. You may now continue doing nothing.");
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setPlayerState(null);
        setAccount(null);
        setStatus("Press start when you are ready to do nothing.");
      } else if (collectError instanceof Error && collectError.message === "RESTRAINT_BLOCKED") {
        setError("Restraint blocks collection until at least 1 hour of realtime has passed.");
        setStatus("Keep idling to satisfy Restraint.");
        return;
      }
      setError(collectError instanceof Error ? collectError.message : "Collect failed");
      setStatus("Your inactivity transfer was interrupted.");
    } finally {
      setCollecting(false);
    }
  };

  const onPurchaseUpgrade = async () => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity("seconds_multiplier");
    setError(null);
    setStatus("Purchasing seconds multiplier...");
    try {
      const updatedPlayer = await purchaseSecondsMultiplier(token, 1);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus(`Seconds multiplier upgraded to ${synced.secondsMultiplier.toFixed(1)}x.`);
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough spendable idle seconds for that purchase.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseRestraint = async () => {
    if (!playerState || restraintLevel >= restraintMaxLevel) {
      return;
    }

    setShopPendingQuantity("restraint");
    setError(null);
    setStatus("Purchasing Restraint...");
    try {
      const updatedPlayer = await purchaseRestraint(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Restraint upgraded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough spendable idle seconds for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError("Restraint is already active.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseLuck = async () => {
    if (!playerState || luckLevel >= luckMaxLevel) {
      return;
    }

    setShopPendingQuantity("luck");
    setError(null);
    setStatus("Purchasing Luck...");
    try {
      const updatedPlayer = await purchaseLuck(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Luck upgraded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough spendable idle seconds for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError("Luck is already active.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseIdleHoarder = async () => {
    if (!playerState || idleHoarderLevel >= idleHoarderMaxLevel) {
      return;
    }

    setShopPendingQuantity("idle_hoarder");
    setError(null);
    setStatus("Purchasing Idle hoarder...");
    try {
      const updatedPlayer = await purchaseIdleHoarder(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Idle hoarder upgraded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough spendable real time for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError("Idle hoarder is already maxed.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseWorthwhileAchievements = async () => {
    if (!playerState || worthwhileAchievementsLevel >= worthwhileAchievementsMaxLevel) {
      return;
    }

    setShopPendingQuantity("worthwhile_achievements");
    setError(null);
    setStatus("Purchasing Worthwhile Achievements...");
    try {
      const updatedPlayer = await purchaseWorthwhileAchievements(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Worthwhile Achievements upgraded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough spendable idle seconds for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError("Worthwhile Achievements is already maxed.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseExtraRealtimeWait = async () => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity("extra_realtime_wait");
    setError(null);
    setStatus("Applying extra realtime wait...");
    try {
      const updatedPlayer = await purchaseExtraRealtimeWait(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Extra realtime wait applied.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough time gems for that purchase.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseCollectGemTimeBoost = async () => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity("collect_gem_time_boost");
    setError(null);
    setStatus("Upgrading hasty collection...");
    try {
      const updatedPlayer = await purchaseCollectGemTimeBoost(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Hasty collection upgraded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough time gems for that purchase.");
      } else if (purchaseError instanceof Error && purchaseError.message === "ALREADY_OWNED") {
        setError("Hasty collection is already maxed.");
      } else {
        setError(purchaseError instanceof Error ? purchaseError.message : "Purchase failed");
      }
      setStatus("Could not complete shop purchase.");
    } finally {
      setShopPendingQuantity(null);
    }
  };

  const onPurchaseRefund = async () => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity("purchase_refund");
    setError(null);
    setStatus("Refunding purchases...");
    try {
      const updatedPlayer = await purchaseRefund(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Shop purchases refunded.");
    } catch (purchaseError) {
      if (purchaseError instanceof Error && purchaseError.message === "INSUFFICIENT_FUNDS") {
        setError("Not enough time gems for that purchase.");
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

    setShopPendingQuantity("debug_add_gems");
    setError(null);
    setStatus("Adding debug gems...");
    try {
      const updatedPlayer = await debugAddGems(token);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus("Added 5 debug gems.");
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "Failed to add debug gems");
      setStatus("Could not add debug gems.");
    } finally {
      setShopPendingQuantity(null);
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
      } else {
        setError(tournamentError instanceof Error ? tournamentError.message : "Failed to enter tournament");
      }
    } finally {
      setEnteringTournament(false);
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
      await refreshPlayer(auth.token);
      await refreshAccount(auth.token);
        await refreshTournament(auth.token);
      setStatus("You are doing nothing. Excellent.");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start idling");
      setStatus("Unable to begin idling right now.");
    } finally {
      setStarting(false);
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
      await refreshPlayer(null);
      await refreshAccount(null);
      await refreshTournament(null);
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
      await refreshPlayer(null);
      await refreshAccount(null);
      await refreshTournament(null);
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
      await refreshPlayer(null);
      await refreshAccount(null);
        await refreshTournament(null);
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
    setUsernameError(null);
    setUsernameSuccess(null);
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
    setUsernameError(null);
    setUsernameSuccess(null);

    try {
      await updateUsername(token, nextUsername);
      await refreshAccount(token);
      setUsernameSuccess("Username updated successfully.");
      setStatus("Username updated.");
    } catch (usernameUpdateError) {
      if (usernameUpdateError instanceof Error && usernameUpdateError.message === "USERNAME_TAKEN") {
        setUsernameError("That username is already taken.");
      } else {
        setUsernameError(usernameUpdateError instanceof Error ? usernameUpdateError.message : "Could not update username.");
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

  if (loading) {
    return (
      <main className="app">
        <p>Preparing your idle session...</p>
        <section className="card message-card" aria-live="polite">
          <p className="label">Idle bulletin</p>
          <p className={`message-copy message-fade${isFadingOutMessage ? " is-fading-out" : ""}${isFadingInMessage ? " is-fading-in" : ""}`}>
            {displayedMessage}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="page-nav">
        <button type="button" className="link" onClick={() => navigate("/")}>
          <GameIcon icon={Hourglass} />
        </button>
        <div className="actions">
          {isAuthenticated ? (
            <>
              <button type="button" className="link" onClick={() => navigate("/leaderboard")}>
                <GameIcon icon={Medal} />
              </button>
              <button type="button" className="link" onClick={() => navigate("/shop")}>
                <GameIcon icon={ShoppingCart} />
              </button>
              <button type="button" className="link" onClick={() => navigate("/achievements")}>
                <span className="nav-icon-with-dot">
                  <GameIcon icon={Star} />
                  {playerState?.hasUnseenAchievements ? (
                    <span className="nav-icon-dot" aria-label="New achievement unlocked" role="status" />
                  ) : null}
                </span>
              </button>
              <button type="button" className="link" onClick={() => navigate("/account")}>
                <GameIcon icon={CircleUserRound} />
              </button>
            </>
          ) : null}
          <button type="button" className="link" onClick={() => navigate("/help")}>
            <GameIcon icon={CircleHelp} />
          </button>
        </div>
      </header>

      <section className="card">
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
                dailyRewardAvailable={dailyRewardAvailable}
                dailyRewardSecondsUntilAvailable={dailyRewardSecondsUntilAvailable}
                tournamentHasEntered={tournamentHasEntered}
                tournamentSecondsUntilDraw={tournamentSecondsUntilDraw}
                enteringTournament={enteringTournament}
                onStartIdling={onStartIdling}
                onCollect={onCollect}
                onCollectDailyReward={onCollectDailyReward}
                onEnterTournament={onEnterTournament}
                onNavigateTournament={() => navigate("/tournament")}
                onNavigateLogin={() => navigate("/login")}
              />
            }
          />
          <Route
            path="/help"
            element={<HelpPage />}
          />
          <Route
            path="/tournament"
            element={
              <TournamentPage
                tournamentState={tournamentState}
                tournamentSecondsUntilDraw={tournamentSecondsUntilDraw}
                enteringTournament={enteringTournament}
                onEnterTournament={onEnterTournament}
              />
            }
          />
          <Route
            path="/shop"
            element={
              <ShopPage
                playerState={playerState}
                shopPendingQuantity={shopPendingQuantity}
                secondsMultiplierCost={secondsMultiplierCost}
                onPurchaseUpgrade={onPurchaseUpgrade}
                restraintLevel={restraintLevel}
                restraintMaxLevel={restraintMaxLevel}
                onPurchaseRestraint={onPurchaseRestraint}
                luckLevel={luckLevel}
                luckMaxLevel={luckMaxLevel}
                onPurchaseLuck={onPurchaseLuck}
                idleHoarderLevel={idleHoarderLevel}
                idleHoarderMaxLevel={idleHoarderMaxLevel}
                onPurchaseIdleHoarder={onPurchaseIdleHoarder}
                worthwhileAchievementsLevel={worthwhileAchievementsLevel}
                worthwhileAchievementsMaxLevel={worthwhileAchievementsMaxLevel}
                onPurchaseWorthwhileAchievements={onPurchaseWorthwhileAchievements}
                onPurchaseExtraRealtimeWait={onPurchaseExtraRealtimeWait}
                onPurchaseCollectGemTimeBoost={onPurchaseCollectGemTimeBoost}
                onPurchaseRefund={onPurchaseRefund}
                showDebugAddGemsButton={import.meta.env.DEV}
                onDebugAddGems={onDebugAddGems}
                collectGemBoostLevel={playerState ? getCollectGemBoostLevel(playerState.shop) : 0}
                onNavigateHome={() => navigate("/")}
              />
            }
          />
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
            element={
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
                usernameError={usernameError}
                usernameSuccess={usernameSuccess}
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
            }
          />
          <Route
            path="/leaderboard"
            element={
              <LeaderboardPage
                leaderboardType={leaderboardType}
                leaderboardLoading={leaderboardLoading}
                leaderboard={leaderboard}
                hasError={Boolean(error)}
                onTypeChange={setLeaderboardType}
              />
            }
          />
          <Route
            path="/achievements"
            element={
              <AchievementsPage
                achievements={achievements}
                achievementsLoading={achievementsLoading}
                hasError={Boolean(error)}
              />
            }
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
      </section>
      <section className="card message-card" aria-live="polite">
        <p className="label">Idle bulletin</p>
        <p className={`message-copy message-fade${isFadingOutMessage ? " is-fading-out" : ""}${isFadingInMessage ? " is-fading-in" : ""}`}>
          {displayedMessage}
        </p>
      </section>
    </main>
  );
}
