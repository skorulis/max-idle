import { describe, expect, it } from "vitest";
import { getBlackHoleTimeDilation } from "./blackHole.js";

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
