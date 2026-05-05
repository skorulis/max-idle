import { describe, expect, it } from "vitest";
import {
  getIdleShopCostTable,
  getRealShopCostTable,
  getShopCurrencyCostAtPurchaseIndex,
  getShopCurrencyTierPurchaseCostSum,
  getTotalShopCurrencySpentForPurchaseCount
} from "./shopCurrencyCostTable.js";
import { SHOP_CURRENCY_TYPES } from "./shopUpgrades.js";
import { SECONDS_PER_HOUR, SECONDS_PER_DAY } from "./timeConstants.js";

describe("shop currency cost table", () => {
  it("exposes one shared sequence for idle and real", () => {
    const idle = getIdleShopCostTable();
    const real = getRealShopCostTable();
    expect(idle).toBe(real);
  });

  it("matches absolute costs at segment boundaries", () => {
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.IDLE, 0)).toBe(15);
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.REAL, 6)).toBe(SECONDS_PER_HOUR);
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.IDLE, 7)).toBe(2 * SECONDS_PER_HOUR);
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.REAL, 8)).toBe(3 * SECONDS_PER_HOUR);

    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.REAL, 17)).toBe(21 * SECONDS_PER_HOUR);
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.REAL, 28)).toBe(5 * SECONDS_PER_DAY);
  });

  it("sums refunds from absolute slice totals", () => {
    expect(getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.IDLE, 0)).toBe(0);
    expect(getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.IDLE, 5)).toBe(15 + 30 + 60 + 300 + 600);
    expect(getTotalShopCurrencySpentForPurchaseCount(SHOP_CURRENCY_TYPES.REAL, 3)).toBe(15 + 30 + 60);
  });

  it("computes bundle purchase cost from consecutive indices", () => {
    expect(getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.IDLE, 2, 6)).toBe(13560);
    expect(getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.REAL, 50, 4)).toBe(
      155865600
    );
  });

  it("returns 0 for gem currency queries", () => {
    expect(getShopCurrencyCostAtPurchaseIndex(SHOP_CURRENCY_TYPES.GEM, 0)).toBe(0);
    expect(getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.GEM, 0, 3)).toBe(0);
  });
});
