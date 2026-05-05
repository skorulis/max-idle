import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, SECONDS_PER_WEEK } from "./timeConstants.js";

/**
 * Cost to increase player level by one. Amounts are in the same units as
 * `player_states.idle_time_available` and `player_states.real_time_available` (seconds).
 */
export type PlayerLevelUpgradeCost = {
  idleSeconds: number;
  realSeconds: number;
};

/**
 * `costs[i]` is the price to advance from level `i + 1` to level `i + 2`.
 * Level starts at 1 in the DB; there is no cost row for “being” level 1.
 */
export const PLAYER_LEVEL_UPGRADE_COSTS: readonly PlayerLevelUpgradeCost[] = Object.freeze([
  { idleSeconds: 5 * SECONDS_PER_MINUTE, realSeconds: 1 * SECONDS_PER_MINUTE },
  { idleSeconds: 30 * SECONDS_PER_MINUTE, realSeconds: 5 * SECONDS_PER_MINUTE },
  { idleSeconds: SECONDS_PER_HOUR, realSeconds: 10 * SECONDS_PER_MINUTE },
  { idleSeconds: 4 * SECONDS_PER_HOUR, realSeconds: SECONDS_PER_HOUR },
  { idleSeconds: 12 * SECONDS_PER_HOUR, realSeconds: 2 * SECONDS_PER_HOUR },
  { idleSeconds: SECONDS_PER_DAY, realSeconds: 4 * SECONDS_PER_HOUR },
  { idleSeconds: 2 * SECONDS_PER_DAY, realSeconds: 8 * SECONDS_PER_HOUR },
  { idleSeconds: 4 * SECONDS_PER_DAY, realSeconds: 12 * SECONDS_PER_HOUR },
  { idleSeconds: SECONDS_PER_WEEK, realSeconds: SECONDS_PER_DAY }, // Level 10
  { idleSeconds: 2 * SECONDS_PER_WEEK, realSeconds: 2 * SECONDS_PER_DAY },
  { idleSeconds: 4 * SECONDS_PER_WEEK, realSeconds: 4 * SECONDS_PER_DAY },
  { idleSeconds: 8 * SECONDS_PER_WEEK, realSeconds: SECONDS_PER_WEEK },
  { idleSeconds: 12 * SECONDS_PER_WEEK, realSeconds: SECONDS_PER_WEEK },
  { idleSeconds: 26 * SECONDS_PER_WEEK, realSeconds: SECONDS_PER_WEEK }, // Level 15
]);

/** Highest player level supported by {@link PLAYER_LEVEL_UPGRADE_COSTS} (inclusive). */
export function getMaxPlayerLevel(): number {
  return 1 + PLAYER_LEVEL_UPGRADE_COSTS.length;
}

/**
 * Cost to go from `fromLevel` to `fromLevel + 1`, or `undefined` if already at max.
 */
export function getPlayerLevelUpgradeCostFromLevel(fromLevel: number): PlayerLevelUpgradeCost | undefined {
  if (typeof fromLevel !== "number" || !Number.isFinite(fromLevel)) {
    return undefined;
  }
  const level = Math.floor(fromLevel);
  const idx = level - 1;
  if (idx < 0 || idx >= PLAYER_LEVEL_UPGRADE_COSTS.length) {
    return undefined;
  }
  return PLAYER_LEVEL_UPGRADE_COSTS[idx];
}
