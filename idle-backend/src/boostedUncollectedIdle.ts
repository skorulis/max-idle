import { calculateIdleSecondsGain } from "./idleRate.js";
import { calculateElapsedSeconds } from "./time.js";

/** Uncollected idle seconds at refTime (matches client: integral since last_collected_at, then multipliers). */
export function boostedUncollectedIdleSeconds(
  lastCollectedAt: Date,
  refTime: Date,
  secondsMultiplier: number,
  achievementBonusMultiplier: number
): number {
  const elapsedSinceLastCollection = calculateElapsedSeconds(lastCollectedAt, refTime);
  const baseGain = calculateIdleSecondsGain(elapsedSinceLastCollection);
  return Math.floor(baseGain * secondsMultiplier * achievementBonusMultiplier);
}
