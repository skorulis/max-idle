import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, House, Medal, ShoppingCart, Star } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";
import GameIcon from "../GameIcon";
import { calculateIdleSecondsGain, getIdleSecondsRate } from "../idleRate";
import { getSecondsMultiplierPurchaseCost, multiplierToLevel } from "../shop";
import { AccountPage } from "../pages/AccountPage";
import { AchievementsPage } from "../pages/AchievementsPage";
import { HomePage } from "../pages/HomePage";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { LoginPage } from "../pages/LoginPage";
import { PlayerPage } from "../pages/PlayerPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ShopPage } from "../pages/ShopPage";
import {
  collectDailyReward,
  collectIdleTime,
  createAnonymousSession,
  getAccount,
  getAchievements,
  getLeaderboard,
  getPlayer,
  getPublicPlayerProfile,
  loginWithEmail,
  markAchievementsSeen,
  logoutSession,
  purchaseSecondsMultiplier,
  registerWithEmail,
  updateUsername,
  upgradeAnonymous
} from "./api";
import { authClient } from "./authClient.ts";
import { alignClientClock, useClientNowMs } from "./clientClock";
import { toSyncedState } from "./playerState";
import type {
  AccountResponse,
  AchievementsResponse,
  AuthFormState,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  SyncedPlayerState
} from "./types";

const TOKEN_KEY = "max-idle-token";
const FALLBACK_MESSAGE = "The message board is taking a snack break.";
const WELCOME_MESSAGE = "Welcome to the worlds easiest game.";
const HUMOROUS_MESSAGES = [
  "Your productivity has entered low-power mode.",
  "Another second has passed without incident",
  "Your idle engine is purring like a very relaxed cat.",
  "If you stare at the counter it will stare back.",
  "Make sure to keep hydrated. Time will continue to pass while you are away.",
  "Doing nothing remains unexpectedly effective.",
  "Competitive idling isn't for the faint of heart.",
  "What will you do with all of that time?",
  "Your goal is simple.  Be idle for longer than anyone else.",
  "To catch up, try doing nothing faster.",
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

function getCurrentPageTitle(pathname: string): string {
  if (pathname === "/") {
    return "Home";
  }
  if (pathname === "/login") {
    return "Login";
  }
  if (pathname === "/register") {
    return "Create account";
  }
  if (pathname === "/account") {
    return "Account";
  }
  if (pathname === "/leaderboard") {
    return "Leaderboard";
  }
  if (pathname === "/achievements") {
    return "Achievements";
  }
  if (pathname === "/shop") {
    return "Shop";
  }
  if (pathname.startsWith("/player/")) {
    return "Player";
  }
  return "Home";
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const playerRouteMatch = useMatch("/player/:playerId");
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
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
  const [authPending, setAuthPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [shopPendingQuantity, setShopPendingQuantity] = useState<1 | 5 | 10 | null>(null);
  const [messageCardRandomIndex, setMessageCardRandomIndex] = useState(() => getRandomMessageIndex());
  const [displayedMessage, setDisplayedMessage] = useState(WELCOME_MESSAGE);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [messageFadeStage, setMessageFadeStage] = useState<"idle" | "fading-out" | "fading-in">("idle");
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
              setStatus("You are doing nothing. Excellent.");
              return;
            } catch {
              // Fall through to empty state.
            }
          }
        }

        setPlayerState(null);
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
  }, []);

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
    return Math.floor(
      calculateIdleSecondsGain(Math.max(0, elapsedSinceLastCollection)) *
        playerState.secondsMultiplier *
        playerState.achievementBonusMultiplier
    );
  }, [estimatedServerNowMs, playerState]);

  const realtimeElapsedSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }

    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return Math.max(0, elapsed);
  }, [estimatedServerNowMs, playerState]);

  const idleSecondsRate = useMemo(() => {
    if (!playerState) {
      return 1;
    }
    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return getIdleSecondsRate({ secondsSinceLastCollection: Math.max(0, elapsed) });
  }, [estimatedServerNowMs, playerState]);

  const effectiveIdleSecondsRate = useMemo(() => {
    if (!playerState) {
      return 1;
    }
    return idleSecondsRate * playerState.secondsMultiplier * playerState.achievementBonusMultiplier;
  }, [idleSecondsRate, playerState]);

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

  const secondsMultiplierLevel = useMemo(() => {
    return playerState ? multiplierToLevel(playerState.secondsMultiplier) : 0;
  }, [playerState]);

  const shopCosts = useMemo(() => {
    return {
      1: getSecondsMultiplierPurchaseCost(secondsMultiplierLevel, 1),
      5: getSecondsMultiplierPurchaseCost(secondsMultiplierLevel, 5),
      10: getSecondsMultiplierPurchaseCost(secondsMultiplierLevel, 10)
    };
  }, [secondsMultiplierLevel]);

  const activeMessageCardText = isAuthenticated
    ? getMessageFromIndex(messageCardRandomIndex)
    : WELCOME_MESSAGE;
  const isFadingOutMessage = messageFadeStage === "fading-out";
  const isFadingInMessage = messageFadeStage === "fading-in";

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

  const onCollect = async () => {
    if (!playerState) {
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
      }
      setError(collectError instanceof Error ? collectError.message : "Collect failed");
      setStatus("Your inactivity transfer was interrupted.");
    } finally {
      setCollecting(false);
    }
  };

  const onPurchaseUpgrade = async (quantity: 1 | 5 | 10) => {
    if (!playerState) {
      return;
    }

    setShopPendingQuantity(quantity);
    setError(null);
    setStatus(`Purchasing seconds multiplier x${quantity}...`);
    try {
      const updatedPlayer = await purchaseSecondsMultiplier(token, quantity);
      const synced = toSyncedState(updatedPlayer);
      alignClientClock();
      setPlayerState(synced);
      setStatus(`Seconds multiplier upgraded by ${quantity * 0.1}x.`);
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
        <p className="page-title">{getCurrentPageTitle(location.pathname)}</p>
        {isAuthenticated ? (
          <div className="actions">
            <button type="button" className="link" onClick={() => navigate("/")}>
              <GameIcon icon={House} />
            </button>
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
          </div>
        ) : null}
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
                uncollectedIdleSeconds={uncollectedIdleSeconds}
                realtimeElapsedSeconds={realtimeElapsedSeconds}
                effectiveIdleSecondsRate={effectiveIdleSecondsRate}
                collectingDailyReward={collectingDailyReward}
                dailyRewardAvailable={dailyRewardAvailable}
                dailyRewardSecondsUntilAvailable={dailyRewardSecondsUntilAvailable}
                onStartIdling={onStartIdling}
                onCollect={onCollect}
                onCollectDailyReward={onCollectDailyReward}
                onNavigateLogin={() => navigate("/login")}
              />
            }
          />
          <Route
            path="/shop"
            element={
              <ShopPage
                playerState={playerState}
                shopPendingQuantity={shopPendingQuantity}
                shopCosts={shopCosts}
                onPurchaseUpgrade={onPurchaseUpgrade}
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
                usernameDraft={usernameDraft}
                usernameError={usernameError}
                usernameSuccess={usernameSuccess}
                upgradeForm={upgradeForm}
                onUsernameChange={onUsernameChange}
                onSaveUsername={onSaveUsername}
                onUpgradeFormChange={(field, value) => setUpgradeForm((prev) => ({ ...prev, [field]: value }))}
                onUpgrade={onUpgrade}
                onLogout={onLogout}
                onNavigateLogin={() => navigate("/login")}
                renderAuthButtons={renderAuthButtons}
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
