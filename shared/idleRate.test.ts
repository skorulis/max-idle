import { describe, expect, it } from "vitest";
import {
  calculateBoostedIdleSecondsGain,
  getEffectiveIdleSecondsRate,
  getPatienceRate,
  isIdleCollectionBlockedByRestraint,
  shouldPreserveIdleTimerOnCollect
} from "./idleRate.js";
import { DEFAULT_SHOP_STATE, getMaxIdleCollectionRealtimeSeconds } from "./shop.js";
import type { ShopState } from "./shop.js";

function shopWithPatience(patience: number): ShopState {
  return {
    ...DEFAULT_SHOP_STATE,
    patience
  };
}

function idleCollectionPlayer(secondsSinceLastCollection: number, shop: ShopState) {
  return {
    secondsSinceLastCollection,
    shop,
    achievementCount: 0,
    realTimeAvailable: 0
  };
}

describe("getPatienceRate", () => {
  it("starts with only the first rate step unlocked", () => {
    expect(getPatienceRate(idleCollectionPlayer(0, shopWithPatience(0)))).toBe(0);
    expect(getPatienceRate(idleCollectionPlayer(60, shopWithPatience(0)))).toBe(0);
    expect(getPatienceRate(idleCollectionPlayer(365 * 24 * 60 * 60, shopWithPatience(0)))).toBe(0);
  });

  it("unlocks one additional step per patience level", () => {
    expect(getPatienceRate(idleCollectionPlayer(60, shopWithPatience(1)))).toBe(0.25);
    expect(getPatienceRate(idleCollectionPlayer(10 * 60, shopWithPatience(2)))).toBe(0.5);
    expect(getPatienceRate(idleCollectionPlayer(60 * 60, shopWithPatience(3)))).toBe(0.75);
    expect(getPatienceRate(idleCollectionPlayer(6 * 60 * 60, shopWithPatience(4)))).toBe(1);
    expect(getPatienceRate(idleCollectionPlayer(24 * 60 * 60, shopWithPatience(5)))).toBe(2);
    expect(getPatienceRate(idleCollectionPlayer(7 * 24 * 60 * 60, shopWithPatience(6)))).toBe(3);
    expect(getPatienceRate(idleCollectionPlayer(4 * 7 * 24 * 60 * 60, shopWithPatience(7)))).toBe(4);
    expect(getPatienceRate(idleCollectionPlayer(365 * 24 * 60 * 60, shopWithPatience(8)))).toBe(9);
  });

  it("interpolates linearly within unlocked steps and caps at unlocked max", () => {
    expect(getPatienceRate(idleCollectionPlayer(30, shopWithPatience(1)))).toBeCloseTo(0.125, 6);
    expect(getPatienceRate(idleCollectionPlayer(330, shopWithPatience(2)))).toBeCloseTo(0.375, 6);
    expect(getPatienceRate(idleCollectionPlayer(2 * 365 * 24 * 60 * 60, shopWithPatience(8)))).toBe(9);
    expect(getPatienceRate(idleCollectionPlayer(2 * 365 * 24 * 60 * 60, shopWithPatience(3)))).toBe(0.75);
  });
});

describe("isIdleCollectionBlockedByRestraint", () => {
  const baseShop = DEFAULT_SHOP_STATE;

  it("requires realtime equal to restraint tier value2 hours", () => {
    expect(
      isIdleCollectionBlockedByRestraint({
        secondsSinceLastCollection: 3599,
        shop: { ...baseShop, restraint: 1 }
      })
    ).toBe(true);
    expect(
      isIdleCollectionBlockedByRestraint({
        secondsSinceLastCollection: 3600,
        shop: { ...baseShop, restraint: 1 }
      })
    ).toBe(false);

    expect(
      isIdleCollectionBlockedByRestraint({
        secondsSinceLastCollection: 3600,
        shop: { ...baseShop, restraint: 2 }
      })
    ).toBe(true);
    expect(
      isIdleCollectionBlockedByRestraint({
        secondsSinceLastCollection: 7200,
        shop: { ...baseShop, restraint: 2 }
      })
    ).toBe(false);
  });
});

