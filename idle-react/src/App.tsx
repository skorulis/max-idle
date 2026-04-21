import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, House, Medal } from "lucide-react";
import GameIcon from "./GameIcon";
import { calculateIdleSecondsGain, getIdleSecondsRate } from "./idleRate";
import { formatSeconds } from "./formatSeconds";
import { getSecondsMultiplierPurchaseCost, multiplierToLevel } from "./shop";

const TOKEN_KEY = "max-idle-token";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type AuthResponse = {
  userId: string;
  token: string;
};

type PlayerResponse = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  currentSeconds: number;
  idleSecondsRate: number;
  secondsMultiplier: number;
  currentSecondsLastUpdated: string;
  lastCollectedAt: string;
  serverTime: string;
};

type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
};

type LeaderboardType = "current" | "collected" | "total";

type LeaderboardResponse = {
  type: LeaderboardType;
  entries: LeaderboardEntry[];
  currentPlayer: {
    userId: string;
    rank: number;
    totalIdleSeconds: number;
    inTop: boolean;
  };
};

type AccountResponse = {
  isAnonymous: boolean;
  email: string | null;
  username: string | null;
  gameUserId: string | null;
  canUpgrade?: boolean;
  socialProviders: {
    googleEnabled: boolean;
    appleEnabled: boolean;
  };
};

type SyncedPlayerState = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  currentSeconds: number;
  currentSecondsLastUpdatedMs: number;
  secondsMultiplier: number;
  lastCollectedAtMs: number;
  serverTimeMs: number;
  syncedAtClientMs: number;
};

type RoutePath = "/" | "/login" | "/account" | "/leaderboard" | "/player";
type NavigationRoutePath = "/" | "/login" | "/account" | "/leaderboard";

type PlayerProfileResponse = {
  player: {
    id: string;
    username: string;
    accountAgeSeconds: number;
    currentIdleSeconds: number;
    collectedIdleSeconds: number;
  };
  meta: {
    serverTime: string;
  };
};

type AuthFormState = {
  email: string;
  password: string;
  name: string;
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

async function createAnonymousSession(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/anonymous", { method: "POST" });
}

async function getPlayer(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player`, {
    credentials: "include",
    headers: {
      ...headers
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to fetch player state");
  }

  return (await response.json()) as PlayerResponse;
}

async function collectIdleTime(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/collect`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...headers
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to collect idle time");
  }
  return (await response.json()) as PlayerResponse;
}

async function getAccount(token: string | null): Promise<AccountResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/account`, {
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to load account");
  }
  return (await response.json()) as AccountResponse;
}

async function getLeaderboard(token: string | null, type: LeaderboardType): Promise<LeaderboardResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/leaderboard?type=${encodeURIComponent(type)}`, {
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to load leaderboard");
  }
  return (await response.json()) as LeaderboardResponse;
}

async function getPublicPlayerProfile(playerId: string): Promise<PlayerProfileResponse> {
  const response = await fetch(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}`, {
    credentials: "include"
  });

  if (response.status === 404) {
    throw new Error("PLAYER_NOT_FOUND");
  }
  if (!response.ok) {
    throw new Error("Failed to load player profile");
  }
  return (await response.json()) as PlayerProfileResponse;
}

async function loginWithEmail(email: string, password: string): Promise<void> {
  await apiRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function registerWithEmail(email: string, password: string): Promise<void> {
  await apiRequest("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function upgradeAnonymous(token: string, name: string, email: string, password: string): Promise<void> {
  await apiRequest("/account/upgrade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, email, password })
  });
}

async function updateUsername(token: string | null, username: string): Promise<{ username: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/account/username`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ username })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    if (response.status === 409 && payload?.code === "USERNAME_TAKEN") {
      throw new Error("USERNAME_TAKEN");
    }
    throw new Error(payload?.error ?? "Failed to update username");
  }

  return (payload ?? { username }) as { username: string };
}

