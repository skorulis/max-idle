import { describe, expect, it } from "vitest";
import { formatSeconds } from "./formatSeconds";

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

  it("formats larger values across years to seconds", () => {
    const oneYearOneWeekOneDayOneHourOneMinuteOneSecond = 365 * 24 * 60 * 60 + 7 * 24 * 60 * 60 + 24 * 60 * 60 + 3600 + 60 + 1;
    expect(formatSeconds(oneYearOneWeekOneDayOneHourOneMinuteOneSecond)).toBe("1y 1w 1d 1h 1m 1s");
  });

  it("omits zero-value higher units", () => {
    expect(formatSeconds(7 * 24 * 60 * 60)).toBe("1w");
    expect(formatSeconds(7 * 24 * 60 * 60 + 60)).toBe("1w 1m");
  });
});
