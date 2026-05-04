import { SHOP_CURRENCY_TYPES, SHOP_UPGRADES, type ShopCurrencyType } from "./shopUpgrades.js";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, SECONDS_PER_WEEK } from "./timeConstants.js";

type IncrementRule = {
  tierCount: number;
  incrementSeconds: number;
};

/**
 * Piecewise-linear costs: within each rule, every tier costs `previous + incrementSeconds`.
 * Between rules, the first tier of the next segment costs `lastTier + nextRule.incrementSeconds`.
 */
const SHOP_COST_TABLE_INCREMENT_RULES: readonly IncrementRule[] = [
  { tierCount: 1, incrementSeconds: 4 * SECONDS_PER_MINUTE },
  { tierCount: 1, incrementSeconds: 5 * SECONDS_PER_MINUTE },
  { tierCount: 1, incrementSeconds: 20 * SECONDS_PER_MINUTE },
  { tierCount: 1, incrementSeconds: 30 * SECONDS_PER_MINUTE }, // 1h
  { tierCount: 5, incrementSeconds: SECONDS_PER_HOUR }, // 2h - 6h
  { tierCount: 3, incrementSeconds: 2 * SECONDS_PER_HOUR }, // 8h - 12h
  { tierCount: 4, incrementSeconds: 3 * SECONDS_PER_HOUR }, // 15h - 24h
  { tierCount: 6, incrementSeconds: 8 * SECONDS_PER_HOUR }, // 24h - 72h
  { tierCount: 4, incrementSeconds: 12 * SECONDS_PER_HOUR }, // 84h - 120h
  { tierCount: 5, incrementSeconds: SECONDS_PER_DAY },
  { tierCount: 5, incrementSeconds: SECONDS_PER_WEEK },
  { tierCount: 5, incrementSeconds: 2 * SECONDS_PER_WEEK },
  { tierCount: 5, incrementSeconds: 4 * SECONDS_PER_WEEK },
  { tierCount: 5, incrementSeconds: 8 * SECONDS_PER_WEEK },
  { tierCount: 5, incrementSeconds: 12 * SECONDS_PER_WEEK }
];

function buildCostTableFromIncrementRules(
  seedSeconds: number,
  rules: readonly IncrementRule[],
  length: number
): { table: number[]; tailIncrementSeconds: number } {
  const out: number[] = [];
  let price = seedSeconds;
  const cap = Math.max(0, Math.floor(length));

  out.push(price);

  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r]!;
    for (let i = 0; i < rule.tierCount && out.length < cap; i++) {
      price += rule.incrementSeconds;
      out.push(price);
    }
  }

  const tailIncrementSeconds = rules[rules.length - 1]!.incrementSeconds;
  while (out.length < cap) {
    const next = out[out.length - 1]! + tailIncrementSeconds;
    out.push(Math.max(1, Math.round(next)));
  }
  return { table: out, tailIncrementSeconds };
}

export function getMaxShopPurchasesForCurrency(currencyType: ShopCurrencyType): number {
  let sum = 0;
  for (const u of SHOP_UPGRADES) {
    if (u.currencyType === currencyType) {
      sum += u.maxLevel();
    }
  }
  return sum;
}

const SHOP_COST_TABLE_LENGTH = Math.max(
  getMaxShopPurchasesForCurrency(SHOP_CURRENCY_TYPES.IDLE),
  getMaxShopPurchasesForCurrency(SHOP_CURRENCY_TYPES.REAL)
);

const { table: SHOP_COST_TABLE_BUILT, tailIncrementSeconds: SHOP_COST_TABLE_TAIL_INCREMENT } =
  buildCostTableFromIncrementRules(SECONDS_PER_MINUTE, SHOP_COST_TABLE_INCREMENT_RULES, SHOP_COST_TABLE_LENGTH);

const SHOP_COST_TABLE = Object.freeze(SHOP_COST_TABLE_BUILT);

function extrapolateCostAtIndex(table: readonly number[], index: number, tailIncrementSeconds: number): number {
  if (index < table.length) {
    return table[index] ?? 0;
  }
  if (table.length === 0) {
    return 0;
  }
  let last = table[table.length - 1] ?? 1;
  for (let i = table.length; i <= index; i++) {
    last = Math.max(1, Math.round(last + tailIncrementSeconds));
  }
  return last;
}

/** Cost for the single purchase that occurs when `globalPurchaseIndexBefore` tiers were already bought in this currency. */
export function getShopCurrencyCostAtPurchaseIndex(
  currencyType: ShopCurrencyType,
  globalPurchaseIndexBefore: number
): number {
  if (currencyType === SHOP_CURRENCY_TYPES.GEM) {
    return 0;
  }
  const idx = Math.max(0, Math.floor(globalPurchaseIndexBefore));
  return extrapolateCostAtIndex(SHOP_COST_TABLE, idx, SHOP_COST_TABLE_TAIL_INCREMENT);
}

/** Sum of costs for `quantity` consecutive purchases starting at global index `startIndex`. */
export function getShopCurrencyTierPurchaseCostSum(
  currencyType: ShopCurrencyType,
  startIndex: number,
  quantity: number
): number {
  if (currencyType === SHOP_CURRENCY_TYPES.GEM) {
    return 0;
  }
  let sum = 0;
  const q = Math.max(0, Math.floor(quantity));
  const start = Math.max(0, Math.floor(startIndex));
  for (let i = 0; i < q; i += 1) {
    sum += getShopCurrencyCostAtPurchaseIndex(currencyType, start + i);
  }
  return sum;
}

/** Total currency spent after `purchaseCount` tiers purchased (sum of indices `0 .. purchaseCount - 1`). Used for refunds. */
export function getTotalShopCurrencySpentForPurchaseCount(
  currencyType: ShopCurrencyType,
  purchaseCount: number
): number {
  return getShopCurrencyTierPurchaseCostSum(currencyType, 0, purchaseCount);
}

/** Idle- and real-priced shops share this cost sequence (same indices). */
export function getIdleShopCostTable(): readonly number[] {
  return SHOP_COST_TABLE;
}

export function getRealShopCostTable(): readonly number[] {
  return SHOP_COST_TABLE;
}
