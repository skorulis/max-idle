import { describe, expect, it } from "vitest";
import { multiplierToLevel } from "./shop";
import { getIdleShopCostTable, getShopCurrencyTierPurchaseCostSum } from "./shop";
import { SECONDS_MULTIPLIER_SHOP_UPGRADE, SHOP_CURRENCY_TYPES } from "./shopUpgrades";

describe("shop pricing", () => {
  it("uses shared idle currency table for consecutive purchases", () => {
    expect(SECONDS_MULTIPLIER_SHOP_UPGRADE.costAtLevel(0)).toBe(0);
    const table = getIdleShopCostTable();
    expect(getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.IDLE, 0, 1)).toBe(table[0]);
    expect(getShopCurrencyTierPurchaseCostSum(SHOP_CURRENCY_TYPES.IDLE, 0, 5)).toBe(
      table.slice(0, 5).reduce((s, c) => s + c, 0)
    );
  });
});

describe("multiplierToLevel", () => {
  it("derives level from multiplier", () => {
    expect(multiplierToLevel(1)).toBe(0);
    expect(multiplierToLevel(1.4)).toBe(8);
  });
});
