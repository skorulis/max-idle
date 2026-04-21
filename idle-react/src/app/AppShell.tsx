import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, House, Medal, ShoppingCart, Trophy } from "lucide-react";
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
import { ShopPage } from "../pages/ShopPage";
import {
  collectIdleTime,
  createAnonymousSession,
  getAccount,
  getAchievements,
  getLeaderboard,
  getPlayer,
  getPublicPlayerProfile,
  loginWithEmail,
  logoutSession,
  purchaseSecondsMultiplier,
  registerWithEmail,
  updateUsername,
  upgradeAnonymous
} from "./api";
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

function getCurrentPageTitle(pathname: string): string {
  if (pathname === "/") {
    return "Home";
  }
  if (pathname === "/login") {
    return "Login";
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
  const [authPending, setAuthPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [shopPendingQuantity, setShopPendingQuantity] = useState<1 | 5 | 10 | null>(null);
  const [tickMs, setTickMs] = useState(0);
  const [loginForm, setLoginForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [signupForm, setSignupForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [upgradeForm, setUpgradeForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const isAuthenticated = Boolean(playerState);

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
    const timer = window.setInterval(() => {
      setTickMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
    setPlayerState(toSyncedState(player));
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

  const uncollectedIdleSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }

    const estimatedServerNowMs = playerState.serverTimeMs + (tickMs - playerState.syncedAtClientMs);
    const elapsedSinceCurrentUpdate = Math.floor((estimatedServerNowMs - playerState.currentSecondsLastUpdatedMs) / 1000);
    const incremental = Math.floor(
      calculateIdleSecondsGain(Math.max(0, elapsedSinceCurrentUpdate)) *
        playerState.secondsMultiplier *
        playerState.achievementBonusMultiplier
    );
    return playerState.currentSeconds + incremental;
  }, [playerState, tickMs]);

  const realtimeElapsedSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }

    const estimatedServerNowMs = playerState.serverTimeMs + (tickMs - playerState.syncedAtClientMs);
    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return Math.max(0, elapsed);
  }, [playerState, tickMs]);

  const idleSecondsRate = useMemo(() => {
    if (!playerState) {
      return 1;
    }
    const estimatedServerNowMs = playerState.serverTimeMs + (tickMs - playerState.syncedAtClientMs);
    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return getIdleSecondsRate({ secondsSinceLastCollection: Math.max(0, elapsed) });
  }, [playerState, tickMs]);

  const effectiveIdleSecondsRate = useMemo(() => {
    if (!playerState) {
      return 1;
    }
    return idleSecondsRate * playerState.secondsMultiplier * playerState.achievementBonusMultiplier;
  }, [idleSecondsRate, playerState]);

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

  const onCollect = async () => {
    if (!playerState) {
      return;
    }

    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");

    try {
      const nextPlayer = await collectIdleTime(token);
      setPlayerState(toSyncedState(nextPlayer));
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
      setPlayerState(toSyncedState(updatedPlayer));
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
    if (!account || account.isAnonymous) {
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
      <button type="button" className="secondary" disabled>
        Continue with Google (coming soon)
      </button>
      <button type="button" className="secondary" disabled>
        Continue with Apple (coming soon)
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="app">
        <p>Preparing your idle session...</p>
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
              <GameIcon icon={Trophy} />
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
                onStartIdling={onStartIdling}
                onCollect={onCollect}
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
                signupForm={signupForm}
                onLoginFormChange={(field, value) => setLoginForm((prev) => ({ ...prev, [field]: value }))}
                onSignupFormChange={(field, value) => setSignupForm((prev) => ({ ...prev, [field]: value }))}
                onLogin={onLogin}
                onRegister={onRegister}
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
    </main>
  );
}
