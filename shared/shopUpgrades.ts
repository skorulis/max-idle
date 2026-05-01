import type { ShopState } from "./shop.js";
import { safeNumber, safeNaturalNumber } from "./safeNumber.js";
import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_WEEK,
  SECONDS_PER_YEAR
} from "./timeConstants.js";

export const SHOP_CURRENCY_TYPES = {
  IDLE: "idle",
  REAL: "real",
  GEM: "gem"
} as const;

export type ShopCurrencyType = (typeof SHOP_CURRENCY_TYPES)[keyof typeof SHOP_CURRENCY_TYPES];

/** Wall-clock second shift applied to last_collected_at (purchase moves collection time back by this much). */
export const REALTIME_WAIT_EXTENSION_SECONDS = 6 * 60 * 60;

/**
 * Per purchased level, realtime "wait" to your current uncollected bar is multiplied by this (idle shown/collected is scaled inversely; {@link getCollectGemIdleSecondsMultiplier}).
 * Level resets to 0 on collect.
 */
export const COLLECT_GEM_TIME_PER_LEVEL_WAIT_FACTOR = 0.5;

export const SHOP_UPGRADE_IDS = {
  SECONDS_MULTIPLIER: "seconds_multiplier",
  ANOTHER_SECONDS_MULTIPLIER: "another_seconds_multiplier",
  PATIENCE: "patience",
  RESTRAINT: "restraint",
  IDLE_HOARDER: "idle_hoarder",
  LUCK: "luck",
  /** Spend 1 gem to move last_collected_at back by {@link REALTIME_WAIT_EXTENSION_SECONDS} real seconds (recalculates uncollected idle). */
  EXTRA_REALTIME_WAIT: "extra_realtime_wait",
  /**
   * Gem upgrade: 0.5× realtime wait per level on current collection (stacks; resets to level 0 on collect).
   * See {@link getCollectGemIdleSecondsMultiplier}.
   */
  COLLECT_GEM_TIME_BOOST: "collect_gem_time_boost",
  /** Spend 1 gem to reset purchased idle/real shop upgrades and refund their spent time. */
  PURCHASE_REFUND: "purchase_refund",
  /** Idle multiplier bonus per unlocked achievement: ×(1 + value × achievementCount). */
  WORTHWHILE_ACHIEVEMENTS: "worthwhile_achievements"
} as const;

export type ShopUpgradeId = (typeof SHOP_UPGRADE_IDS)[keyof typeof SHOP_UPGRADE_IDS];

export const SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER = "%s";

export type ShopUpgradeLevel = {
  cost: number;
  value: number;
  value2?: number;
};

export type ShopUpgradeDefinition = {
  id: ShopUpgradeId;
  name: string;
  icon: string;
  description: string;
  longDescription: string;
  valueDescription: string | null;
  levels: ShopUpgradeLevel[];
  currencyType: ShopCurrencyType;
  maxLevel(): number;
  costAtLevel(level: number): number;
  currentLevel(shop: ShopState): number;
};

type ShopUpgradeDefinitionConfig = Omit<ShopUpgradeDefinition, "maxLevel" | "costAtLevel" | "currentLevel">;

function normalizeUpgradeLevel(rawLevel: unknown, maxLevel: number): number {
  if (typeof rawLevel !== "number" || !Number.isFinite(rawLevel)) {
    return 0;
  }
  return Math.max(0, Math.min(maxLevel, Math.floor(rawLevel)));
}

function normalizeCostLevel(level: number, maxLevel: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.max(0, Math.min(maxLevel, Math.floor(level)));
}

function defineShopUpgrade(upgrade: ShopUpgradeDefinitionConfig): ShopUpgradeDefinition {
  const maxLevel = upgrade.levels.length;
  return {
    ...upgrade,
    maxLevel: () => maxLevel,
    costAtLevel: (level: number) => {
      const safeLevel = normalizeCostLevel(level, maxLevel);
      if (safeLevel >= maxLevel) {
        return 0;
      }
      return upgrade.levels[safeLevel]?.cost ?? 0;
    },
    currentLevel: (shop: ShopState) => normalizeUpgradeLevel(shop[upgrade.id], maxLevel)
  };
}