async function purchaseSecondsMultiplier(token: string | null, quantity: 1 | 5 | 10): Promise<PlayerResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/shop/purchase`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      upgradeType: "seconds_multiplier",
      quantity
    })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    if (response.status === 400 && payload?.code === "INSUFFICIENT_FUNDS") {
      throw new Error("INSUFFICIENT_FUNDS");
    }
    throw new Error(payload?.error ?? "Failed to purchase upgrade");
  }

  return payload as PlayerResponse;
}

async function logoutSession(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}

function toSyncedState(data: PlayerResponse): SyncedPlayerState {
  return {
    totalIdleSeconds: data.totalIdleSeconds,
    collectedIdleSeconds: data.collectedIdleSeconds,
    currentSeconds: data.currentSeconds,
    currentSecondsLastUpdatedMs: Date.parse(data.currentSecondsLastUpdated),
    secondsMultiplier: data.secondsMultiplier,
    lastCollectedAtMs: Date.parse(data.lastCollectedAt),
    serverTimeMs: Date.parse(data.serverTime),
    syncedAtClientMs: Date.now()
  };
}

function readRoute(): { path: RoutePath; playerId: string | null } {
  const pathname = window.location.pathname;
  const playerMatch = pathname.match(/^\/player\/([^/]+)$/);
  if (playerMatch?.[1]) {
    let playerId = playerMatch[1];
    try {
      playerId = decodeURIComponent(playerMatch[1]);
    } catch {
      // Keep original segment if decode fails.
    }
    return {
      path: "/player",
      playerId
    };
  }
  if (pathname === "/login") {
    return { path: "/login", playerId: null };
  }
  if (pathname === "/account") {
    return { path: "/account", playerId: null };
  }
  if (pathname === "/leaderboard") {
    return { path: "/leaderboard", playerId: null };
  }
  return { path: "/", playerId: null };
}

function App() {
  const initialRoute = readRoute();
  const [route, setRoute] = useState<RoutePath>(initialRoute.path);
  const [routePlayerId, setRoutePlayerId] = useState<string | null>(initialRoute.playerId);
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
  const [publicPlayerProfile, setPublicPlayerProfile] = useState<PlayerProfileResponse["player"] | null>(null);
  const [publicPlayerLoading, setPublicPlayerLoading] = useState(false);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("current");
  const [status, setStatus] = useState("Press start when you are ready to do nothing.");
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
  const [tickMs, setTickMs] = useState(Date.now());
  const [loginForm, setLoginForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [signupForm, setSignupForm] = useState<AuthFormState>({ email: "", password: "", name: "" });
  const [upgradeForm, setUpgradeForm] = useState<AuthFormState>({ email: "", password: "", name: "" });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setUsernameDraft(account?.username ?? "");
    setUsernameError(null);
    setUsernameSuccess(null);
  }, [account?.username, account?.isAnonymous]);

  useEffect(() => {
    if (route !== "/leaderboard") {
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
  }, [route, token, account?.gameUserId, leaderboardType]);

  useEffect(() => {
    if (route !== "/player" || !routePlayerId) {
      setPublicPlayerLoading(false);
      setPublicPlayerProfile(null);
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
  }, [route, routePlayerId]);

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = readRoute();
      setRoute(nextRoute.path);
      setRoutePlayerId(nextRoute.playerId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: NavigationRoutePath) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(path);
    setRoutePlayerId(null);
  };

  const navigateToPlayer = (playerId: string) => {
    const playerPath = `/player/${encodeURIComponent(playerId)}`;
    if (window.location.pathname !== playerPath) {
      window.history.pushState({}, "", playerPath);
    }
    setRoute("/player");
    setRoutePlayerId(playerId);
  };

  const refreshAccount = async (currentToken: string | null) => {
    try {
      const accountResponse = await getAccount(currentToken);
      setAccount(accountResponse);
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message === "UNAUTHORIZED") {
        setAccount(null);
        return;
      }
      throw accountError;
    }
  };

  const refreshPlayer = async (currentToken: string | null) => {
    const player = await getPlayer(currentToken);
    setPlayerState(toSyncedState(player));
  };

  const bootstrapFromStorage = async () => {
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
          // fall through to empty state
        }
      }
    }

    setPlayerState(null);
    setAccount(null);
    setStatus("Press start when you are ready to do nothing.");
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        await bootstrapFromStorage();
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
    const incremental = Math.floor(calculateIdleSecondsGain(Math.max(0, elapsedSinceCurrentUpdate)) * playerState.secondsMultiplier);
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
    return idleSecondsRate * playerState.secondsMultiplier;
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

  const showGame = route === "/";
  const showLogin = route === "/login";
  const showAccount = route === "/account";
  const showLeaderboard = route === "/leaderboard";
  const showPlayer = route === "/player";
  const currentPageTitle = showGame ? "Home" : showLogin ? "Login" : showAccount ? "Account" : showPlayer ? "Player" : "Leaderboard";

  return (
    <main className="app">
      <header className="page-nav">
        <p className="page-title">{currentPageTitle}</p>
        <div className="actions">
          <button type="button" className="link" onClick={() => navigate("/")}>
            <GameIcon icon={House} />
          </button>
          <button type="button" className="link" onClick={() => navigate("/leaderboard")}>
            <GameIcon icon={Medal} />
          </button>
          <button type="button" className="link" onClick={() => navigate("/account")}>
            <GameIcon icon={CircleUserRound} />
          </button>
          
        </div>
      </header>
      <section className="card">
        <h1>Max Idle</h1>
        <p className="status">{status}</p>

        {showGame ? (
          !playerState ? (
            <>
              <button className="collect" onClick={onStartIdling} disabled={starting}>
                {starting ? "Starting..." : "Start idling"}
              </button>
              <button type="button" className="secondary" onClick={() => navigate("/login")}>
                Login
              </button>
            </>
          ) : (
            <>
            <p className="label">Current idle time</p>
            <p className="counter">{formatSeconds(uncollectedIdleSeconds)}</p>
            <p className="subtle">Realtime: {formatSeconds(realtimeElapsedSeconds)}</p>
            <p className="subtle">Current rate: {effectiveIdleSecondsRate.toFixed(2)}x</p>

            <div className="stats">
              <p>
                <span>Total collected:</span> {formatSeconds(playerState?.totalIdleSeconds ?? 0)}
              </p>
            </div>

            <button className="collect" onClick={onCollect} disabled={collecting}>
              {collecting ? "Collecting..." : "Collect"}
            </button>
            <div className="panel">
              <h2>Shop</h2>
              <p>
                <span>Spendable:</span> {formatSeconds(playerState?.collectedIdleSeconds ?? 0)}
              </p>
              <p className="subtle">Upgrade: seconds multiplier (+0.1x per purchase)</p>
              <p className="subtle">Current multiplier: {playerState.secondsMultiplier.toFixed(1)}x</p>
              <div className="shop-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onPurchaseUpgrade(1)}
                  disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[1]}
                >
                  {shopPendingQuantity === 1 ? "Purchasing..." : `Buy x1 (${formatSeconds(shopCosts[1])})`}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onPurchaseUpgrade(5)}
                  disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[5]}
                >
                  {shopPendingQuantity === 5 ? "Purchasing..." : `Buy x5 (${formatSeconds(shopCosts[5])})`}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onPurchaseUpgrade(10)}
                  disabled={shopPendingQuantity !== null || playerState.collectedIdleSeconds < shopCosts[10]}
                >
                  {shopPendingQuantity === 10 ? "Purchasing..." : `Buy x10 (${formatSeconds(shopCosts[10])})`}
                </button>
              </div>
            </div>
          </>
          )
        ) : null}

        {showLogin ? (
          <div className="auth-grid">
            <div className="panel">
              <h2>Login</h2>
              <input
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <button className="collect" onClick={onLogin} disabled={authPending}>
                {authPending ? "Loading..." : "Login"}
              </button>
              {renderAuthButtons()}
            </div>

            <div className="panel">
              <h2>Create account</h2>
              <input
                type="email"
                placeholder="Email"
                value={signupForm.email}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                type="password"
                placeholder="Password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <button className="collect" onClick={onRegister} disabled={authPending}>
                {authPending ? "Loading..." : "Create account"}
              </button>
            </div>
          </div>
        ) : null}

        {showAccount ? (
          <div className="panel">
            <h2>Account</h2>
            {account ? (
              <>
                <p>
                  <span>Status:</span> {account.isAnonymous ? "Anonymous" : "Registered"}
                </p>
                <p>
                  <span>Email:</span> {account.email ?? "Not set"}
                </p>
                <h3>Username</h3>
                <input
                  type="text"
                  placeholder="Username"
                  value={usernameDraft}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  disabled={account.isAnonymous || usernamePending}
                />
                {account.isAnonymous ? (
                  <p className="subtle">Anonymous users cannot change username.</p>
                ) : (
                  <button
                    className="collect"
                    onClick={onSaveUsername}
                    disabled={
                      usernamePending || authPending || usernameDraft.trim().length === 0 || usernameDraft.trim() === account.username
                    }
                  >
                    {usernamePending ? "Saving..." : "Save username"}
                  </button>
                )}
                {usernameError ? <p className="error">{usernameError}</p> : null}
                {usernameSuccess ? <p className="success">{usernameSuccess}</p> : null}
                {account.isAnonymous ? (
                  <>
                    <h3>Upgrade to registered account</h3>
                    <input
                      type="text"
                      placeholder="Name"
                      value={upgradeForm.name}
                      onChange={(event) => setUpgradeForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={upgradeForm.email}
                      onChange={(event) => setUpgradeForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={upgradeForm.password}
                      onChange={(event) => setUpgradeForm((prev) => ({ ...prev, password: event.target.value }))}
                    />
                    <button className="collect" onClick={onUpgrade} disabled={authPending || !token}>
                      {authPending ? "Upgrading..." : "Create account"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="subtle">Google configured: {account.socialProviders.googleEnabled ? "Yes" : "No"}</p>
                    <p className="subtle">Apple configured: {account.socialProviders.appleEnabled ? "Yes" : "No"}</p>
                    {renderAuthButtons()}
                  </>
                )}
                <button type="button" className="secondary" onClick={onLogout} disabled={authPending}>
                  {authPending ? "Logging out..." : "Logout"}
                </button>
              </>
            ) : (
              <>
                <p>No active account session.</p>
                <button className="secondary" onClick={() => navigate("/login")}>
                  Go to login
                </button>
              </>
            )}
          </div>
        ) : null}

        {showLeaderboard ? (
          <div className="panel">
            <h2>Leaderboard</h2>
            <div className="leaderboard-type-toggle">
              <button
                type="button"
                className={`secondary${leaderboardType === "current" ? " leaderboard-type-active" : ""}`}
                onClick={() => setLeaderboardType("current")}
                disabled={leaderboardLoading}
              >
                Current idle
              </button>
              <button
                type="button"
                className={`secondary${leaderboardType === "collected" ? " leaderboard-type-active" : ""}`}
                onClick={() => setLeaderboardType("collected")}
                disabled={leaderboardLoading}
              >
                Collected
              </button>
              <button
                type="button"
                className={`secondary${leaderboardType === "total" ? " leaderboard-type-active" : ""}`}
                onClick={() => setLeaderboardType("total")}
                disabled={leaderboardLoading}
              >
                Total
              </button>
            </div>
            {leaderboardLoading ? <p>Loading leaderboard...</p> : null}
            {!leaderboardLoading && leaderboard ? (
              <>
                <div className="leaderboard-list">
                  {leaderboard.entries.map((entry) => (
                    <div
                      key={entry.userId}
                      className={`leaderboard-row${entry.isCurrentPlayer ? " leaderboard-row-current" : ""}`}
                    >
                      <p>#{entry.rank}</p>
                      <p>
                        <a
                          href={`/player/${encodeURIComponent(entry.userId)}`}
                          className="leaderboard-player-link"
                          onClick={(event) => {
                            event.preventDefault();
                            navigateToPlayer(entry.userId);
                          }}
                        >
                          {entry.username}
                        </a>
                      </p>
                      <p>{formatSeconds(entry.totalIdleSeconds)}</p>
                    </div>
                  ))}
                </div>
                {!leaderboard.currentPlayer.inTop ? (
                  <p className="subtle">
                    Your rank is #{leaderboard.currentPlayer.rank} with{" "}
                    {formatSeconds(leaderboard.currentPlayer.totalIdleSeconds)}.
                  </p>
                ) : null}
              </>
            ) : null}
            {!leaderboardLoading && !leaderboard && !error ? <p>No leaderboard data available.</p> : null}
          </div>
        ) : null}

        {showPlayer ? (
          <div className="panel">
            <h2>{publicPlayerProfile.username}</h2>
            {publicPlayerLoading ? <p>Loading player profile...</p> : null}
            {!publicPlayerLoading && publicPlayerProfile ? (
              <>
                <p>
                  <span>Account age:</span> {formatSeconds(publicPlayerProfile.accountAgeSeconds)}
                </p>
                <p>
                  <span>Current idle time:</span> {formatSeconds(publicPlayerProfile.currentIdleSeconds)}
                </p>
                <p>
                  <span>Collected idle time:</span> {formatSeconds(publicPlayerProfile.collectedIdleSeconds)}
                </p>
              </>
            ) : null}
            {!publicPlayerLoading && !publicPlayerProfile && !error ? <p>Player not found.</p> : null}
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

export default App;
