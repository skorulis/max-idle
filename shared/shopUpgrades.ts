import type { ShopState } from "./shop.js";
import { safeNumber } from "./safeNumber.js";

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

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * 60 * 60;

export const SHOP_UPGRADE_IDS = {
  SECONDS_MULTIPLIER: "seconds_multiplier",
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
};

export type ShopUpgradeDefinition = {
  id: ShopUpgradeId;
  name: string;
  icon: string;
  description: string;
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
  description: "Base multiplier to idle time",
  valueDescription: "%s",
  levels: [
    { cost: 20, value: 1.1 },
    { cost: 60, value: 1.2 },
    { cost: 120, value: 1.3 },
    { cost: 300, value: 1.4 },
    { cost: 600, value: 1.5 },
    { cost: 30 * 60, value: 1.6 },
    { cost: 3600, value: 1.7 },
    { cost: 2 * 3600, value: 1.8 },
    { cost: 5 * 3600, value: 1.9 },
    { cost: 10 * 3600, value: 2.0 },
    { cost: 24 * 3600, value: 2.1 },
    { cost: 48 * 3600, value: 2.2 },
    { cost: 7 * 24 * 3600, value: 2.3 },
    { cost: 14 * 24 * 3600, value: 2.4 },
    { cost: 28 * 24 * 3600, value: 2.5 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  icon: "shield-alert",
  description: "Increase idle multiplier but you must wait 1 hour before collecting.",
  valueDescription: "%s",
  levels: [
    { cost: 2 * 60 * 60, value: 1.5 },
    { cost: 4 * 60 * 60, value: 1.75 },
    { cost: 8 * 60 * 60, value: 2.0 },
    { cost: 12 * 60 * 60, value: 2.25 },
    { cost: 16 * 60 * 60, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const IDLE_HOARDER_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.IDLE_HOARDER,
  name: "Idle hoarder",
  icon: "archive",
  description: "Gain an idle time bonus based on how much idle time is available",
  valueDescription: "Max multiplier %sx",
  levels: [
    { cost: 1 * SECONDS_PER_HOUR, value: 1.5 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.75 },
    { cost: 4 * SECONDS_PER_HOUR, value: 2.0 },
    { cost: 8 * SECONDS_PER_HOUR, value: 2.25 },
    { cost: 16 * SECONDS_PER_HOUR, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  icon: "dice-5",
  description: "Chance to keep timer when collecting",
  valueDescription: "%s",
  levels: [
    { cost: 7 * 24 * 60 * 60, value: 0.1 },
    { cost: 14 * 24 * 60 * 60, value: 0.2 },
    { cost: 28 * 24 * 60 * 60, value: 0.3 },
    { cost: 56 * 24 * 60 * 60, value: 0.4 },
    { cost: 365 * 24 * 60 * 60, value: 0.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const EXTRA_REALTIME_WAIT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT,
  name: "Time skip",
  icon: "hourglass",
  description: "Add %s realtime to your current collection",
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
  valueDescription: null,
  levels: [{ cost: 1, value: 0 }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

/** Five levels: bonus per achievement scales from 0.05 to 0.25; multiplier is 1 + value × achievementCount. */
export const WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
  name: "Worthwile Achivements",
  icon: "trophy",
  description: "Gain a bonus based on number of achievements unlocked",
  valueDescription: "%s",
  levels: [
    { cost: 5 * SECONDS_PER_HOUR, value: 0.05 },
    { cost: SECONDS_PER_DAY, value: 0.1 },
    { cost: 2 * SECONDS_PER_DAY, value: 0.15 },
    { cost: 7 * SECONDS_PER_DAY, value: 0.2 },
    { cost: 28 * SECONDS_PER_DAY, value: 0.25 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
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

const IDLE_HOARDER_MIN_MULTIPLIER = 0.01;
const IDLE_HOARDER_MAX_RATIO = 2;

/**
 * Ratio-based multiplier from idle hoarder:
 * - 0 available real time => 0.01x
 * - reaches level cap when `realTimeAvailable/secondsSinceLastCollection >= 2`
 */
export function getIdleHoarderMultiplier(level: number, realTimeAvailable: number, secondsSinceLastCollection: number): number {
  const maxMultiplier = getIdleHoarderMaxMultiplierForLevel(level);
  if (maxMultiplier <= 1) {
    return 1;
  }
  const safeAvailable = Math.max(0, safeNumber(realTimeAvailable, 0));
  const safeRealtime = Math.max(0, safeNumber(secondsSinceLastCollection, 0));
  if (safeRealtime <= 0) {
    return safeAvailable > 0 ? maxMultiplier : IDLE_HOARDER_MIN_MULTIPLIER;
  }
  const ratio = safeAvailable / safeRealtime;
  const progress = Math.max(0, Math.min(1, ratio / IDLE_HOARDER_MAX_RATIO));
  return IDLE_HOARDER_MIN_MULTIPLIER + (maxMultiplier - IDLE_HOARDER_MIN_MULTIPLIER) * progress;
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
