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
  /** When set, level threshold `value` is in seconds and the UI formats `%s` as a duration. */
  levelValueDisplay?: "time_seconds";
  levels?: Array<{
    value: number;
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
    name: "Beginner shopper",
    description: "Purchase 4 upgrades from the shop.",
    icon: "shopping-cart",
    clientDriven: false
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES,
    name: "Timekeeper",
    description: "Collect at least %s of real time in total.",
    icon: "badge-check",
    clientDriven: false,
    levelValueDisplay: "time_seconds",
    levels: [
      { value: 65 * SECONDS_PER_MINUTE },
      { value: 9 * SECONDS_PER_HOUR + 5 * SECONDS_PER_MINUTE },
      { value: 26 * SECONDS_PER_HOUR },
      { value: 4 * SECONDS_PER_DAY },
      { value: 19 * SECONDS_PER_DAY },
      { value: 97 * SECONDS_PER_DAY },
      { value: 366 * SECONDS_PER_DAY },
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
      { value: 3 * SECONDS_PER_HOUR + 7 * SECONDS_PER_MINUTE },
      { value: 25 * SECONDS_PER_HOUR },
      { value: 6 * SECONDS_PER_DAY },
      { value: 19 * SECONDS_PER_DAY },
      { value: 364 * SECONDS_PER_DAY },
      { value: 2 * 364 * SECONDS_PER_DAY },
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
      { value: 59 * SECONDS_PER_MINUTE },
      { value: SECONDS_PER_DAY },
      { value: 2 * SECONDS_PER_DAY + 14 * SECONDS_PER_HOUR },
      { value: 6 * SECONDS_PER_DAY },
      { value: 15 * SECONDS_PER_DAY }
    ]
  },
  {
    id: ACHIEVEMENT_IDS.COLLECTION_COUNT,
    name: "You're doing it wrong",
    description: "Press collect %s times.",
    icon: "repeat",
    clientDriven: false,
    levels: [{ value: 15 }, { value: 150 }, { value: 1500 }]
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
