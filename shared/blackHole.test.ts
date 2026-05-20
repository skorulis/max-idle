import { describe, expect, it } from "vitest";
import {
  BLACKHOLE_FEED_SECONDS_PER_TAP,
  getBlackholeFeedSeconds,
  getBlackHoleTimeDilation
} from "./blackHole.js";

describe("getBlackHoleTimeDilation", () => {
  it("returns 1 at zero invested time", () => {
    expect(getBlackHoleTimeDilation(0)).toBe(1);
  });

  it("clamps negative time to zero", () => {
    expect(getBlackHoleTimeDilation(-100)).toBe(1);
  });

  it("increases with invested time", () => {
    expect(getBlackHoleTimeDilation(36)).toBeCloseTo(Math.log10(11), 10);
    expect(getBlackHoleTimeDilation(360)).toBeCloseTo(Math.log10(20), 10);
  });

  it("never drops below 1", () => {
    expect(getBlackHoleTimeDilation(0)).toBeGreaterThanOrEqual(1);
    expect(getBlackHoleTimeDilation(1_000_000)).toBeGreaterThanOrEqual(1);
  });
});

describe("getBlackholeFeedSeconds", () => {
  it("returns 10 minutes per tap", () => {
    expect(getBlackholeFeedSeconds(1)).toBe(BLACKHOLE_FEED_SECONDS_PER_TAP);
    expect(getBlackholeFeedSeconds(3)).toBe(BLACKHOLE_FEED_SECONDS_PER_TAP * 3);
  });

  it("floors fractional taps and clamps negatives to zero", () => {
    expect(getBlackholeFeedSeconds(2.9)).toBe(BLACKHOLE_FEED_SECONDS_PER_TAP * 2);
    expect(getBlackholeFeedSeconds(-5)).toBe(0);
  });
});
