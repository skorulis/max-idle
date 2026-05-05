import { describe, expect, it } from "vitest";
import type { ShopState } from "./shop.js";
import { DEFAULT_SHOP_STATE } from "./shop.js";
import {
  countIdleShopUpgradeTypesForConsolidation,
  getConsolidationBonus,
  SHOP_UPGRADE_IDS
} from "./shopUpgrades.js";

describe("Consolidation", () => {
  it("grants tier bonus when at most value2 other idle shop types are active", () => {
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      consolidation: 1,
      seconds_multiplier: 1,
    };
    expect(countIdleShopUpgradeTypesForConsolidation(shop)).toBe(1);
    expect(getConsolidationBonus(shop)).toBe(0.25);
  });

  it("does not count Consolidation toward the type limit", () => {
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      consolidation: 1,
      seconds_multiplier: 1,
      patience: 1,
      worthwhile_achievements: 1
    };
    expect(countIdleShopUpgradeTypesForConsolidation(shop)).toBe(3);
    expect(getConsolidationBonus(shop)).toBe(0);
  });

  it("returns 0 without Consolidation tier", () => {
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      seconds_multiplier: 1
    };
    expect(getConsolidationBonus(shop)).toBe(0);
  });

  it("other idle types use upgrade id list", () => {
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      [SHOP_UPGRADE_IDS.ANTI_CONSUMERIST]: 1
    };
    expect(countIdleShopUpgradeTypesForConsolidation(shop)).toBe(1);
  });
});
