import { describe, expect, it } from "vitest";
import { calculateElapsedSeconds } from "../src/time";

describe("calculateElapsedSeconds", () => {
  it("returns floored elapsed seconds", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-01T00:00:04.999Z");

    expect(calculateElapsedSeconds(from, to)).toBe(4);
  });

  it("clamps negative time differences to zero", () => {
    const from = new Date("2026-01-01T00:00:05.000Z");
    const to = new Date("2026-01-01T00:00:01.000Z");

    expect(calculateElapsedSeconds(from, to)).toBe(0);
  });
});
