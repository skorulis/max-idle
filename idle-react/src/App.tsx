import { useEffect, useMemo, useState } from "react";

const TOKEN_KEY = "max-idle-token";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type AuthResponse = {
  userId: string;
  token: string;
};

type PlayerResponse = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  lastCollectedAt: string;
  serverTime: string;
};

type AccountResponse = {
  isAnonymous: boolean;
  email: string | null;
  name: string | null;
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
  lastCollectedAtMs: number;
  serverTimeMs: number;
  syncedAtClientMs: number;
};

type RoutePath = "/" | "/login" | "/account";

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

async function collectIdleTime(token: string | null): Promise<void> {
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

async function loginWithEmail(email: string, password: string): Promise<void> {
  await apiRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function registerWithEmail(name: string, email: string, password: string): Promise<void> {
  await apiRequest("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
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

async function logoutSession(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}

function toSyncedState(data: PlayerResponse): SyncedPlayerState {
  return {
    totalIdleSeconds: data.totalIdleSeconds,
    collectedIdleSeconds: data.collectedIdleSeconds,
    lastCollectedAtMs: Date.parse(data.lastCollectedAt),
    serverTimeMs: Date.parse(data.serverTime),
    syncedAtClientMs: Date.now()
  };
}

function readRoute(): RoutePath {
  if (window.location.pathname === "/login") {
    return "/login";
  }
  if (window.location.pathname === "/account") {
    return "/account";
  }
  return "/";
}

function App() {
  const [route, setRoute] = useState<RoutePath>(() => readRoute());
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [status, setStatus] = useState("Press start when you are ready to do nothing.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [authPending, setAuthPending] = useState(false);
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
    const onPopState = () => {
      setRoute(readRoute());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: RoutePath) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(path);
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
    const elapsed = Math.floor((estimatedServerNowMs - playerState.lastCollectedAtMs) / 1000);
    return Math.max(0, elapsed);
  }, [playerState, tickMs]);

  const onCollect = async () => {
    if (!playerState) {
      return;
    }

    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");

    try {
      await collectIdleTime(token);
      await refreshPlayer(token);
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
      await registerWithEmail(signupForm.name, signupForm.email, signupForm.password);
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
      setStatus("Press start when you are ready to do nothing.");
      setAuthPending(false);
      navigate("/");
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

  return (
    <main className="app">
      <section className="card">
        <div className="topbar">
          <p className="brand">Max Idle</p>
          <div className="actions">
            <button type="button" className="link" onClick={() => navigate("/")}>
              Home
            </button>
            <button type="button" className="link" onClick={() => navigate("/account")}>
              Account
            </button>
            {account?.isAnonymous === false || playerState ? (
              <button type="button" className="link" onClick={onLogout} disabled={authPending}>
                Logout
              </button>
            ) : null}
          </div>
        </div>

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
            <p className="counter">{uncollectedIdleSeconds.toLocaleString()}s</p>

            <div className="stats">
              <p>
                <span>Total collected:</span> {playerState?.totalIdleSeconds.toLocaleString() ?? 0}s
              </p>
              <p>
                <span>Spendable:</span> {playerState?.collectedIdleSeconds.toLocaleString() ?? 0}s
              </p>
            </div>

            <button className="collect" onClick={onCollect} disabled={collecting}>
              {collecting ? "Collecting..." : "Collect"}
            </button>
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
                type="text"
                placeholder="Name"
                value={signupForm.name}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, name: event.target.value }))}
              />
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
                <p>
                  <span>Name:</span> {account.name ?? "Not set"}
                </p>
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

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

export default App;
