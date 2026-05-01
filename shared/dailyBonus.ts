/** Idle time (seconds) spent to activate today's daily bonus for any bonus type. */
export const DAILY_BONUS_ACTIVATION_IDLE_SECONDS = 24 * 60 * 60;

export function isDailyBonusEffectActiveForUtcDay(
  lastDailyBonusClaimedAt: Date | null,
  bonusDateUtc: Date
): boolean {
  return (
    lastDailyBonusClaimedAt !== null && lastDailyBonusClaimedAt.getTime() >= bonusDateUtc.getTime()
  );
}
