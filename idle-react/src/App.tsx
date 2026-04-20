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

type SyncedPlayerState = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  lastCollectedAtMs: number;
  serverTimeMs: number;
  syncedAtClientMs: number;
};

async function createAnonymousSession(): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/anonymous`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to create anonymous session");
  }
  return (await response.json()) as AuthResponse;
}

async function getPlayer(token: string): Promise<PlayerResponse> {
  const response = await fetch(`${API_BASE_URL}/player`, {
    headers: {
      Authorization: `Bearer ${token}`
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

async function collectIdleTime(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/player/collect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to collect idle time");
  }
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

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<SyncedPlayerState | null>(null);
  const [status, setStatus] = useState("You are doing nothing. Excellent.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [tickMs, setTickMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        let localToken = localStorage.getItem(TOKEN_KEY);
        if (!localToken) {
          const auth = await createAnonymousSession();
          localToken = auth.token;
          localStorage.setItem(TOKEN_KEY, auth.token);
        }

        const player = await getPlayer(localToken);
        setToken(localToken);
        setPlayerState(toSyncedState(player));
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

  const liveIdleSeconds = useMemo(() => {
    if (!playerState) {
      return 0;
    }
    return playerState.totalIdleSeconds + uncollectedIdleSeconds;
  }, [playerState, uncollectedIdleSeconds]);

  const refreshPlayer = async (currentToken: string) => {
    const player = await getPlayer(currentToken);
    setPlayerState(toSyncedState(player));
  };

  const onCollect = async () => {
    if (!token) {
      return;
    }

    setCollecting(true);
    setError(null);
    setStatus("Collecting your hard-earned inactivity...");

    try {
      await collectIdleTime(token);
      await refreshPlayer(token);
      setStatus("Collected. You may now continue doing nothing.");
    } catch (collectError) {
      if (collectError instanceof Error && collectError.message === "UNAUTHORIZED") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
      setError(collectError instanceof Error ? collectError.message : "Collect failed");
      setStatus("Your inactivity transfer was interrupted.");
    } finally {
      setCollecting(false);
    }
  };

  if (loading) {
    return (
      <main className="app">
        <p>Preparing your idle session...</p>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="card">
        <h1>Max Idle</h1>
        <p className="status">{status}</p>

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

        <button className="collect" onClick={onCollect} disabled={!token || collecting}>
          {collecting ? "Collecting..." : "Collect"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

export default App;
