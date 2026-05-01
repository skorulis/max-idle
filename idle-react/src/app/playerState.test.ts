import { describe, expect, it } from "vitest";
import { getSecondsUntilNextUtcDayBoundary } from "./playerState";

describe("getSecondsUntilNextUtcDayBoundary", () => {
  it("returns whole seconds until the next UTC day boundary", () => {
    const utcNoon = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(getSecondsUntilNextUtcDayBoundary(utcNoon)).toBe(12 * 60 * 60);
  });
});
