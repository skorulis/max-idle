import { describe, expect, it } from "vitest";
import {
  calculateBoostedIdleSecondsGain,
  calculateIdleSecondsGain,
  getIdleSecondsRate,
  shouldPreserveIdleTimerOnCollect
} from "./idleRate.js";
import type { ShopState } from "./shop.js";

function shopWithPatience(patience: number): ShopState {
  return {
    seconds_multiplier: 0,
    restraint: 0,
    idle_hoarder: 0,
    luck: 0,
    patience
  };
}

describe("getIdleSecondsRate", () => {
  it("starts with only the first rate step unlocked", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 0, shop: shopWithPatience(0) })).toBe(1);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60, shop: shopWithPatience(0) })).toBe(1);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 365 * 24 * 60 * 60, shop: shopWithPatience(0) })).toBe(1);
  });

  it("unlocks one additional step per patience level", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60, shop: shopWithPatience(1) })).toBe(2);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 10 * 60, shop: shopWithPatience(2) })).toBe(3);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60 * 60, shop: shopWithPatience(3) })).toBe(5);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 6 * 60 * 60, shop: shopWithPatience(4) })).toBe(8);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 24 * 60 * 60, shop: shopWithPatience(5) })).toBe(12);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 7 * 24 * 60 * 60, shop: shopWithPatience(6) })).toBe(15);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 4 * 7 * 24 * 60 * 60, shop: shopWithPatience(7) })).toBe(20);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 365 * 24 * 60 * 60, shop: shopWithPatience(8) })).toBe(30);
  });

  it("interpolates linearly within unlocked steps and caps at unlocked max", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 30, shop: shopWithPatience(1) })).toBeCloseTo(1.5, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 330, shop: shopWithPatience(2) })).toBeCloseTo(2.5, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 2 * 365 * 24 * 60 * 60, shop: shopWithPatience(8) })).toBe(30);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 2 * 365 * 24 * 60 * 60, shop: shopWithPatience(3) })).toBe(5);
  });
});

describe("calculateIdleSecondsGain", () => {
  it("integrates linearly changing rate", () => {
    const fullPatienceShop = shopWithPatience(8);
    // 0 -> 60s ramps 1x -> 2x, average 1.5x => 90 gained seconds.
    expect(calculateIdleSecondsGain(60, fullPatienceShop)).toBe(90);

    // 60 -> 600s ramps 2x -> 3x, average 2.5x across 540s => +1350, total 1440.
    expect(calculateIdleSecondsGain(10 * 60, fullPatienceShop)).toBe(1440);
  });
});

describe("luck + boosted gain", () => {
  it("preserves timer only when luck is enabled and roll succeeds", () => {
    expect(shouldPreserveIdleTimerOnCollect({ seconds_multiplier: 0, restraint: 0, luck: 0 }, 0.1)).toBe(false);
    expect(shouldPreserveIdleTimerOnCollect({ seconds_multiplier: 0, restraint: 0, luck: 1 }, 0.1)).toBe(true);
    expect(shouldPreserveIdleTimerOnCollect({ seconds_multiplier: 0, restraint: 0, luck: 1 }, 0.9)).toBe(false);
  });

  it("applies restraint/luck-aware boosted gain", () => {
    const gainWithoutRestraint = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 0, idle_hoarder: 0, luck: 0 },
      achievementCount: 0
    });
    expect(gainWithoutRestraint).toBeGreaterThan(0);

    const gainWithRestraint = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 1, idle_hoarder: 0, luck: 0 },
      achievementCount: 0
    });
    expect(gainWithRestraint).toBe(Math.floor(gainWithoutRestraint * 1.5));
  });

  it("applies idle hoarder multiplier last", () => {
    const baseline = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 0, idle_hoarder: 0, luck: 0 },
      achievementCount: 0,
      realTimeAvailable: 0
    });
    const withIdleHoarderAtCap = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 0, idle_hoarder: 5, luck: 0 },
      achievementCount: 0,
      realTimeAvailable: 120
    });
    expect(withIdleHoarderAtCap).toBe(Math.floor(baseline * 2.5));
  });
});
