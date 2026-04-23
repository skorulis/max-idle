export const ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION = 0.25;
export const ACHIEVEMENT_IDS = {
  ACCOUNT_CREATION: "account_creation",
  USERNAME_SELECTED: "username_selected",
  BEGINNER_SHOPPER: "beginner_shopper",
  REAL_TIME_COLLECTOR_65_MINUTES: "real_time_collector_65_minutes",
  IDLE_TIME_COLLECTOR_3H_7M: "idle_time_collector_3h_7m",
  REAL_TIME_STREAK_59_MINUTES: "real_time_streak_59_minutes",
  REAL_TIME_STREAK_2D_14H: "real_time_streak_2d_14h"
};

export const ACHIEVEMENTS = [
  {
    id: ACHIEVEMENT_IDS.ACCOUNT_CREATION,
    name: "Account creation",
    description: "Upgrade from an anonymous account.",
    icon: "user-plus"
  },
  {
    id: ACHIEVEMENT_IDS.USERNAME_SELECTED,
    name: "Username selected",
    description: "Update your username.",
    icon: "badge-check"
  },
  {
    id: ACHIEVEMENT_IDS.BEGINNER_SHOPPER,
    name: "Beginner shopper",
    description: "Purchase 4 upgrades from the shop.",
    icon: "shopping-cart"
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_COLLECTOR_65_MINUTES,
    name: "Timekeeper",
    description: "Collect 1 hour and 5 minutes of real time.",
    icon: "badge-check"
  },
  {
    id: ACHIEVEMENT_IDS.IDLE_TIME_COLLECTOR_3H_7M,
    name: "Just a little idling",
    description: "Collect 3 hours and 7 minutes of idle time.",
    icon: "badge-check"
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_STREAK_59_MINUTES,
    name: "Short collection",
    description: "Wait at least 59 minutes before collecting.",
    icon: "clock"
  },
  {
    id: ACHIEVEMENT_IDS.REAL_TIME_STREAK_2D_14H,
    name: "Hibernation",
    description: "Wait at least 2 days and 14 hours before collecting.",
    icon: "clock"
  }
];
