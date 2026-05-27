import { describe, expect, it } from "vitest";
import { SHOP_CURRENCY_TYPES } from "./shopUpgrades";
import {
  isShopCurrencyPathSegment,
  parseShopCurrencyPathSegment,
  shopPathForCurrency
} from "./shopPaths";

describe("shopPaths", () => {
  it("maps currency types to shop URLs", () => {
    expect(shopPathForCurrency(SHOP_CURRENCY_TYPES.IDLE)).toBe("/shop/idle");
    expect(shopPathForCurrency(SHOP_CURRENCY_TYPES.REAL)).toBe("/shop/real");
    expect(shopPathForCurrency(SHOP_CURRENCY_TYPES.GEM)).toBe("/shop/gem");
  });

  it("parses valid path segments", () => {
    expect(parseShopCurrencyPathSegment("idle")).toBe(SHOP_CURRENCY_TYPES.IDLE);
    expect(parseShopCurrencyPathSegment("gem")).toBe(SHOP_CURRENCY_TYPES.GEM);
  });

  it("rejects invalid path segments", () => {
    expect(parseShopCurrencyPathSegment(undefined)).toBeNull();
    expect(parseShopCurrencyPathSegment("gems")).toBeNull();
    expect(isShopCurrencyPathSegment("idle")).toBe(true);
    expect(isShopCurrencyPathSegment("foo")).toBe(false);
  });
});
