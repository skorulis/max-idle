import type {
  AccountResponse,
  AchievementsResponse,
  AuthResponse,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  PlayerResponse
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

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

export async function createAnonymousSession(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/anonymous", { method: "POST" });
}

export async function getPlayer(token: string | null): Promise<PlayerResponse> {
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

export async function collectIdleTime(token: string | null): Promise<PlayerResponse> {
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

export async function collectDailyReward(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/daily-reward/collect`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...headers
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 400) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "DAILY_REWARD_NOT_AVAILABLE") {
      throw new Error("DAILY_REWARD_NOT_AVAILABLE");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to collect daily reward");
  }
  return (await response.json()) as PlayerResponse;
}

export async function getAccount(token: string | null): Promise<AccountResponse> {
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

export async function getLeaderboard(token: string | null, type: LeaderboardType): Promise<LeaderboardResponse> {
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

export async function getAchievements(token: string | null): Promise<AchievementsResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/achievements`, {
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to load achievements");
  }
  return (await response.json()) as AchievementsResponse;
}

export async function markAchievementsSeen(token: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/achievements/seen`, {
    method: "POST",
    credentials: "include",
    headers
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to mark achievements as seen");
  }
}

export async function getPublicPlayerProfile(playerId: string): Promise<PlayerProfileResponse> {
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

export async function loginWithEmail(email: string, password: string): Promise<void> {
  await apiRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

export async function registerWithEmail(email: string, password: string): Promise<void> {
  await apiRequest("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

export async function upgradeAnonymous(token: string, name: string, email: string, password: string): Promise<void> {
  await apiRequest("/account/upgrade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, email, password })
  });
}

export async function updateUsername(token: string | null, username: string): Promise<{ username: string }> {
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

export async function purchaseSecondsMultiplier(token: string | null, quantity: 1 | 5 | 10): Promise<PlayerResponse> {
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

export async function logoutSession(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}
