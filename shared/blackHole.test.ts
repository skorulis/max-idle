import { describe, expect, it } from "vitest";
import { DEFAULT_RESEARCH_STATE } from "./research.js";
import { RESEARCH_ITEM_IDS } from "./researchItems.js";
import {
  getBlackholeDailyFeedLimit,
  getBlackholeFeedSecondsPerTap,
  getBlackholeFeedsRemainingToday,
  getBlackholeFeedsToday,
  getBlackholeFeedSeconds,
  getBlackHoleTimeDilation,
  getUtcDayStartMs
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

describe("getBlackholeDailyFeedLimit", () => {
  it("uses base daily feeds at research level 0", () => {
    expect(getBlackholeDailyFeedLimit(DEFAULT_RESEARCH_STATE)).toBe(10);
  });

  it("adds one feed per completed research level", () => {
    expect(
      getBlackholeDailyFeedLimit({
        ...DEFAULT_RESEARCH_STATE,
        levels: { [RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]: 3 }
      })
    ).toBe(13);
  });
});

describe("getBlackholeFeedsToday", () => {
  const defaultLimit = getBlackholeDailyFeedLimit(DEFAULT_RESEARCH_STATE);

  it("returns 0 when no feed day is stored", () => {
    expect(getBlackholeFeedsToday(40, null, Date.UTC(2026, 4, 20, 12), defaultLimit)).toBe(0);
  });

  it("resets when feed day is before current UTC day", () => {
    const yesterday = new Date(Date.UTC(2026, 4, 19, 0));
    const todayNoon = Date.UTC(2026, 4, 20, 12);
    expect(getBlackholeFeedsToday(40, yesterday, todayNoon, defaultLimit)).toBe(0);
  });

  it("returns stored count for the current UTC day", () => {
    const todayStart = new Date(getUtcDayStartMs(Date.UTC(2026, 4, 20, 15)));
    expect(getBlackholeFeedsToday(8, todayStart, Date.UTC(2026, 4, 20, 23), defaultLimit)).toBe(8);
    expect(
      getBlackholeFeedsRemainingToday(8, todayStart, Date.UTC(2026, 4, 20, 23), defaultLimit)
    ).toBe(defaultLimit - 8);
  });
});

describe("getBlackholeFeedSecondsPerTap", () => {
  it("uses base feed amount at research level 0", () => {
    expect(getBlackholeFeedSecondsPerTap(DEFAULT_RESEARCH_STATE)).toBe(60);
  });

  it("adds 60 seconds per completed research level", () => {
    expect(
      getBlackholeFeedSecondsPerTap({
        ...DEFAULT_RESEARCH_STATE,
        levels: { [RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT]: 2 }
      })
    ).toBe(180);
  });
});

describe("getBlackholeFeedSeconds", () => {
  it("returns feed amount per tap times tap count", () => {
    const perTap = getBlackholeFeedSecondsPerTap(DEFAULT_RESEARCH_STATE);
    expect(getBlackholeFeedSeconds(1, DEFAULT_RESEARCH_STATE)).toBe(perTap);
    expect(getBlackholeFeedSeconds(3, DEFAULT_RESEARCH_STATE)).toBe(perTap * 3);
  });

  it("floors fractional taps and clamps negatives to zero", () => {
    const perTap = getBlackholeFeedSecondsPerTap(DEFAULT_RESEARCH_STATE);
    expect(getBlackholeFeedSeconds(2.9, DEFAULT_RESEARCH_STATE)).toBe(perTap * 2);
    expect(getBlackholeFeedSeconds(-5, DEFAULT_RESEARCH_STATE)).toBe(0);
  });
});
