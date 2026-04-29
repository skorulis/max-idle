export const ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION = 0.25;
export const ACHIEVEMENT_IDS = {
  ACCOUNT_CREATION: "account_creation",
  USERNAME_SELECTED: "username_selected",
  BEGINNER_SHOPPER: "beginner_shopper",
  REAL_TIME_COLLECTOR_65_MINUTES: "real_time_collector_65_minutes",
  IDLE_TIME_COLLECTOR_3H_7M: "idle_time_collector_3h_7m",
  REAL_TIME_STREAK_59_MINUTES: "real_time_streak_59_minutes",
  REAL_TIME_STREAK_2D_14H: "real_time_streak_2d_14h",
  COLLECTION_COUNT_15: "collection_count_15",
  CONTEMPLATION: "contemplation",
  REWARD_SKIPPER: "reward_skipper",
  GEM_HOARDER: "gem_hoarder"
} as const;

/** Minimum `time_gems_available` to earn Gem Hoarder */
export const GEM_HOARDER_MIN_AVAILABLE_GEMS = 20;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[keyof typeof ACHIEVEMENT_IDS];

export type AchievementDefinition = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  clientDriven: boolean;
};

// Make sure to update AchievementsPage.tsx to map new icons
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: ACHIEVEMENT_IDS.ACCOUNT_CREATION,
    name: "Saved account",
    description: "Upgrade from an anonymous account.",
    icon: "user-plus",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.USERNAME_SELECTED,
    name: "Username selected",
    description: "Update your username.",
    icon: "badge-check",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.BEGINNER_SHOPPER,
    name: "Beginner shopper",
    description: "Purchase 4 upgrades from the shop.",
    icon: "shopping-cart",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES,
    name: "Timekeeper",
    description: "Collect 1 hour and 5 minutes of real time.",
    icon: "badge-check",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M,
    name: "Just a little idling",
    description: "Collect 3 hours and 7 minutes of idle time.",
    icon: "badge-check",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES,
    name: "Short collection",
    description: "Wait at least 59 minutes before collecting.",
    icon: "clock",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H,
    name: "Hibernation",
    description: "Wait at least 2 days and 14 hours before collecting.",
    icon: "clock",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.COLLECTION_COUNT_15,
    name: "You're doing it wrong",
    description: "Collect 15 times.",
    icon: "repeat",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.CONTEMPLATION,
    name: "Contemplation",
    description: "Spend 10 minutes being idle",
    icon: "clock",
    clientDriven: true
  },
  {
    id: ACHIEVEMENT_IDS.REWARD_SKIPPER,
    name: "Reward skipper",
    description: "Wait 48 hours before collecting the daily reward.",
    icon: "calendar-x",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.GEM_HOARDER,
    name: "Gem Hoarder",
    description: "Have 20 time gems available.",
    icon: "gem",
    clientDriven: false
  }
];
