import { safeNaturalNumber } from "./safeNumber.js";
import { SECONDS_PER_MINUTE } from "./timeConstants.js";

/** Seconds per unit in the black-hole dilation formula (`time / 36`). */
export const BLACK_HOLE_DILATION_TIME_DIVISOR = 36;

/** Idle seconds added to the black hole per feed tap. */
export const BLACKHOLE_FEED_SECONDS_PER_TAP = 10 * SECONDS_PER_MINUTE;

/** Upper bound on taps per feed API request (rapid-click batches). */
export const MAX_BLACKHOLE_FEED_TAPS_PER_REQUEST = 500;

/** Max feed taps per UTC calendar day. */
export const BLACKHOLE_DAILY_FEED_LIMIT = 60;

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
  now: Date | number
): number {
  if (!feedDayStart) {
    return 0;
  }
  const nowMs = typeof now === "number" ? now : now.getTime();
  const storedDayMs = getUtcDayStartMs(new Date(feedDayStart));
  if (storedDayMs < getUtcDayStartMs(nowMs)) {
    return 0;
  }
  return Math.min(BLACKHOLE_DAILY_FEED_LIMIT, Math.max(0, Math.floor(feedsToday)));
}

/** Remaining feed taps for the current UTC day. */
export function getBlackholeFeedsRemainingToday(
  feedsToday: number,
  feedDayStart: Date | string | null | undefined,
  now: Date | number
): number {
  return Math.max(0, BLACKHOLE_DAILY_FEED_LIMIT - getBlackholeFeedsToday(feedsToday, feedDayStart, now));
}

/** Total seconds fed for a batch of taps. */
export function getBlackholeFeedSeconds(taps: number): number {
  const count = Math.max(0, Math.floor(taps));
  return count * BLACKHOLE_FEED_SECONDS_PER_TAP;
}

/**
 * Time dilation multiplier from invested black-hole time (seconds).
 * `max(log10(10 + time / 36), 1)`
 */
export function getBlackHoleTimeDilation(blackholeTimeSeconds: number): number {
  const time = safeNaturalNumber(blackholeTimeSeconds);
  return Math.max(Math.log10(10 + time / BLACK_HOLE_DILATION_TIME_DIVISOR), 1);
}
