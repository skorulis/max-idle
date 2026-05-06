import type { ShopState } from "./shop.js";
import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
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

export const SHOP_UPGRADE_IDS = {
  SECONDS_MULTIPLIER: "seconds_multiplier",
  ANOTHER_SECONDS_MULTIPLIER: "another_seconds_multiplier",
  PATIENCE: "patience",
  RESTRAINT: "restraint",
  LUCK: "luck",
  /** Spend 1 gem to move last_collected_at back by {@link REALTIME_WAIT_EXTENSION_SECONDS} real seconds (recalculates uncollected idle). */
  EXTRA_REALTIME_WAIT: "extra_realtime_wait",
  /**
   * Gem upgrade: idle multiplier on current collection per tier (see {@link COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE}; resets to level 0 on collect).
   * Implemented by `getCollectGemIdleSecondsMultiplier` in `shop.ts`.
   */
  COLLECT_GEM_TIME_BOOST: "collect_gem_time_boost",
  /** Spend 1 gem to reset idle-priced shop tiers and refund spent idle time. */
  IDLE_REFUND: "idle_refund",
  /** Spend 1 gem to reset real-priced shop tiers and refund spent real time. */
  REAL_REFUND: "real_refund",
  /** Idle multiplier bonus per unlocked achievement: ×(1 + value × achievementCount). */
  WORTHWHILE_ACHIEVEMENTS: "worthwhile_achievements",
  /** Idle-priced tiers; bonus adds `value × playerLevel` to the effective collection rate (see {@link getLevelBonusIdleContribution}). */
  LEVEL_BONUS: "level_bonus",
  /**
   * Real-time purchase: each tier adds one more week of wall-clock time that can accrue toward uncollected idle before the bar stops.
   * See {@link getMaxIdleCollectionRealtimeSeconds}.
   */
  STORAGE_EXTENSION: "storage_extension",
  /** Idle multiplier that ramps linearly from ×1 up after periods without idle- or real-priced shop buys (see `getAntiConsumeristMultiplier` in `shop.ts`). */
  ANTI_CONSUMERIST: "anti_consumerist",
  /**
   * Idle additive bonus when few distinct other idle-priced shop lines have tiers (see `getConsolidationBonus` in `shop.ts`).
   * This upgrade is excluded from that count.
   */
  CONSOLIDATION: "consolidation",
  /**
   * Idle additive bonus only while real-time elapsed since last collect is below the tier's `value2` (see `getQuickCollectorBonus` in `shop.ts`).
   */
  QUICK_COLLECTOR: "quick_collector",
  /** APR% used to convert available real time into idle-time interest during idle accumulation. */
  INTEREST: "interest"
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
  category?: string;
  description: string;
  longDescription: string;
  valueDescription: string | null;
  zeroLevel?: ShopUpgradeLevel; // Optional level 0 information
  levels: ShopUpgradeLevel[];
  currencyType: ShopCurrencyType;
  maxLevel(): number;
  /** Gem-priced tiers only; idle/real tiers use the shared currency cost table (`shopCurrencyCostTable.ts`), so this is always 0 for those upgrades. */
  costAtLevel(level: number): number;
  currentLevel(shop: ShopState): number;
  currentValue(shop: ShopState): number;
};

export type LegacyShopUpgradeDefinition = {
  id: string;
  currencyType: Exclude<ShopCurrencyType, "gem">;
};

type ShopUpgradeDefinitionConfig = Omit<
  ShopUpgradeDefinition,
  "maxLevel" | "costAtLevel" | "currentLevel" | "currentValue"
>;

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
  const usesGemPricing = upgrade.currencyType === SHOP_CURRENCY_TYPES.GEM;
  return {
    ...upgrade,
    maxLevel: () => maxLevel,
    costAtLevel: (level: number) => {
      if (!usesGemPricing) {
        return 0;
      }
      const safeLevel = normalizeCostLevel(level, maxLevel);
      if (safeLevel >= maxLevel) {
        return 0;
      }
      return upgrade.levels[safeLevel]?.cost ?? 0;
    },
    currentLevel: (shop: ShopState) => normalizeUpgradeLevel(shop[upgrade.id], maxLevel),
    currentValue: (shop: ShopState) => {
      const level = normalizeUpgradeLevel(shop[upgrade.id], maxLevel);
      if (level <= 0) {
        return upgrade.zeroLevel?.value ?? 0;
      }
      return upgrade.levels[level - 1]?.value ?? 0;
    }
  };
}

