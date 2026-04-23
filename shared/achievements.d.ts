export const ACHIEVEMENT_IDS: {
  readonly ACCOUNT_CREATION: "account_creation";
  readonly USERNAME_SELECTED: "username_selected";
  readonly BEGINNER_SHOPPER: "beginner_shopper";
  readonly REAL_TIME_COLLECTOR_65_MINUTES: "real_time_collector_65_minutes";
  readonly IDLE_TIME_COLLECTOR_3H_7M: "idle_time_collector_3h_7m";
  readonly REAL_TIME_STREAK_59_MINUTES: "real_time_streak_59_minutes";
  readonly REAL_TIME_STREAK_2D_14H: "real_time_streak_2d_14h";
};

export type AchievementId = (typeof ACHIEVEMENT_IDS)[keyof typeof ACHIEVEMENT_IDS];

export type AchievementDefinition = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
};

export const ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION: number;
export const ACHIEVEMENTS: AchievementDefinition[];
