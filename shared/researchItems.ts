import { formatSeconds } from "./formatSeconds.js";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, SECONDS_PER_WEEK } from "./timeConstants.js";

export type ResearchItemDefinition = {
  id: string;
  name: string;
  description: string;
  maximumLevel: number;
  zeroLevelBonus: number;
  bonusPerLevel: number;
  /** Idle seconds to start researching the next level from current level L. */
  baseTimeCost: number;
  /** Real seconds for the research timer from current level L. */
  baseDuration: number;
  growthFactor: number;
  /** Display string for the effect at the current level (see {@link getResearchBonusAtLevel}). */
  format: (value: number) => string;
};

export const RESEARCH_ITEM_IDS = {
  BLACK_HOLE_DAILY_FEEDS: "research_black_hole_daily_feeds",
  BLACK_HOLE_FEED_AMOUNT: "research_black_hole_feed_amount",
  DAILY_BONUS_ACTIVATION_COST: "research_daily_bonus_activation_cost",
  TEMPORAL_EXPANSE: "research_temporal_expanse"
} as const;

export type ResearchItemId = (typeof RESEARCH_ITEM_IDS)[keyof typeof RESEARCH_ITEM_IDS];

/** Extra black hole feed taps allowed per UTC day (+1 per level after the base). */
export const RESEARCH_BLACK_HOLE_DAILY_FEEDS: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
  name: "Black hole daily feeds",
  description: "How many times you can feed the black hole each day",
  maximumLevel: 10,
  zeroLevelBonus: 10,
  bonusPerLevel: 1,
  format: (value) => `${Math.round(value)}`,
  baseTimeCost: 1 * SECONDS_PER_HOUR,
  baseDuration: 2 * SECONDS_PER_HOUR,
  growthFactor: 2.3
};

/** Idle seconds added to the black hole each time you feed it (+60s per level after the base). */
export const RESEARCH_BLACK_HOLE_FEED_AMOUNT: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
  name: "Black hole feed amount",
  description: "How much time gets added to the black hole each time you feed it",
  maximumLevel: 10,
  zeroLevelBonus: 60,
  bonusPerLevel: 60,
  format: (value) => `${formatSeconds(Math.round(value), 2, "floor")}`,
  baseTimeCost: 1 * SECONDS_PER_HOUR,
  baseDuration: 2 * SECONDS_PER_HOUR,
  growthFactor: 2.3
};

/** Extra real seconds counted toward the max idle collection window (+1 week per level). */
export const RESEARCH_TEMPORAL_EXPANSE: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.TEMPORAL_EXPANSE,
  name: "Temporal Expanse Bonus",
  description: "Additional time that gets added to the max idle collection window",
  maximumLevel: 100,
  zeroLevelBonus: 0,
  bonusPerLevel: SECONDS_PER_WEEK,
  format: (value) => `${formatSeconds(Math.round(value), 2, "floor")}`,
  baseTimeCost: 7 * SECONDS_PER_DAY,
  baseDuration: 6 * SECONDS_PER_HOUR,
  growthFactor: 1.05
};

/** Idle seconds required to activate the daily bonus (24h at level 0, −30m per level). */
export const RESEARCH_DAILY_BONUS_ACTIVATION_COST: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.DAILY_BONUS_ACTIVATION_COST,
  name: "Daily bonus activation cost",
  description: "Reduce how much time is required to activate the daily bonus",
  maximumLevel: 40,
  zeroLevelBonus: 24 * SECONDS_PER_HOUR,
  bonusPerLevel: -30 * SECONDS_PER_MINUTE,
  format: (value) => `${formatSeconds(Math.round(value), 2, "floor")}`,
  baseTimeCost: 1 * SECONDS_PER_HOUR,
  baseDuration: 4 * SECONDS_PER_HOUR,
  growthFactor: 1.25
};

export const RESEARCH_ITEMS: ResearchItemDefinition[] = [
  RESEARCH_BLACK_HOLE_DAILY_FEEDS,
  RESEARCH_BLACK_HOLE_FEED_AMOUNT,
  RESEARCH_DAILY_BONUS_ACTIVATION_COST,
  RESEARCH_TEMPORAL_EXPANSE
];

export const RESEARCH_ITEMS_BY_ID: Record<string, ResearchItemDefinition> = Object.fromEntries(
  RESEARCH_ITEMS.map((item) => [item.id, item])
);

export function getResearchItemDefinition(researchId: string): ResearchItemDefinition | null {
  return RESEARCH_ITEMS_BY_ID[researchId] ?? null;
}
