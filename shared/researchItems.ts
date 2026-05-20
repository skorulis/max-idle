import { formatSeconds } from "./formatSeconds.js";
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants.js";

export type ResearchItemDefinition = {
  id: string;
  name: string;
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
  BLACK_HOLE_FEED_AMOUNT: "research_black_hole_feed_amount"
} as const;

export type ResearchItemId = (typeof RESEARCH_ITEM_IDS)[keyof typeof RESEARCH_ITEM_IDS];

/** Extra black hole feed taps allowed per UTC day (+1 per level after the base). */
export const RESEARCH_BLACK_HOLE_DAILY_FEEDS: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
  name: "Black hole daily feeds",
  maximumLevel: 10,
  zeroLevelBonus: 10,
  bonusPerLevel: 1,
  format: (value) => `${Math.round(value)}`,
  baseTimeCost: 20 * SECONDS_PER_MINUTE,
  baseDuration: 8 * SECONDS_PER_MINUTE,
  growthFactor: 1.15
};

/** Idle seconds added to the black hole each time you feed it (+60s per level after the base). */
export const RESEARCH_BLACK_HOLE_FEED_AMOUNT: ResearchItemDefinition = {
  id: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
  name: "Black hole feed amount",
  maximumLevel: 10,
  zeroLevelBonus: 60,
  bonusPerLevel: 60,
  format: (value) => `${formatSeconds(Math.round(value), 2, "floor")}`,
  baseTimeCost: 25 * SECONDS_PER_MINUTE,
  baseDuration: 10 * SECONDS_PER_MINUTE,
  growthFactor: 1.15
};

export const RESEARCH_ITEMS: ResearchItemDefinition[] = [
  RESEARCH_BLACK_HOLE_DAILY_FEEDS,
  RESEARCH_BLACK_HOLE_FEED_AMOUNT
];

export const RESEARCH_ITEMS_BY_ID: Record<string, ResearchItemDefinition> = Object.fromEntries(
  RESEARCH_ITEMS.map((item) => [item.id, item])
);

export function getResearchItemDefinition(researchId: string): ResearchItemDefinition | null {
  return RESEARCH_ITEMS_BY_ID[researchId] ?? null;
}
