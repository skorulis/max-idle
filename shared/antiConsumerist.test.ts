import { describe, expect, it } from "vitest";
import type { ShopState } from "./shop.js";
import { DEFAULT_SHOP_STATE, getAntiConsumeristMultiplier } from "./shop.js";
import { ANTI_CONSUMERIST_SHOP_UPGRADE } from "./shopUpgrades.js";

describe("getAntiConsumeristMultiplier", () => {
  it("returns 1 without upgrade level", () => {
    const shop: ShopState = { ...DEFAULT_SHOP_STATE, last_purchase: Math.floor(Date.now() / 1000) };
    expect(getAntiConsumeristMultiplier(shop, Date.now())).toBe(0);
  });

  it("returns 1 when wall clock ms is not finite", () => {
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      anti_consumerist: 1,
      last_purchase: Math.floor(Date.now() / 1000)
    };
    expect(getAntiConsumeristMultiplier(shop, Number.NaN)).toBe(0);
  });

  it("returns 1 without last_purchase", () => {
    const shop: ShopState = { ...DEFAULT_SHOP_STATE, anti_consumerist: 1 };
    expect(getAntiConsumeristMultiplier(shop, Date.now())).toBe(0);
  });

  it("ramps linearly from x1 and caps at tier value", () => {
    const tier = ANTI_CONSUMERIST_SHOP_UPGRADE.levels[0];
    const lastMs = Date.UTC(2024, 5, 1, 12, 0, 0);
    const shop: ShopState = {
      ...DEFAULT_SHOP_STATE,
      anti_consumerist: 1,
      last_purchase: Math.floor(lastMs / 1000)
    };
    const durationSec = tier.value2!;
    const maxBonus = tier.value;
    expect(getAntiConsumeristMultiplier(shop, lastMs)).toBe(0);
    expect(getAntiConsumeristMultiplier(shop, lastMs + (durationSec / 2) * 1000)).toBeCloseTo(maxBonus / 2, 6);
    expect(getAntiConsumeristMultiplier(shop, lastMs + durationSec * 1000)).toBe(maxBonus);
    expect(getAntiConsumeristMultiplier(shop, lastMs + durationSec * 10 * 1000)).toBe(maxBonus);
  });
});
