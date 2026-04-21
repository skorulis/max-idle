import { describe, expect, it } from "vitest";
import { calculateIdleSecondsGain, getIdleSecondsRate } from "./idleRate";

describe("getIdleSecondsRate", () => {
  it("matches all configured step values", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 0 })).toBe(1);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60 })).toBe(2);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 10 * 60 })).toBe(4);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 60 * 60 })).toBe(6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 6 * 60 * 60 })).toBe(8);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 24 * 60 * 60 })).toBe(16);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 7 * 24 * 60 * 60 })).toBe(32);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 4 * 7 * 24 * 60 * 60 })).toBe(64);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 365 * 24 * 60 * 60 })).toBe(128);
  });

  it("interpolates linearly between steps and caps at max", () => {
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 30 })).toBeCloseTo(1.5, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 330 })).toBeCloseTo(3, 6);
    expect(getIdleSecondsRate({ secondsSinceLastCollection: 2 * 365 * 24 * 60 * 60 })).toBe(128);
  });
});

describe("calculateIdleSecondsGain", () => {
  it("integrates linearly changing rate", () => {
    expect(calculateIdleSecondsGain(60)).toBe(90);
    expect(calculateIdleSecondsGain(10 * 60)).toBe(1710);
  });
});
