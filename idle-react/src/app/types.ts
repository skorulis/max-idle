export type AuthResponse = {
  userId: string;
  token: string;
};

export type PlayerResponse = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  currentSeconds: number;
  idleSecondsRate: number;
  secondsMultiplier: number;
  currentSecondsLastUpdated: string;
  lastCollectedAt: string;
  serverTime: string;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
};

export type LeaderboardType = "current" | "collected" | "total";

export type LeaderboardResponse = {
  type: LeaderboardType;
  entries: LeaderboardEntry[];
  currentPlayer: {
    userId: string;
    rank: number;
    totalIdleSeconds: number;
    inTop: boolean;
  };
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  completed: boolean;
};

export type AchievementsResponse = {
  completedCount: number;
  totalCount: number;
  achievements: Achievement[];
};

export type AccountResponse = {
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

export type SyncedPlayerState = {
  totalIdleSeconds: number;
  collectedIdleSeconds: number;
  currentSeconds: number;
  currentSecondsLastUpdatedMs: number;
  secondsMultiplier: number;
  lastCollectedAtMs: number;
  serverTimeMs: number;
  syncedAtClientMs: number;
};

export type PlayerProfileResponse = {
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

export type AuthFormState = {
  email: string;
  password: string;
  name: string;
};
