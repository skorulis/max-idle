import type { ShopState } from "../shop";

export type AuthResponse = {
  userId: string;
  token: string;
};

export type TimeCurrencyBalances = {
  total: number;
  available: number;
};

export type DailyBonusType =
  | "collect_idle_percent"
  | "collect_real_percent"
  | "double_gems_daily_reward"
  | "free_time_gem"
  | "free_real_time_hours"
  | "free_idle_time_hours";

export type DailyBonus = {
  type: DailyBonusType;
  value: number;
  date: string;
  isCollectable: boolean;
  isClaimed: boolean;
  activationCostIdleSeconds: number;
};

export type DailyBonusHistoryItem = {
  type: DailyBonusType;
  value: number;
  date: string;
};

export type CollectionHistoryItem = {
  id: number;
  collectionDate: string;
  realTime: number;
  idleTime: number;
};

export type PlayerResponse = {
  idleTime: TimeCurrencyBalances;
  realTime: TimeCurrencyBalances;
  timeGems: TimeCurrencyBalances;
  collectedSeconds?: number;
  realSecondsCollected?: number;
  upgradesPurchased: number;
  currentSeconds: number;
  idleSecondsRate: number;
  secondsMultiplier: number;
  shop: ShopState;
  achievementCount: number;
  achievementBonusMultiplier: number;
  hasUnseenAchievements: boolean;
  currentSecondsLastUpdated: string;
  lastCollectedAt: string;
  lastDailyRewardCollectedAt: string | null;
  dailyBonus?: DailyBonus | null;
  serverTime: string;
  tutorialProgress: string;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  totalIdleSeconds: number;
  isCurrentPlayer: boolean;
};

export type TournamentRankedEntry = {
  rank: number;
  userId: string;
  username: string;
  timeScoreSeconds: number;
  isCurrentPlayer: boolean;
};

export type TournamentEntryResponse = {
  enteredAt: string;
  finalRank: number | null;
  timeScoreSeconds: number | null;
  gemsAwarded: number | null;
  finalizedAt: string | null;
};

export type TournamentOutstandingResult = {
  tournamentId: number;
  drawAt: string;
  finalizedAt: string;
  finalRank: number;
  gemsAwarded: number;
  playerCount: number;
};

export type TournamentCurrentResponse = {
  drawAt: string;
  isActive: boolean;
  hasEntered: boolean;
  playerCount: number;
  currentRank: number | null;
  expectedRewardGems: number | null;
  nearbyEntries: TournamentRankedEntry[];
  entry: TournamentEntryResponse | null;
  outstanding_result: TournamentOutstandingResult | null;
};

export type TournamentEnterResponse = {
  tournament: TournamentCurrentResponse;
  enteredNow: boolean;
};

export type TournamentCollectRewardResponse = {
  gemsCollected: number;
};

export type TournamentHistoryItem = {
  drawAt: string;
  finalRank: number;
  playerCount: number;
  gemsAwarded: number | null;
};

export type LeaderboardType = "current" | "collected" | "time_gems";

export type LeaderboardResponse = {
  type: LeaderboardType;
  entries: LeaderboardEntry[];
  currentPlayer: {
    userId: string;
    rank: number;
    totalIdleSeconds: number;
    inTop: boolean;
  } | null;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  clientDriven: boolean;
  level: number;
  maxLevel: number;
  completed: boolean;
  grantedAt: string | null;
};

export type AchievementsResponse = {
  completedCount: number;
  earningsBonusMultiplier: number;
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

export type SurveyCurrencyType = "idle" | "real" | "gem";

export type SurveyOption = {
  id: string;
  text: string;
};

export type Survey = {
  id: string;
  active: boolean;
  currencyType: SurveyCurrencyType;
  reward: number;
  title: string;
  options: SurveyOption[];
};

export type AvailableSurveySummary = {
  id: string;
  title: string;
  currencyType: SurveyCurrencyType;
  reward: number;
};

export type HomeResponse = {
  player: PlayerResponse;
  account: AccountResponse;
  /** Present when the player has purchased the weekly tournament shop upgrade. */
  tournament: TournamentCurrentResponse | null;
  availableSurvey: AvailableSurveySummary | null;
};

export type SyncedPlayerState = {
  idleTime: TimeCurrencyBalances;
  realTime: TimeCurrencyBalances;
  timeGems: TimeCurrencyBalances;
  upgradesPurchased: number;
  currentSeconds: number;
  currentSecondsLastUpdatedMs: number;
  secondsMultiplier: number;
  shop: ShopState;
  achievementCount: number;
  achievementBonusMultiplier: number;
  hasUnseenAchievements: boolean;
  lastCollectedAtMs: number;
  lastDailyRewardCollectedAtMs: number | null;
  dailyBonus: DailyBonus | null;
  serverTimeMs: number;
  syncedAtClientMs: number;
  tutorialProgress: string;
};

export type SyncedTournamentEntry = {
  enteredAtMs: number;
  finalRank: number | null;
  timeScoreSeconds: number | null;
  gemsAwarded: number | null;
  finalizedAtMs: number | null;
};

export type SyncedOutstandingTournamentResult = {
  tournamentId: number;
  drawAtMs: number;
  finalizedAtMs: number;
  finalRank: number;
  gemsAwarded: number;
  playerCount: number;
};

export type SyncedTournamentState = {
  drawAtMs: number;
  isActive: boolean;
  hasEntered: boolean;
  playerCount: number;
  currentRank: number | null;
  expectedRewardGems: number | null;
  nearbyEntries: TournamentRankedEntry[];
  entry: SyncedTournamentEntry | null;
  outstandingResult: SyncedOutstandingTournamentResult | null;
  syncedAtClientMs: number;
};

export type PlayerProfileResponse = {
  player: {
    id: string;
    username: string;
    accountAgeSeconds: number;
    currentIdleSeconds: number;
    idleTime: TimeCurrencyBalances;
    realTime: TimeCurrencyBalances;
    timeGems: TimeCurrencyBalances;
    upgradesPurchased: number;
    achievementCount: number;
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
