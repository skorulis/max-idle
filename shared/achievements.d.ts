export const ACHIEVEMENT_IDS: {
  readonly ACCOUNT_CREATION: "account_creation";
  readonly USERNAME_SELECTED: "username_selected";
  readonly BEGINNER_SHOPPER: "beginner_shopper";
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
