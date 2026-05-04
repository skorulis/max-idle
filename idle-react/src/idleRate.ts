export type { IdleCollectionPlayer } from "@maxidle/shared/idleRate";
export {
  calculateBoostedIdleSecondsGain,
  getEffectiveIdleSecondsRate,
  getPatienceRate,
  isIdleCollectionBlockedByRestraint,
  shouldPreserveIdleTimerOnCollect
} from "@maxidle/shared/idleRate";
