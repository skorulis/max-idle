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
  RESTRAINT: "restraint",
  LUCK: "luck",
  /** Spend 1 gem to move last_collected_at back by {@link REALTIME_WAIT_EXTENSION_SECONDS} real seconds (recalculates uncollected idle). */
  EXTRA_REALTIME_WAIT: "extra_realtime_wait",
  /**
   * Gem upgrade: 0.5× realtime wait per level on current collection (stacks; resets to level 0 on collect).
   * See {@link getCollectGemIdleSecondsMultiplier}.
   */
  COLLECT_GEM_TIME_BOOST: "collect_gem_time_boost",
  /** Spend 1 gem to reset purchased idle/real shop upgrades and refund their spent time. */
  PURCHASE_REFUND: "purchase_refund"
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
  levels: ShopUpgradeLevel[];
  currencyType: ShopCurrencyType;
};

export const SECONDS_MULTIPLIER_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
  name: "Seconds Multiplier",
  icon: "gauge",
  description: "Multiply idle gain by %s",
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
};

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  icon: "shield-alert",
  description: "Multiply idle gain by %s, you must wait 1 hour before collecting.",
  levels: [
    { cost: 2 * 60 * 60, value: 1.5 },
    { cost: 4 * 60 * 60, value: 1.75 },
    { cost: 8 * 60 * 60, value: 2.0 },
    { cost: 12 * 60 * 60, value: 2.25 },
    { cost: 16 * 60 * 60, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
};

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  icon: "dice-5",
  description: "%s chance to keep timer on collect.",
  levels: [
    { cost: 7 * 24 * 60 * 60, value: 0.1 },
    { cost: 14 * 24 * 60 * 60, value: 0.2 },
    { cost: 28 * 24 * 60 * 60, value: 0.3 },
    { cost: 56 * 24 * 60 * 60, value: 0.4 },
    { cost: 365 * 24 * 60 * 60, value: 0.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
};

export const EXTRA_REALTIME_WAIT_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT,
  name: "Time skip",
  icon: "hourglass",
  description: "Add %s realtime to your current collection",
  levels: [{ cost: 1, value: REALTIME_WAIT_EXTENSION_SECONDS }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
};

/** Five levels: gem costs 1, 2, 4, 8, 16. `value` = idle mult after purchasing that level (2^level). */
export const COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST,
  name: "Idle boost",
  icon: "timer",
  description: "Boost your next collection by %s.",
  levels: [
    { cost: 1, value: 0.5 },
    { cost: 2, value: 1 },
    { cost: 4, value: 1.5 },
    { cost: 8, value: 2 },
    { cost: 16, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.GEM
};

export const PURCHASE_REFUND_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.PURCHASE_REFUND,
  name: "Purchase refund",
  icon: "undo-2",
  description: "Refund all idle and real time purchases",
  levels: [{ cost: 1, value: 0 }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
};

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  PURCHASE_REFUND_SHOP_UPGRADE
];

export const SHOP_UPGRADES_BY_ID: Record<ShopUpgradeId, ShopUpgradeDefinition> = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.RESTRAINT]: RESTRAINT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LUCK]: LUCK_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT]: EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.PURCHASE_REFUND]: PURCHASE_REFUND_SHOP_UPGRADE
};

export function getCollectGemTimeBoostMaxLevel(): number {
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.levels.length;
}

export function getCollectGemTimeBoostUpgradeCostAtLevel(currentLevel: number): number {
  const max = getCollectGemTimeBoostMaxLevel();
  const L = Math.max(0, Math.min(max, Math.floor(Number(currentLevel) || 0)));
  if (L >= max) {
    return 0;
  }
  return COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE.levels[L]?.cost ?? 0;
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
