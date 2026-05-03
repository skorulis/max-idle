import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE
} from "./timeConstants.js";

export const ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION = 0.25;
export const ACHIEVEMENT_IDS = {
  ACCOUNT_CREATION: "account_creation",
  USERNAME_SELECTED: "username_selected",
  BEGINNER_SHOPPER: "beginner_shopper",
  REAL_TIME_COLLECTOR_65_MINUTES: "real_time_collector_65_minutes",
  IDLE_TIME_COLLECTOR: "idle_time_collector",
  REAL_TIME_STREAK: "real_time_streak",
  COLLECTION_COUNT: "collection_count",
  CONTEMPLATION: "contemplation",
  REWARD_SKIPPER: "reward_skipper",
  GEM_HOARDER: "gem_hoarder",
  DAILY_BONUS_COLLECTOR: "daily_bonus_collector"
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
  /** When set, level threshold `value` is in seconds and the UI formats `%s` as a duration. */
  levelValueDisplay?: "time_seconds";
  levels?: Array<{
    value: number;
    /** When set, achievement UIs show this for the current tier instead of the top-level `name`. */
    name?: string;
  }>;
};

/** Each tier of a leveled achievement counts as one slot; definitions without `levels` count as one. */
export function totalAchievementLevelSlots(): number {
  return ACHIEVEMENTS.reduce((sum, def) => sum + (def.levels?.length ?? 1), 0);
}

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
    name: "Shopper",
    description: "Purchase %s upgrades from the shop.",
    icon: "shopping-cart",
    clientDriven: false,
    levels: [
      { value: 4, name: "Beginner shopper" },
      { value: 14, name: "Intermediate shopper" },
      { value: 34, name: "Advanced shopper" }
    ]
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES,
    name: "Timekeeper",
    description: "Collect at least %s of real time in total.",
    icon: "badge-check",
    clientDriven: false,
    levelValueDisplay: "time_seconds",
    levels: [
      { value: 65 * SECONDS_PER_MINUTE, name: "Baby collector" },
      { value: 9 * SECONDS_PER_HOUR + 5 * SECONDS_PER_MINUTE, name: "Regular collector" },
      { value: 26 * SECONDS_PER_HOUR, name: "Daily collector" },
      { value: 4 * SECONDS_PER_DAY, name: "Weekly collector" },
      { value: 19 * SECONDS_PER_DAY, name: "Real collector"},
      { value: 97 * SECONDS_PER_DAY, name: "Patient collector"},
      { value: 366 * SECONDS_PER_DAY, name: "Yearly collector"},
    ]
  },
  {
    id: ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR,
    name: "Just a little idling",
    description: "Gain %s of total idle time.",
    icon: "badge-check",
    clientDriven: false,
    levelValueDisplay: "time_seconds",
    levels: [
      { value: 3 * SECONDS_PER_HOUR + 7 * SECONDS_PER_MINUTE, name: "Just a little idling" },
      { value: 25 * SECONDS_PER_HOUR, name: "Daily idler" },
      { value: 6 * SECONDS_PER_DAY, name: "Weekly idler" },
      { value: 19 * SECONDS_PER_DAY, name: "Bored idler" },
      { value: 364 * SECONDS_PER_DAY, name: "Yearly idler" },
      { value: 2 * 364 * SECONDS_PER_DAY, name: "Committed idler" },
    ]
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_STREAK,
    name: "Hibernation",
    description: "Wait at least %s before collecting.",
    icon: "clock",
    clientDriven: false,
    levelValueDisplay: "time_seconds",
    levels: [
      { value: 59 * SECONDS_PER_MINUTE, name: "Baby hibernator" },
      { value: SECONDS_PER_DAY, name: "Regular hibernator" },
      { value: 2 * SECONDS_PER_DAY + 14 * SECONDS_PER_HOUR, name: "Daily hibernator" },
      { value: 6 * SECONDS_PER_DAY, name: "Weekly hibernator" },
      { value: 15 * SECONDS_PER_DAY, name: "Patient hibernator" }
    ]
  },
  {
    id: ACHIEVEMENT_IDS.COLLECTION_COUNT,
    name: "You're doing it wrong",
    description: "Press collect %s times.",
    icon: "repeat",
    clientDriven: false,
    levels: [
      { value: 15, name: "You're doing it wrong" },
      { value: 150, name: "You don't need to click this much" },
      { value: 1500, name: "Please stop" }
    ]
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
  },
  {
    id: ACHIEVEMENT_IDS.DAILY_BONUS_COLLECTOR,
    name: "Daily ritual",
    description: "Activate %s daily bonuses.",
    icon: "gift",
    clientDriven: false,
    levels: [
      { value: 1, name: "Daily ritual" },
      { value: 13, name: "Regular ritualist" },
      { value: 27, name: "Frequent ritualist" },
      { value: 41, name: "Long time ritualist" },
      { value: 77, name: "Big gem earner" }
    ]
  }
];
