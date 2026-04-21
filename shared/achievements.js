export const ACHIEVEMENT_EARNINGS_BONUS_PER_COMPLETION = 0.25;
export const ACHIEVEMENT_IDS = {
  ACCOUNT_CREATION: "account_creation",
  USERNAME_SELECTED: "username_selected"
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
  }
];