export const SECONDS_MULTIPLIER_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
  name: "Base Collection Rate",
  icon: "gauge",
  category: "general",
  description: "Your base collection rate",
  longDescription:
    "Increases your idle production at all times. Each level raises your always-on multiplier. There are no downsides to this.",
  valueDescription: "%s",
  zeroLevel: { cost: 0, value: 1 },
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
  name: "Base Collection Rate Boost",
  icon: "gauge",
  description: "A little boost to the base collection rate",
  longDescription:
    "Increases your idle production at all times. Each level raises your always-on multiplier. This stacks with the base multiplier upgrade.",
  valueDescription: "%s",
  levels: [
    { cost: 60, value: 0.05 },
    { cost: 120, value: 0.1 },
    { cost: 300, value: 0.15 },
    { cost: 30 * 60, value: 0.2 },
    { cost: SECONDS_PER_HOUR, value: 0.25 },
    { cost: 2 * SECONDS_PER_HOUR, value: 0.3 },
    { cost: 5 * SECONDS_PER_HOUR, value: 0.35 },
    { cost: 10 * SECONDS_PER_HOUR, value: 0.4 },
    { cost: 24 * SECONDS_PER_HOUR, value: 0.45 },
    { cost: 48 * SECONDS_PER_HOUR, value: 0.5 },
    { cost: 1 * SECONDS_PER_WEEK, value: 0.55 },
    { cost: 2 * SECONDS_PER_WEEK, value: 0.6 },
    { cost: 4 * SECONDS_PER_WEEK, value: 0.65 },
    { cost: 7 * SECONDS_PER_WEEK, value: 0.7 },
    { cost: 10 * SECONDS_PER_WEEK, value: 0.75 },
    { cost: 20 * SECONDS_PER_WEEK, value: 0.8 },
    { cost: 30 * SECONDS_PER_WEEK, value: 0.85 },
    { cost: 40 * SECONDS_PER_WEEK, value: 0.9 },
    { cost: 52 * SECONDS_PER_WEEK, value: 0.95 },
    { cost: 2 * SECONDS_PER_YEAR, value: 1.0 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const PATIENCE_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.PATIENCE,
  name: "Patience",
  icon: "hourglass",
  category: "relaxed",
  description: "Bonus that increases for longer collections",
  longDescription:
    "This idle multiplier increases over time up to a certain limit. The longer you wait before collecting the higher the bonus will be up to a maximum. The earlier bonuses always apply, so more patience is always better.",
  valueDescription: "%sx at %s",
  levels: [
    { cost: 60, value: 0.25, value2: 60 },
    { cost: 5 * 60, value: 0.5, value2: 10 * 60 },
    { cost: SECONDS_PER_HOUR, value: 0.75, value2: SECONDS_PER_HOUR },
    { cost: 5 * SECONDS_PER_HOUR, value: 1, value2: 3 * SECONDS_PER_HOUR },
    { cost: SECONDS_PER_DAY, value: 2, value2: 6 * SECONDS_PER_HOUR },
    { cost: 4 * SECONDS_PER_DAY, value: 3, value2: SECONDS_PER_DAY },
    { cost: 14 * SECONDS_PER_DAY, value: 4, value2: SECONDS_PER_WEEK },
    { cost: SECONDS_PER_YEAR, value: 9, value2: 4 * SECONDS_PER_WEEK },
    { cost: 2 * SECONDS_PER_YEAR, value: 14, value2: SECONDS_PER_YEAR }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  icon: "shield-alert",
  category: "relaxed",
  description: "Idle time bonus that blocks quick collections.",
  longDescription:
    "Adds a constant idle multiplier, but enforces a minimum real-time wait before collecting. Collecting too early is blocked, trading flexibility for a higher payout.",
  valueDescription: "%s, collect after %s hours",
  levels: [
    { cost: 6 * SECONDS_PER_HOUR, value: 0.1, value2: 1 },
    { cost: 12 * SECONDS_PER_HOUR, value: 0.2, value2: 2 },
    { cost: 24 * SECONDS_PER_HOUR, value: 0.3, value2: 6 },
    { cost: 2 * SECONDS_PER_DAY, value: 0.4, value2: 12 },
    { cost: 7 * SECONDS_PER_DAY, value: 0.5, value2: 24 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  icon: "dice-5",
  description: "Chance to not reset time when collecting",
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
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const EXTRA_REALTIME_WAIT_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT,
  name: "Time skip",
  icon: "hourglass",
  category: "cheats",
  description: "Add %s realtime to your current collection",
  longDescription:
    "Spend a time gem to instantly extend the current run's real-time wait by a fixed amount. This can increase the current uncollected idle value without waiting in real time.",
  valueDescription: null,
  levels: [{ cost: 1, value: REALTIME_WAIT_EXTENSION_SECONDS }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

/** Five levels: gem costs 1, 2, 4, 8, 16. `value` = bonus over ×1 (effective multiplier is 1 + value; see `getCollectGemIdleSecondsMultiplier` in `shop.ts`). */
export const COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST,
  name: "Idle boost",
  icon: "timer",
  category: "cheats",
  description: "Apply a temporary idle multiplier",
  longDescription:
    "Temporarily boosts your next collection. On the next collection this bonus will be reset.",
  valueDescription: "%s",
  zeroLevel: { cost: 0, value: 0 },
  levels: [
    { cost: 1, value: 0.25 },
    { cost: 2, value: 0.5 },
    { cost: 4, value: 0.75 },
    { cost: 8, value: 1 },
    { cost: 16, value: 1.25 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

export const IDLE_REFUND_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.IDLE_REFUND,
  name: "Idle refund",
  icon: "undo-2",
  category: "refunds",
  description: "Refund idle time spent on idle-priced upgrades",
  longDescription:
    "Spend a time gem to reset idle-priced shop upgrades and return the idle time you spent on them.",
  valueDescription: null,
  levels: [{ cost: 1, value: 0 }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

export const REAL_REFUND_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.REAL_REFUND,
  name: "Real refund",
  icon: "undo-2",
  category: "refunds",
  description: "Refund real time spent on real-priced upgrades",
  longDescription:
    "Spend a time gem to reset real-priced shop upgrades and return the real time you spent on them.",
  valueDescription: null,
  levels: [{ cost: 1, value: 0 }],
  currencyType: SHOP_CURRENCY_TYPES.GEM
});

/**
 * Each tier raises the ceiling on boosted idle you can hold: uncollected idle is `min` of the full boosted integral and
 * the boosted integral at {@link getMaxIdleCollectionRealtimeSeconds} of real time. `levels[i].value` is that cap in seconds.
 */
export const STORAGE_EXTENSION_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.STORAGE_EXTENSION,
  name: "Temporal expanse",
  icon: "archive",
  description: "Raise the maximum idle time that can be collected",
  longDescription:
    "Without upgrades, only two weeks of real time since your last collection counts toward your uncollected idle bar; after that, gains stop until you collect. Each tier adds another 2 weeks to that limit.",
  valueDescription: "Up to %s stored",
  levels: [
    { cost: SECONDS_PER_HOUR, value: 4 * SECONDS_PER_WEEK },
    { cost: SECONDS_PER_DAY, value: 6 * SECONDS_PER_WEEK },
    { cost: 2 * SECONDS_PER_DAY, value: 8 * SECONDS_PER_WEEK },
    { cost: 3 * SECONDS_PER_DAY, value: 10 * SECONDS_PER_WEEK },
    { cost: 4 * SECONDS_PER_DAY, value: 12 * SECONDS_PER_WEEK },
    { cost: 5 * SECONDS_PER_DAY, value: 14 * SECONDS_PER_WEEK },
    { cost: 6 * SECONDS_PER_DAY, value: 16 * SECONDS_PER_WEEK },
    { cost: 7 * SECONDS_PER_DAY, value: 18 * SECONDS_PER_WEEK },
    { cost: 8 * SECONDS_PER_DAY, value: 20 * SECONDS_PER_WEEK },
    { cost: 9 * SECONDS_PER_DAY, value: 22 * SECONDS_PER_WEEK },
    { cost: 10 * SECONDS_PER_DAY, value: 24 * SECONDS_PER_WEEK }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

/** Ten levels: bonus per achievement rises by 0.02 per level, from 0.02 to 0.2; multiplier is 1 + value × achievementCount. */
export const WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS,
  name: "Worthwhile Achievements",
  icon: "trophy",
  category: "general",
  description: "Idle time bonus that increases with each achievement unlocked",
  longDescription:
    "Adds an idle multiplier that scales with your unlocked achievements. Each level increases the per-achievement bonus, making achievement progress directly improve income.",
  valueDescription: "%s",
  zeroLevel: { cost: 0, value: 0.01 },
  levels: [
    { cost: 2 * SECONDS_PER_HOUR, value: 0.02 },
    { cost: 5 * SECONDS_PER_HOUR, value: 0.03 },
    { cost: 16 * SECONDS_PER_HOUR, value: 0.04 },
    { cost: SECONDS_PER_DAY, value: 0.05 },
    { cost: 2 * SECONDS_PER_DAY, value: 0.06 },
    { cost: SECONDS_PER_WEEK, value: 0.07 },
    { cost: 2 * SECONDS_PER_WEEK, value: 0.08 },
    { cost: 4 * SECONDS_PER_WEEK, value: 0.09 },
    { cost: 10 * SECONDS_PER_WEEK, value: 0.1 },
    { cost: 26 * SECONDS_PER_WEEK, value: 0.11 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

/** Bonus per player level (additive to effective rate, same stacking as worthwhile achievements). */
export const LEVEL_BONUS_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.LEVEL_BONUS,
  name: "Level bonus",
  icon: "badge-plus",
  category: "general",
  description: "Idle multiplier that scales with your player level",
  longDescription:
    "Each tier increases how much idle bonus you earn per player level. Raise your player level and purchase tiers here to compound idle income.",
  valueDescription: "%s per player level",
  zeroLevel: { cost: 0, value: 0.1 },
  levels: [
    { cost: 1, value: 0.2 },
    { cost: 1, value: 0.3 },
    { cost: 1, value: 0.4 },
    { cost: 1, value: 0.5 },
    { cost: 1, value: 0.6 },
    { cost: 1, value: 0.7 },
    { cost: 1, value: 0.8 },
    { cost: 1, value: 0.9 },
    { cost: 1, value: 0.1 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

/** `value` = multiplier at full streak; `value2` = wall-clock seconds without idle/real shop purchases to reach it (linear from ×1). */
export const ANTI_CONSUMERIST_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.ANTI_CONSUMERIST,
  name: "Anti-consumerist",
  icon: "leaf",
  category: "utility",
  description: "Bonus for not making recent shop purchases.",
  longDescription:
    "Raises your idle multiplier the longer you go without buying any shop upgrade priced in idle time or real time. Gem-priced purchases do not reset this streak. Each tier sets the maximum multiplier and how long it takes to reach it; progress scales linearly from ×1.",
  valueDescription: "%sx after %s without idle or real shop purchases",
  levels: [
    { cost: 2 * SECONDS_PER_HOUR, value: 0.1, value2: SECONDS_PER_HOUR },
    { cost: 6 * SECONDS_PER_HOUR, value: 0.2, value2: 6 * SECONDS_PER_HOUR },
    { cost: 18 * SECONDS_PER_HOUR, value: 0.3, value2: SECONDS_PER_DAY },
    { cost: SECONDS_PER_DAY, value: 0.4, value2: 2 * SECONDS_PER_DAY },
    { cost: 2 * SECONDS_PER_DAY, value: 0.5, value2: 4 * SECONDS_PER_DAY },
    { cost: 5 * SECONDS_PER_DAY, value: 0.6, value2: SECONDS_PER_WEEK },
    { cost: 10 * SECONDS_PER_DAY, value: 0.7, value2: 2 * SECONDS_PER_WEEK },
    { cost: 20 * SECONDS_PER_DAY, value: 0.8, value2: 4 * SECONDS_PER_WEEK },
    { cost: 40 * SECONDS_PER_DAY, value: 0.9, value2: 8 * SECONDS_PER_WEEK },
    { cost: 26 * SECONDS_PER_WEEK, value: 1.0, value2: SECONDS_PER_YEAR }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

/**
 * `value` = additive rate bonus when the count from `countIdleShopUpgradeTypesForConsolidation` (in `shop.ts`) is at most `value2`.
 * Other idle-priced upgrades with at least one tier purchased count; Consolidation itself does not.
 */
export const CONSOLIDATION_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.CONSOLIDATION,
  name: "Consolidation",
  icon: "layers",
  category: "utility",
  description: "Bonus when focusing idle shop purchases",
  longDescription:
    "Rewards specializing in a small set of idle-priced shop upgrades. The Consolidation upgrade itself does not count toward that limit.",
  valueDescription: "+%s, max %s other idle shop upgrade types",
  levels: [
    { cost: 2 * SECONDS_PER_HOUR, value: 0.25, value2: 1 },
    { cost: 2 * SECONDS_PER_HOUR, value: 0.5, value2: 1 },
    { cost: 2 * SECONDS_PER_HOUR, value: 0.75, value2: 1 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.0, value2: 1 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.0, value2: 2 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.25, value2: 2 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.5, value2: 2 },
    { cost: 2 * SECONDS_PER_HOUR, value: 1.75, value2: 2 },
    { cost: 2 * SECONDS_PER_HOUR, value: 2.0, value2: 2 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

export const QUICK_COLLECTOR_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.QUICK_COLLECTOR,
  name: "Constant clicker",
  icon: "zap",
  category: "frantic",
  description: "Gain a bonus when being impatient",
  longDescription:
    "Adds an idle multiplier bonus only while your current run has accrued less than a set amount of real time since your last collect. After that cutoff, this bonus does nothing until you collect again. Suited to frequent short sessions.",
  valueDescription: "%s when less than %s real time",
  levels: [
    { cost: 1, value: 0.5, value2: 2 * SECONDS_PER_HOUR },
    { cost: 1, value: 1.0, value2: 2 * SECONDS_PER_HOUR },
    { cost: 1, value: 1.5, value2: 2 * SECONDS_PER_HOUR },
    { cost: 1, value: 2.0, value2: SECONDS_PER_HOUR },
    { cost: 1, value: 2.5, value2: SECONDS_PER_HOUR },
    { cost: 1, value: 3.0, value2: SECONDS_PER_HOUR },
    { cost: 1, value: 3.5, value2: 30 * SECONDS_PER_MINUTE },
    { cost: 1, value: 4.0, value2: 30 * SECONDS_PER_MINUTE }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
});

/** APR percent used for realtime-balance idle interest: simple interest = `realTimeAvailable * (apr / 100) * (elapsed / year)` */
export const INTEREST_SHOP_UPGRADE: ShopUpgradeDefinition = defineShopUpgrade({
  id: SHOP_UPGRADE_IDS.INTEREST,
  name: "Interest",
  icon: "banknote-arrow-up",
  description: "Earn idle time interest from your stored real time",
  longDescription:
    "Converts your available real-time balance into extra idle time using an APR. Interest is simple (non-compounding) and scales linearly with elapsed real time since your last collection.",
  valueDescription: "%s% APR",
  zeroLevel: { cost: 0, value: 0 },
  levels: [
    { cost: 1, value: 100 },
    { cost: 1, value: 200 },
    { cost: 1, value: 300 },
    { cost: 1, value: 400 },
    { cost: 1, value: 500 },
    { cost: 1, value: 600 },
    { cost: 1, value: 700 },
    { cost: 1, value: 800 },
    { cost: 1, value: 900 },
    { cost: 1, value: 1000 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
});

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  PATIENCE_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  STORAGE_EXTENSION_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE,
  WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  LEVEL_BONUS_SHOP_UPGRADE,
  QUICK_COLLECTOR_SHOP_UPGRADE,
  INTEREST_SHOP_UPGRADE,
  ANTI_CONSUMERIST_SHOP_UPGRADE,
  CONSOLIDATION_SHOP_UPGRADE,
  EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  IDLE_REFUND_SHOP_UPGRADE,
  REAL_REFUND_SHOP_UPGRADE
];

export const LEGACY_SHOP_UPGRADES: LegacyShopUpgradeDefinition[] = [];

export const LEGACY_SHOP_UPGRADES_BY_ID: Record<string, LegacyShopUpgradeDefinition> = {};

export const SHOP_UPGRADES_BY_ID: Record<ShopUpgradeId, ShopUpgradeDefinition> = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.ANOTHER_SECONDS_MULTIPLIER]: ANOTHER_SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.PATIENCE]: PATIENCE_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.RESTRAINT]: RESTRAINT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LUCK]: LUCK_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT]: EXTRA_REALTIME_WAIT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST]: COLLECT_GEM_TIME_BOOST_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.IDLE_REFUND]: IDLE_REFUND_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.REAL_REFUND]: REAL_REFUND_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS]: WORTHWHILE_ACHIEVEMENTS_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LEVEL_BONUS]: LEVEL_BONUS_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.STORAGE_EXTENSION]: STORAGE_EXTENSION_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.ANTI_CONSUMERIST]: ANTI_CONSUMERIST_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.CONSOLIDATION]: CONSOLIDATION_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.QUICK_COLLECTOR]: QUICK_COLLECTOR_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.INTEREST]: INTEREST_SHOP_UPGRADE
};

export function getShopUpgradeDefinition(upgradeType: string): ShopUpgradeDefinition | null {
  return SHOP_UPGRADES_BY_ID[upgradeType as ShopUpgradeId] ?? null;
}

export function isLegacyShopUpgradeId(upgradeType: string): boolean {
  return Boolean(LEGACY_SHOP_UPGRADES_BY_ID[upgradeType]);
}