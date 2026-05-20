import { safeNaturalNumber } from "./safeNumber.js";
import { SECONDS_PER_MINUTE } from "./timeConstants.js";

/** Seconds per unit in the black-hole dilation formula (`time / 36`). */
export const BLACK_HOLE_DILATION_TIME_DIVISOR = 36;

/** Idle seconds added to the black hole per feed tap. */
export const BLACKHOLE_FEED_SECONDS_PER_TAP = 10 * SECONDS_PER_MINUTE;

/** Upper bound on taps per feed API request (rapid-click batches). */
export const MAX_BLACKHOLE_FEED_TAPS_PER_REQUEST = 500;

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
