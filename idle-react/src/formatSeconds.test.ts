import { describe, expect, it } from "vitest";
import { breakDownSeconds, formatSeconds } from "./formatSeconds";

describe("formatSeconds", () => {
  it("formats zero and negative values as 0s", () => {
    expect(formatSeconds(0)).toBe("0s");
    expect(formatSeconds(-5)).toBe("0s");
  });

  it("formats small values with lower units only", () => {
    expect(formatSeconds(59)).toBe("59s");
    expect(formatSeconds(61)).toBe("1m 1s");
    expect(formatSeconds(3661)).toBe("1h 1m 1s");
  });

  it("truncates output to a maximum number of units", () => {
    expect(formatSeconds(3661, 1)).toBe("1h");
    expect(formatSeconds(3661, 2)).toBe("1h 1m");
    expect(formatSeconds(3661, 10)).toBe("1h 1m 1s");
  });

  it("rounds the truncated remainder based on the selected mode", () => {
    expect(formatSeconds(3599, 1, "floor")).toBe("59m");
    expect(formatSeconds(3599, 1, "ceil")).toBe("1h");
    expect(formatSeconds(3569, 1, "round")).toBe("59m");
    expect(formatSeconds(3570, 1, "round")).toBe("1h");
  });

  it("formats larger values across years to seconds", () => {
    const oneYearOneWeekOneDayOneHourOneMinuteOneSecond = 365 * 24 * 60 * 60 + 7 * 24 * 60 * 60 + 24 * 60 * 60 + 3600 + 60 + 1;
    expect(formatSeconds(oneYearOneWeekOneDayOneHourOneMinuteOneSecond)).toBe("1y 1w 1d 1h 1m 1s");
  });

  it("omits zero-value higher units", () => {
    expect(formatSeconds(7 * 24 * 60 * 60)).toBe("1w");
    expect(formatSeconds(7 * 24 * 60 * 60 + 60)).toBe("1w 1m");
  });

  it("supports configurable rounding modes for fractional seconds", () => {
    expect(formatSeconds(59.6)).toBe("59s");
    expect(formatSeconds(59.6, undefined, "ceil")).toBe("1m");
    expect(formatSeconds(59.6, undefined, "round")).toBe("1m");
    expect(formatSeconds(59.6, undefined, "trunc")).toBe("59s");
  });
});

describe("breakDownSeconds", () => {
  it("decomposes zero", () => {
    expect(breakDownSeconds(0)).toEqual({
      years: 0,
      weeks: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    });
  });

  it("matches the units implied by formatSeconds for a mixed duration", () => {
    const oneYearOneWeekOneDayOneHourOneMinuteOneSecond =
      365 * 24 * 60 * 60 + 7 * 24 * 60 * 60 + 24 * 60 * 60 + 3600 + 60 + 1;
    expect(breakDownSeconds(oneYearOneWeekOneDayOneHourOneMinuteOneSecond)).toEqual({
      years: 1,
      weeks: 1,
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1
    });
  });

  it("uses floor for fractional input like formatSeconds", () => {
    expect(breakDownSeconds(59.9).seconds).toBe(59);
    expect(breakDownSeconds(59.9, "ceil").minutes).toBe(1);
  });
});
