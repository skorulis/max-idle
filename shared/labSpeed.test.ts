import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAB_SPEED_MULTIPLIER,
  getEffectiveLabElapsedMs,
  parseLabSpeedMultiplier
} from "./labSpeed.js";

describe("parseLabSpeedMultiplier", () => {
  it("defaults to 1 when unset", () => {
    expect(parseLabSpeedMultiplier(undefined)).toBe(DEFAULT_LAB_SPEED_MULTIPLIER);
    expect(parseLabSpeedMultiplier("")).toBe(DEFAULT_LAB_SPEED_MULTIPLIER);
    expect(parseLabSpeedMultiplier("   ")).toBe(DEFAULT_LAB_SPEED_MULTIPLIER);
  });

  it("parses positive numbers", () => {
    expect(parseLabSpeedMultiplier("10")).toBe(10);
    expect(parseLabSpeedMultiplier(" 2.5 ")).toBe(2.5);
  });

  it("rejects invalid values", () => {
    expect(() => parseLabSpeedMultiplier("0")).toThrow(/positive number/);
    expect(() => parseLabSpeedMultiplier("-1")).toThrow(/positive number/);
    expect(() => parseLabSpeedMultiplier("nope")).toThrow(/positive number/);
  });
});

describe("getEffectiveLabElapsedMs", () => {
  it("scales wall-clock elapsed by the multiplier", () => {
    expect(getEffectiveLabElapsedMs(5000, 2)).toBe(10_000);
    expect(getEffectiveLabElapsedMs(-100, 3)).toBe(0);
  });
});
