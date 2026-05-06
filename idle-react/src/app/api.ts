import type { ShopUpgradeId } from "@maxidle/shared/shopUpgrades";
import type {
  AccountResponse,
  AchievementsResponse,
  AuthResponse,
  CollectionHistoryItem,
  DailyBonusHistoryItem,
  HomeResponse,
  LeaderboardResponse,
  LeaderboardType,
  PlayerProfileResponse,
  PlayerResponse,
  Survey,
  TournamentCollectRewardResponse,
  TournamentCurrentResponse,
  TournamentEnterResponse,
  TournamentHistoryItem
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

async function getErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (payload?.message) {
    return payload.message;
  }
  if (payload?.error) {
    return payload.error;
  }
  return await response.text();
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
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

export async function getHome(token: string | null): Promise<HomeResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/home`, {
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return (await response.json()) as HomeResponse;
}

export async function getActiveSurvey(token: string | null): Promise<Survey | null> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/surveys/active`, {
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const payload = (await response.json()) as { survey?: Survey | null };
  return payload.survey ?? null;
}

export async function submitSurveyAnswer(
  token: string | null,
  surveyId: string,
  optionId: string
): Promise<PlayerResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/surveys/answer`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ surveyId, optionId })
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 409) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "SURVEY_ALREADY_ANSWERED") {
      throw new Error("SURVEY_ALREADY_ANSWERED");
    }
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return (await response.json()) as PlayerResponse;
}

export async function completeTutorialStep(token: string | null, tutorialId: string): Promise<PlayerResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/tutorial/complete`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ tutorialId })
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return (await response.json()) as PlayerResponse;
}

export async function resetTutorialProgress(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/tutorial/reset`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
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
  if (response.status === 400) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "RESTRAINT_BLOCKED") {
      throw new Error("RESTRAINT_BLOCKED");
    }
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

export async function collectObligation(token: string | null, obligationId: string): Promise<PlayerResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/obligations/collect`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ obligationId })
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return (await response.json()) as PlayerResponse;
}

export async function collectDailyBonus(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/daily-bonus/collect`, {
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
    if (payload?.code === "DAILY_BONUS_INSUFFICIENT_IDLE") {
      throw new Error("DAILY_BONUS_INSUFFICIENT_IDLE");
    }
    if (payload?.code === "DAILY_BONUS_ALREADY_CLAIMED") {
      throw new Error("DAILY_BONUS_ALREADY_CLAIMED");
    }
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "DAILY_BONUS_FEATURE_LOCKED") {
      throw new Error("DAILY_BONUS_FEATURE_LOCKED");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to collect daily bonus");
  }
  return (await response.json()) as PlayerResponse;
}

export async function getDailyBonusHistory(token: string | null): Promise<DailyBonusHistoryItem[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/player/daily-bonus/history`, {
    credentials: "include",
    headers
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "DAILY_BONUS_FEATURE_LOCKED") {
      throw new Error("DAILY_BONUS_FEATURE_LOCKED");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to load daily bonus history");
  }
  const payload = (await response.json()) as { history?: DailyBonusHistoryItem[] } | null;
  return payload?.history ?? [];
}

export async function getCollectionHistory(token: string | null): Promise<CollectionHistoryItem[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/player/collection-history`, {
    credentials: "include",
    headers
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to load collection history");
  }
  const payload = (await response.json()) as { history?: CollectionHistoryItem[] } | null;
  return payload?.history ?? [];
}

export async function getCurrentTournament(token: string | null): Promise<TournamentCurrentResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/tournament/current`, {
    credentials: "include",
    headers
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "TOURNAMENT_FEATURE_LOCKED") {
      throw new Error("TOURNAMENT_FEATURE_LOCKED");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to load tournament");
  }
  return (await response.json()) as TournamentCurrentResponse;
}

export async function getTournamentHistory(token: string | null): Promise<TournamentHistoryItem[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/tournament/history`, {
    credentials: "include",
    headers
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "TOURNAMENT_FEATURE_LOCKED") {
      throw new Error("TOURNAMENT_FEATURE_LOCKED");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to load tournament history");
  }
  const payload = (await response.json()) as { history?: TournamentHistoryItem[] } | null;
  return payload?.history ?? [];
}

export async function enterTournament(token: string | null): Promise<TournamentEnterResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/tournament/enter`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "TOURNAMENT_FEATURE_LOCKED") {
      throw new Error("TOURNAMENT_FEATURE_LOCKED");
    }
  }
  if (response.status === 409) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "TOURNAMENT_DRAW_IN_PROGRESS") {
      throw new Error("TOURNAMENT_DRAW_IN_PROGRESS");
    }
    if (payload?.code === "TOURNAMENT_REWARD_UNCOLLECTED") {
      throw new Error("TOURNAMENT_REWARD_UNCOLLECTED");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to enter tournament");
  }
  return (await response.json()) as TournamentEnterResponse;
}

