import { getResearchBonusAtLevel, getResearchLevel, type ResearchState } from "./research.js";
import {
  RESEARCH_BLACK_HOLE_DAILY_FEEDS,
  RESEARCH_BLACK_HOLE_FEED_AMOUNT,
  RESEARCH_ITEM_IDS
} from "./researchItems.js";
import { safeNaturalNumber } from "./safeNumber.js";

/** Seconds per unit in the black-hole dilation formula (`time / 36`). */
export const BLACK_HOLE_DILATION_TIME_DIVISOR = 36;

/** Upper bound on taps per feed API request (rapid-click batches). */
export const MAX_BLACKHOLE_FEED_TAPS_PER_REQUEST = 500;

/** Max feed taps per UTC calendar day from black hole daily feeds research. */
export function getBlackholeDailyFeedLimit(research: ResearchState): number {
  const level = getResearchLevel(research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS);
  return Math.floor(getResearchBonusAtLevel(RESEARCH_BLACK_HOLE_DAILY_FEEDS, level));
}

/** Idle seconds added to the black hole per feed tap from black hole feed amount research. */
export function getBlackholeFeedSecondsPerTap(research: ResearchState): number {
  const level = getResearchLevel(research, RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT);
  return Math.floor(getResearchBonusAtLevel(RESEARCH_BLACK_HOLE_FEED_AMOUNT, level));
}

/** UTC midnight for the calendar day containing `date` (ms since epoch). */
export function getUtcDayStartMs(date: Date | number): number {
  const d = typeof date === "number" ? new Date(date) : date;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Feed count for the current UTC day. Resets to 0 when `feedDayStart` is before today's UTC midnight.
 */
export function getBlackholeFeedsToday(
  feedsToday: number,
  feedDayStart: Date | string | null | undefined,
  now: Date | number,
  dailyFeedLimit: number
): number {
  if (!feedDayStart) {
    return 0;
  }
  const nowMs = typeof now === "number" ? now : now.getTime();
  const storedDayMs = getUtcDayStartMs(new Date(feedDayStart));
  if (storedDayMs < getUtcDayStartMs(nowMs)) {
    return 0;
  }
  const limit = Math.max(0, Math.floor(dailyFeedLimit));
  return Math.min(limit, Math.max(0, Math.floor(feedsToday)));
}

/** Remaining feed taps for the current UTC day. */
export function getBlackholeFeedsRemainingToday(
  feedsToday: number,
  feedDayStart: Date | string | null | undefined,
  now: Date | number,
  dailyFeedLimit: number
): number {
  const limit = Math.max(0, Math.floor(dailyFeedLimit));
  return Math.max(0, limit - getBlackholeFeedsToday(feedsToday, feedDayStart, now, limit));
}

/** Total seconds fed for a batch of taps. */
export function getBlackholeFeedSeconds(taps: number, research: ResearchState): number {
  const count = Math.max(0, Math.floor(taps));
  return count * getBlackholeFeedSecondsPerTap(research);
}

/**
 * Time dilation multiplier from invested black-hole time (seconds).
 * `max(log10(10 + time / 36), 1)`
 */
export function getBlackHoleTimeDilation(blackholeTimeSeconds: number): number {
  const time = safeNaturalNumber(blackholeTimeSeconds);
  return Math.max(Math.log10(10 + time / BLACK_HOLE_DILATION_TIME_DIVISOR), 1);
}
