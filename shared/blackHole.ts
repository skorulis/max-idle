import { safeNaturalNumber } from "./safeNumber.js";

/** Seconds per unit in the black-hole dilation formula (`time / 36`). */
export const BLACK_HOLE_DILATION_TIME_DIVISOR = 36;

/**
 * Time dilation multiplier from invested black-hole time (seconds).
 * `max(log10(10 + time / 36), 1)`
 */
export function getBlackHoleTimeDilation(blackholeTimeSeconds: number): number {
  const time = safeNaturalNumber(blackholeTimeSeconds);
  return Math.max(Math.log10(10 + time / BLACK_HOLE_DILATION_TIME_DIVISOR), 1);
}