describe("luck + boosted gain", () => {
  it("preserves timer only when luck is enabled and roll succeeds", () => {
    expect(shouldPreserveIdleTimerOnCollect(DEFAULT_SHOP_STATE, 0.02)).toBe(false);
    expect(shouldPreserveIdleTimerOnCollect({ ...DEFAULT_SHOP_STATE, luck: 1 }, 0.02)).toBe(true);
    expect(shouldPreserveIdleTimerOnCollect({ ...DEFAULT_SHOP_STATE, luck: 1 }, 0.9)).toBe(false);
  });

  it("applies restraint/luck-aware boosted gain", () => {
    const gainWithRestraint = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { ...DEFAULT_SHOP_STATE, restraint: 1 },
      achievementCount: 0
    });
    expect(gainWithRestraint).toBe(Math.floor(66));
  });

  it("applies full idle hoarder tier multiplier when stored-realtime ratio meets the tier threshold", () => {
    const baseline = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: DEFAULT_SHOP_STATE,
      achievementCount: 0,
      realTimeAvailable: 0
    });
    const withIdleHoarderAtCap = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { ...DEFAULT_SHOP_STATE, idle_hoarder: 5 },
      achievementCount: 0,
      /** Level 5 needs stored/realtime ratio ≥ 3 (value2); 180/60 = 3 */
      realTimeAvailable: 180
    });
    expect(withIdleHoarderAtCap).toBe(Math.floor(baseline * 2.5));
  });

  it("stacks secondary multipliers additively (bonuses sum, not multiply)", () => {
    const elapsed = 60;
    const baseline = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: elapsed,
      shop: DEFAULT_SHOP_STATE,
      achievementCount: 0,
      realTimeAvailable: 0
    });
    const withRestraintOnly = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: elapsed,
      shop: { ...DEFAULT_SHOP_STATE, restraint: 1 },
      achievementCount: 0,
      realTimeAvailable: 0
    });
    const withBoth = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: elapsed,
      shop: { ...DEFAULT_SHOP_STATE, restraint: 1, idle_hoarder: 5 },
      achievementCount: 0,
      realTimeAvailable: 180
    });
    const restraintBonus = withRestraintOnly - baseline;
    const hoarderBonusAtCap = Math.floor(baseline * (1 + (2.5 - 1))) - baseline;
    expect(withBoth).toBe(baseline + restraintBonus + hoarderBonusAtCap);
  });

  it("does not increase boosted gain past the max wall-clock storage window", () => {
    const shop: ShopState = DEFAULT_SHOP_STATE;
    const week = 7 * 24 * 60 * 60;
    const capSeconds = getMaxIdleCollectionRealtimeSeconds(shop);
    const atCap = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: capSeconds,
      shop,
      achievementCount: 0
    });
    const wayPastCap = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 4 * week,
      shop,
      achievementCount: 0
    });
    expect(wayPastCap).toBe(atCap);
  });

  it("extends the storage window with storage_extension tiers", () => {
    const week = 7 * 24 * 60 * 60;
    const baseShop: ShopState = DEFAULT_SHOP_STATE;
    const extendedShop: ShopState = { ...baseShop, storage_extension: 1 };
    const elapsedPastBaseCap = 3 * week;
    const baseCapped = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: elapsedPastBaseCap,
      shop: baseShop,
      achievementCount: 0
    });
    const extendedUncapped = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: elapsedPastBaseCap,
      shop: extendedShop,
      achievementCount: 0
    });
    expect(extendedUncapped).toBeGreaterThan(baseCapped);
  });
});

describe("getEffectiveIdleSecondsRate", () => {
  it("tracks patience and multipliers from full elapsed time (not storage-capped like boosted gain)", () => {
    const shop: ShopState = { ...DEFAULT_SHOP_STATE, patience: 8 };
    const cap = getMaxIdleCollectionRealtimeSeconds(shop);
    const player = {
      secondsSinceLastCollection: cap,
      shop,
      achievementCount: 0,
      realTimeAvailable: 0
    };

    expect(getEffectiveIdleSecondsRate(player)).toBeCloseTo(1 + getPatienceRate(player), 10);
    expect(getEffectiveIdleSecondsRate(player)).toBeGreaterThan(0);
  });
});