export const SECONDS_MULTIPLIER_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
  name: "Base Multiplier",
  icon: "gauge",
  description: "Constant idle time multiplier",
  longDescription:
    "Increases your idle production at all times. Each level raises your always-on multiplier. There are no downsides to this.",
  valueDescription: "%s",
  levels: [
    { cost: 60, value: 1.05 },
    { cost: 120, value: 1.1 },
    { cost: 300, value: 1.15 },
    { cost: 30 * 60, value: 1.2 },
    { cost: SECONDS_PER_HOUR, value: 1.25 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.3 },
    { cost: 5 * SECONDS_PER_HOUR, value: 1.35 },
    { cost: 10 * SECONDS_PER_HOUR, value: 1.4 },
    { cost: 24 * SECONDS_PER_HOUR, value: 1.45 },
    { cost: 48 * SECONDS_PER_HOUR, value: 1.5 },
    { cost: 1 * SECONDS_PER_WEEK, value: 1.55 },
    { cost: 2 * SECONDS_PER_WEEK, value: 1.6 },
    { cost: 4 * SECONDS_PER_WEEK, value: 1.65 },
    { cost: 7 * SECONDS_PER_WEEK, value: 1.7 },
    { cost: 10 * SECONDS_PER_WEEK, value: 1.75 },
    { cost: 20 * SECONDS_PER_WEEK, value: 1.8 },
    { cost: 30 * SECONDS_PER_WEEK, value: 1.85 },
    { cost: 40 * SECONDS_PER_WEEK, value: 1.9 },
    { cost: 52 * SECONDS_PER_WEEK, value: 1.95 },
    { cost: 2 * SECONDS_PER_YEAR, value: 2.0 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.ANOTHER_SECONDS_MULTIPLIER,
  name: "Another Base Multiplier",
  icon: "gauge",
  description: "Constant idle time multiplier",
  longDescription:
    "Increases your idle production at all times. Each level raises your always-on multiplier. This stacks with the base multiplier upgrade.",
  valueDescription: "%s",
  levels: [
    { cost: 60, value: 1.05 },
    { cost: 120, value: 1.1 },
    { cost: 300, value: 1.15 },
    { cost: 30 * 60, value: 1.2 },
    { cost: SECONDS_PER_HOUR, value: 1.25 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.3 },
    { cost: 5 * SECONDS_PER_HOUR, value: 1.35 },
    { cost: 10 * SECONDS_PER_HOUR, value: 1.4 },
    { cost: 24 * SECONDS_PER_HOUR, value: 1.45 },
    { cost: 48 * SECONDS_PER_HOUR, value: 1.5 },
    { cost: 1 * SECONDS_PER_WEEK, value: 1.55 },
    { cost: 2 * SECONDS_PER_WEEK, value: 1.6 },
    { cost: 4 * SECONDS_PER_WEEK, value: 1.65 },
    { cost: 7 * SECONDS_PER_WEEK, value: 1.7 },
    { cost: 10 * SECONDS_PER_WEEK, value: 1.75 },
    { cost: 20 * SECONDS_PER_WEEK, value: 1.8 },
    { cost: 30 * SECONDS_PER_WEEK, value: 1.85 },
    { cost: 40 * SECONDS_PER_WEEK, value: 1.9 },
    { cost: 52 * SECONDS_PER_WEEK, value: 1.95 },
    { cost: 2 * SECONDS_PER_YEAR, value: 2.0 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const PATIENCE_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.PATIENCE,
  name: "Patience",
  icon: "hourglass",
  description: "Idle time multiplier that increases over time",
  longDescription:
    "This idle multiplier increases over time up to a certain limit. The longer you wait before collecting the higher the bonus will be up to a maximum.",
  valueDescription: "%sx at %s",
  levels: [
    { cost: 60, value: 1.5, value2: 60 },
    { cost: 5 * 60, value: 2, value2: 10 * 60 },
    { cost: SECONDS_PER_HOUR, value: 3, value2: SECONDS_PER_HOUR },
    { cost: 5 * SECONDS_PER_HOUR, value: 4, value2: 3 * SECONDS_PER_HOUR },
    { cost: SECONDS_PER_DAY, value: 5, value2: 6 * SECONDS_PER_HOUR },
    { cost: 4 * SECONDS_PER_DAY, value: 10, value2: SECONDS_PER_DAY },
    { cost: 14 * SECONDS_PER_DAY, value: 12, value2: SECONDS_PER_WEEK },
    { cost: SECONDS_PER_YEAR, value: 15, value2: 4 * SECONDS_PER_WEEK },
    { cost: 2 * SECONDS_PER_YEAR, value: 20, value2: SECONDS_PER_YEAR }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  icon: "shield-alert",
  description: "Idle time multiplier that blocks collection until time has passed.",
  longDescription:
    "Adds a constant idle multiplier, but enforces a minimum real-time wait before collecting. Collecting too early is blocked, trading flexibility for a higher payout.",
  valueDescription: "%s, collect after %s hours",
  levels: [
    { cost: 2 * 60 * 60, value: 1.1, value2: 1 },
    { cost: 4 * 60 * 60, value: 1.2, value2: 2 },
    { cost: 8 * 60 * 60, value: 1.3, value2: 6 },
    { cost: 12 * 60 * 60, value: 1.4, value2: 12 },
    { cost: 16 * 60 * 60, value: 1.5, value2: 24 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const IDLE_HOARDER_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.IDLE_HOARDER,
  name: "Real hoarder",
  icon: "archive",
  description: "Idle time multiplier that only applies when you have more stored realtime than realtime to collect",
  longDescription:
    "Grants an extra multiplier only when your stored real-time pool is at least a set ratio of your current real-time wait. If you wait too long to collect this bonus will not apply.",
  valueDescription: "%sx when stored time is >= %s x current real time",
  levels: [
    { cost: 1 * SECONDS_PER_HOUR, value: 1.5, value2: 1},
    { cost: 2 * SECONDS_PER_HOUR, value: 1.75, value2: 1.5},
    { cost: 4 * SECONDS_PER_HOUR, value: 2.0, value2: 2},
    { cost: 8 * SECONDS_PER_HOUR, value: 2.25, value2: 2.5},
    { cost: 16 * SECONDS_PER_HOUR, value: 2.5, value2: 3},
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  icon: "dice-5",
  description: "Chance to not reset when collecting",
  longDescription:
    "Gives each collection a chance to avoid the usual reset behavior. Higher levels increase the probability, letting you preserve progress more often across collections.",
  valueDescription: "%s",
  levels: [
    { cost: 7 * 24 * 60 * 60, value: 0.05 },
    { cost: 14 * 24 * 60 * 60, value: 0.1 },
    { cost: 28 * 24 * 60 * 60, value: 0.15 },
    { cost: 56 * 24 * 60 * 60, value: 0.2 },
    { cost: 365 * 24 * 60 * 60, value: 0.25 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const EXTRA_REALTIME_WAIT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT,
  name: "Time skip",
  icon: "hourglass",
  description: "Add %s realtime to your current collection",
  longDescription:
    "Spend a time gem to instantly extend the current run's real-time wait by a fixed amount. This can increase the current uncollected idle value without waiting in real time.",
  valueDescription: null,
  levels: [{ cost: 1, value: REALTIME_WAIT_EXTENSION_SECONDS }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

/** Five levels: gem costs 1, 2, 4, 8, 16. `value` = idle mult after purchasing that level (2^level). */
export const COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST,
  name: "Idle boost",
  icon: "timer",
  description: "Apply an idle multiplier to your next collection",
  longDescription:
    "Temporarily boosts your next collection. On the next collection this bonus will be reset.",
  valueDescription: "%s",
  levels: [
    { cost: 1, value: 0.5 },
    { cost: 2, value: 1 },
    { cost: 4, value: 1.5 },
    { cost: 8, value: 2 },
    { cost: 16, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

export const PURCHASE_REFUND_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.PURCHASE_REFUND,
  name: "Purchase refund",
  icon: "undo-2",
  description: "Refund all idle and real time purchases",
  longDescription:
    "Spend a time gem to reset purchased idle and real-time shop upgrades, refunding the spent time into your balances. Use this to re-spec your upgrade path.",
  valueDescription: null,
  levels: [{ cost: 1, value: 0 }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

/** Ten levels: bonus per achievement rises by 0.02 per level, from 0.02 to 0.2; multiplier is 1 + value × achievementCount. */
export const WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
  name: "Worthwhile Achievements",
  icon: "trophy",
  description: "Idle time multiplier that increases with each achievement unlocked",
  longDescription:
    "Adds an idle multiplier that scales with your unlocked achievements. Each level increases the per-achievement bonus, making achievement progress directly improve income.",
  valueDescription: "%s",
  levels: [
    { cost: 2 * SECONDS_PER_HOUR, value: 0.02 },
    { cost: 5 * SECONDS_PER_HOUR, value: 0.04 },
    { cost: 16 * SECONDS_PER_HOUR, value: 0.06 },
    { cost: SECONDS_PER_DAY, value: 0.08 },
    { cost: 2 * SECONDS_PER_DAY, value: 0.1 },
    { cost: SECONDS_PER_WEEK, value: 0.12 },
    { cost: 2 * SECONDS_PER_WEEK, value: 0.14 },
    { cost: 4 * SECONDS_PER_WEEK, value: 0.16 },
    { cost: 10 * SECONDS_PER_WEEK, value: 0.18 },
    { cost: 26 * SECONDS_PER_WEEK, value: 0.2 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  PATIENCE_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  IDLE_HOARDER_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  PURCHASE_REFUND_SHOP_UPGRADE
];

export const SHOP_UPGRADES_BY_ID: Record<ShopUpgradeId, ShopUpgradeDefinition> = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.ANOTHER_SECONDS_MULTIPLIER]: ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.PATIENCE]: PATIENCE_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.RESTRAINT]: RESTRAINT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.IDLE_HOARDER]: IDLE_HOARDER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LUCK]: LUCK_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT]: EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.PURCHASE_REFUND]: PURCHASE_REFUND_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS]: WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE
};

export function getShopUpgradeDefinition(upgradeType: string): ShopUpgradeDefinition | null {
  return SHOP_UPGRADES_BY_ID[upgradeType as ShopUpgradeId] ?? null;
}

export function getCollectGemTimeBoostMaxLevel(): number {
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.maxLevel();
}

export function getCollectGemTimeBoostUpgradeCostAtLevel(currentLevel: number): number {
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.costAtLevel(currentLevel);
}

export function getIdleHoarderMaxLevel(): number {
  return IDLE_HOARDER_SHOP_UPGRADE.maxLevel();
}

export function getIdleHoarderUpgradeCostAtLevel(currentLevel: number): number {
  return IDLE_HOARDER_SHOP_UPGRADE.costAtLevel(currentLevel);
}

export function getIdleHoarderMaxMultiplierForLevel(level: number): number {
  const maxLevel = getIdleHoarderMaxLevel();
  const L = Math.max(0, Math.min(maxLevel, level));
  if (L <= 0) {
    return 1;
  }
  return IDLE_HOARDER_SHOP_UPGRADE.levels[L - 1]?.value ?? 1;
}

function getIdleHoarderRatioThresholdForLevel(level: number): number {
  const maxLevel = getIdleHoarderMaxLevel();
  const L = Math.max(0, Math.min(maxLevel, Math.floor(Number(level) || 0)));
  if (L <= 0) {
    return Infinity;
  }
  const raw = IDLE_HOARDER_SHOP_UPGRADE.levels[L - 1]?.value2;
  return safeNaturalNumber(raw, 1);
}

/**
 * Stored-real-time bonus from idle hoarder:
 * - Below tier threshold: {@link IDLE_HOARDER_MIN_MULTIPLIER}
 * - When `realTimeAvailable / secondsSinceLastCollection >=` that level's `value2`: full tier `value` multiplier
 */
export function getIdleHoarderMultiplier(level: number, realTimeAvailable: number, secondsSinceLastCollection: number): number {
  const maxMultiplier = getIdleHoarderMaxMultiplierForLevel(level);
  if (maxMultiplier <= 1) {
    return 1;
  }
  const safeAvailable = safeNaturalNumber(realTimeAvailable, 0);
  const safeRealtime = safeNaturalNumber(secondsSinceLastCollection, 0);
  if (safeRealtime <= 0) {
    return safeAvailable > 0 ? maxMultiplier : 1;
  }
  const ratio = safeAvailable / safeRealtime;
  const threshold = getIdleHoarderRatioThresholdForLevel(level);
  if (ratio >= threshold) {
    return maxMultiplier;
  }
  return 1;
}

/**
 * Max level 5. Multiplier on uncollected idle (and on collect) for `collectGemBoostLevel` purchased tiers.
 * Each level is a 0.5× on realtime wait, i.e. ×2 on idle for that tier (2^L overall).
 */
export function getCollectGemIdleSecondsMultiplier(collectGemBoostLevel: number): number {
  const maxLevel = getCollectGemTimeBoostMaxLevel();
  const L = Math.max(0, Math.min(maxLevel, Math.floor(Number(collectGemBoostLevel) || 0)));
  if (L <= 0) {
    return 1;
  }
  return Math.pow(1 / COLLECT_GEM_TIME_PER_LEVEL_WAIT_FACTOR, L);
}

export function formatShopUpgradeDescription(upgrade: ShopUpgradeDefinition, value: string): string {
  return upgrade.description.replace(SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER, value);
}

export function getWorthwhileAchievementsBonusPerAchievement(level: number): number {
  const maxLevel = WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.maxLevel();
  const L = Math.max(0, Math.min(maxLevel, Math.floor(Number(level) || 0)));
  if (L <= 0) {
    return 0;
  }
  return WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE.levels[L - 1]?.value ?? 0;
}