export async function collectTournamentReward(token: string | null): Promise<TournamentCollectRewardResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/tournament/collect-reward`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 403) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "TOURNAMENT_FEATURE_LOCKED") {
      throw new Error("TOURNAMENT_FEATURE_LOCKED");
    }
  }
  if (response.status === 400) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "NO_TOURNAMENT_REWARD_TO_COLLECT") {
      throw new Error("NO_TOURNAMENT_REWARD_TO_COLLECT");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to collect tournament reward");
  }
  return (await response.json()) as TournamentCollectRewardResponse;
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

export async function grantClientDrivenAchievement(token: string | null, achievementId: string): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/achievements/grant`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ achievementId })
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 400) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    if (payload?.code === "INVALID_ACHIEVEMENT_ID") {
      throw new Error("INVALID_ACHIEVEMENT_ID");
    }
    if (payload?.code === "ACHIEVEMENT_NOT_CLIENT_DRIVEN") {
      throw new Error("ACHIEVEMENT_NOT_CLIENT_DRIVEN");
    }
  }
  if (!response.ok) {
    throw new Error("Failed to grant achievement");
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

export async function completeSocialUpgrade(token: string): Promise<void> {
  await apiRequest("/account/upgrade/social/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
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

/** Sent as JSON to POST `/shop/purchase`; `upgradeType` is always the purchased upgrade id; bulk buys are unused. */
export type ShopPurchaseRequestBody = { upgradeType: ShopUpgradeId; quantity: 1 };

export async function purchaseUpgrade(token: string | null, upgradeId: ShopUpgradeId): Promise<PlayerResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body: ShopPurchaseRequestBody = { upgradeType: upgradeId, quantity: 1 };

  const response = await fetch(`${API_BASE_URL}/shop/purchase`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    if (response.status === 400 && payload?.code === "INSUFFICIENT_FUNDS") {
      throw new Error("INSUFFICIENT_FUNDS");
    }
    if (response.status === 400 && payload?.code === "ALREADY_OWNED") {
      throw new Error("ALREADY_OWNED");
    }
    throw new Error(payload?.error ?? "Failed to purchase upgrade");
  }

  return payload as PlayerResponse;
}

export async function upgradePlayerLevel(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/shop/upgradeLevel`, {
    method: "POST",
    credentials: "include",
    headers
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    if (response.status === 400 && payload?.code === "INSUFFICIENT_FUNDS") {
      throw new Error("INSUFFICIENT_FUNDS");
    }
    if (response.status === 400 && payload?.code === "MAX_LEVEL") {
      throw new Error("MAX_LEVEL");
    }
    throw new Error(payload?.error ?? "Failed to upgrade player level");
  }

  return payload as PlayerResponse;
}

export async function debugAddGems(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/shop/debug/add-gems`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to add debug gems");
  }

  return (await response.json()) as PlayerResponse;
}

export async function debugResetCurrentDailyBonus(token: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/daily-bonus/debug/reset-current`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to reset daily bonus");
  }
}

export async function debugAddRealTime(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/debug/add-real-time`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to add debug real time");
  }

  return (await response.json()) as PlayerResponse;
}

export async function debugAddIdleTime(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/debug/add-idle-time`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to add debug idle time");
  }

  return (await response.json()) as PlayerResponse;
}

export async function debugResetBalances(token: string | null): Promise<PlayerResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/player/debug/reset-balances`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to reset balances");
  }

  return (await response.json()) as PlayerResponse;
}

export type DebugFinalizeCurrentTournamentResponse =
  | {
      ok: true;
      finalizedTournamentId: number;
      newTournamentId: number;
      drawAtUtc: string;
      entryCount: number;
    }
  | { ok: false; reason: "NO_ACTIVE_TOURNAMENT" };

export async function debugFinalizeCurrentTournament(
  token: string | null
): Promise<DebugFinalizeCurrentTournamentResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/tournament/debug/finalize-current`, {
    method: "POST",
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to finalize tournament");
  }

  return (await response.json()) as DebugFinalizeCurrentTournamentResponse;
}

export async function logoutSession(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}

export async function getPushConfig(): Promise<{ vapidPublicKey: string }> {
  return apiRequest<{ vapidPublicKey: string }>("/notifications/push-config");
}

export async function upsertPushSubscription(token: string | null, subscription: PushSubscriptionPayload): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/notifications/push-subscription`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(subscription)
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to save push subscription");
  }
}

export async function deletePushSubscription(token: string | null, endpoint: string): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/notifications/push-subscription`, {
    method: "DELETE",
    credentials: "include",
    headers,
    body: JSON.stringify({ endpoint })
  });
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new Error("Failed to remove push subscription");
  }
}
