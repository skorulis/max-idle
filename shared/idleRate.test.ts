import { describe, expect, it } from "vitest";
import {
  calculateBoostedIdleSecondsGain,
  calculateIdleSecondsGain,
  getIdleSecondsRate,
  shouldPreserveIdleTimerOnCollect
} from "./idleRate.js";

describe("getIdleSecondsRate", () => {
  it("matches all configured step values", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 0 })).toBe(1);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60 })).toBe(2);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 10 * 60 })).toBe(3);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60 * 60 })).toBe(5);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 6 * 60 * 60 })).toBe(8);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 24 * 60 * 60 })).toBe(12);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 7 * 24 * 60 * 60 })).toBe(15);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 4 * 7 * 24 * 60 * 60 })).toBe(20);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 365 * 24 * 60 * 60 })).toBe(30);
  });

  it("interpolates linearly between steps and caps at max", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 30 })).toBeCloseTo(1.5, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 330 })).toBeCloseTo(2.5, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 2 * 365 * 24 * 60 * 60 })).toBe(30);
  });
});

describe("calculateIdleSecondsGain", () => {
  it("integrates linearly changing rate", () => {
    // 0 -> 60s ramps 1x -> 2x, average 1.5x => 90 gained seconds.
    expect(calculateIdleSecondsGain(60)).toBe(90);

    // 60 -> 600s ramps 2x -> 3x, average 2.5x across 540s => +1350, total 1440.
    expect(calculateIdleSecondsGain(10 * 60)).toBe(1440);
  });
});

describe("luck + boosted gain", () => {
  it("preserves timer only when luck is enabled and roll succeeds", () => {
    expect(shouldPreserveIdleTimerOnCollect({ luck: 0 }, 0.1)).toBe(false);
    expect(shouldPreserveIdleTimerOnCollect({ luck: 1 }, 0.1)).toBe(true);
    expect(shouldPreserveIdleTimerOnCollect({ luck: 1 }, 0.9)).toBe(false);
  });

  it("applies restraint/luck-aware boosted gain", () => {
    const gainWithoutRestraint = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 0, luck: 0 },
      achievementBonusMultiplier: 1
    });
    expect(gainWithoutRestraint).toBeGreaterThan(0);

    const gainWithRestraint = calculateBoostedIdleSecondsGain({
      secondsSinceLastCollection: 60,
      shop: { seconds_multiplier: 0, restraint: 1, luck: 0 },
      achievementBonusMultiplier: 1
    });
    expect(gainWithRestraint).toBe(Math.floor(gainWithoutRestraint * 1.5));
  });
});
