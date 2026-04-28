export type { IdleCollectionPlayer } from "@maxidle/shared/idleRate";
export {
  calculateBoostedIdleSecondsGain,
  calculateIdleSecondsGain,
  getEffectiveIdleSecondsRate,
  getIdleSecondsRate,
  isIdleCollectionBlockedByRestraint,
  shouldPreserveIdleTimerOnCollect
} from "@maxidle/shared/idleRate";
