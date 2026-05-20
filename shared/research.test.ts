import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESEARCH_STATE,
  changeResearch,
  formatResearchEffectProgression,
  getResearchDurationSeconds,
  getResearchLevel,
  getResearchProgress,
  getResearchSavedElapsedMs,
  getResearchTimeCost,
  reconcileResearchProgress,
  startResearch,
  stopResearch
} from "./research.js";
import {
  RESEARCH_BLACK_HOLE_DAILY_FEEDS,
  RESEARCH_BLACK_HOLE_FEED_AMOUNT,
  RESEARCH_ITEM_IDS
} from "./researchItems.js";

describe("formatResearchEffectProgression", () => {
  it("shows current and next formatted values when not at max", () => {
    expect(formatResearchEffectProgression(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)).toBe(
      "10 -> 11"
    );
  });

  it("shows a single value at max level", () => {
    expect(formatResearchEffectProgression(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 10)).toBe("20");
  });

  it("formats black hole feed amount with duration units", () => {
    expect(formatResearchEffectProgression(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 0)).toBe("1m -> 2m");
  });
});

describe("getResearchTimeCost and getResearchDurationSeconds", () => {
  it("scales with growthFactor by current level", () => {
    expect(getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)).toBe(
      Math.floor(RESEARCH_BLACK_HOLE_DAILY_FEEDS.baseTimeCost)
    );
    expect(getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 1)).toBe(
      Math.floor(RESEARCH_BLACK_HOLE_DAILY_FEEDS.baseTimeCost * RESEARCH_BLACK_HOLE_DAILY_FEEDS.growthFactor)
    );
    expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)).toBe(
      Math.floor(RESEARCH_BLACK_HOLE_DAILY_FEEDS.baseDuration)
    );
  });
});

describe("reconcileResearchProgress", () => {
  it("completes one level when duration elapses", () => {
    const startedAtMs = 1_000_000;
    const durationMs = getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0) * 1000;
    const result = reconcileResearchProgress({
      research: {
        levels: {},
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs
          }
        ],
        progress: {}
      },
      unlockedLabCount: 1,
      serverTimeMs: startedAtMs + durationMs,
      idleTimeAvailable: 0
    });
    expect(getResearchLevel(result.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(1);
    expect(result.levelsGained).toBe(1);
    expect(result.research.labs[0]?.startedAtMs).toBeNull();
  });

  it("chains multiple completions with overflow and auto-pays next level", () => {
    const def = RESEARCH_BLACK_HOLE_DAILY_FEEDS;
    const duration0 = getResearchDurationSeconds(def, 0) * 1000;
    const duration1 = getResearchDurationSeconds(def, 1) * 1000;
    const cost1 = getResearchTimeCost(def, 1);
    const cost2 = getResearchTimeCost(def, 2);
    const startedAtMs = 0;
    const serverTimeMs = startedAtMs + duration0 + duration1 + 1000;
    const result = reconcileResearchProgress({
      research: {
        levels: {},
        labs: [{ researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs }],
        progress: {}
      },
      unlockedLabCount: 1,
      serverTimeMs,
      idleTimeAvailable: cost1 + cost2 + 1000
    });
    expect(getResearchLevel(result.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(2);
    expect(result.levelsGained).toBe(2);
    expect(result.idleTimeDelta).toBe(-(cost1 + cost2));
    expect(result.research.labs[0]?.startedAtMs).toBe(startedAtMs + duration0 + duration1);
  });

  it("pauses after completion when insufficient idle for next level", () => {
    const startedAtMs = 0;
    const durationMs = getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0) * 1000;
    const result = reconcileResearchProgress({
      research: {
        levels: {},
        labs: [{ researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs }],
        progress: {}
      },
      unlockedLabCount: 1,
      serverTimeMs: startedAtMs + durationMs,
      idleTimeAvailable: 0
    });
    expect(getResearchLevel(result.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(1);
    expect(result.research.labs[0]?.startedAtMs).toBeNull();
    expect(result.research.labs[0]?.researchId).toBe(RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS);
  });
});

describe("stopResearch", () => {
  it("refunds the current level time cost", () => {
    const cost = getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0);
    const startedAtMs = 1_000_000;
    const result = stopResearch({
      research: {
        levels: {},
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs
          }
        ],
        progress: {}
      },
      labIndex: 0,
      unlockedLabCount: 1,
      serverTimeMs: startedAtMs + 60_000
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.idleTimeDelta).toBe(cost);
      expect(result.research.labs[0]?.startedAtMs).toBeNull();
      expect(result.research.labs[0]?.researchId).toBe(RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS);
    }
  });
});

describe("startResearch", () => {
  it("deducts cost and starts timer", () => {
    const cost = getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0);
    const result = startResearch({
      research: DEFAULT_RESEARCH_STATE,
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
      unlockedLabCount: 1,
      serverTimeMs: 5000,
      idleTimeAvailable: cost
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.idleTimeDelta).toBe(-cost);
      expect(result.research.labs[0]?.startedAtMs).toBe(5000);
    }
  });

  it("rejects when insufficient idle time", () => {
    const result = startResearch({
      research: { levels: {}, labs: [{ researchId: null, startedAtMs: null }], progress: {} },
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
      unlockedLabCount: 1,
      serverTimeMs: 0,
      idleTimeAvailable: 0
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INSUFFICIENT_IDLE_TIME");
    }
  });
});

describe("changeResearch", () => {
  it("refunds the current research cost and charges the new one", () => {
    const oldCost = getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0);
    const newCost = getResearchTimeCost(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 0);
    const result = changeResearch({
      research: {
        levels: {},
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs: 1000
          }
        ],
        progress: {}
      },
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
      unlockedLabCount: 1,
      serverTimeMs: 5000,
      idleTimeAvailable: newCost
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.idleTimeDelta).toBe(oldCost - newCost);
      expect(result.research.labs[0]?.researchId).toBe(RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT);
      expect(result.research.labs[0]?.startedAtMs).toBe(5000);
    }
  });

  it("saves partial progress on the old research and resumes it when returning", () => {
    const startedAtMs = 0;
    const serverTimeMs = 120_000;
    const durationMs = getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0) * 1000;
    const newCost = getResearchTimeCost(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 0);

    const changed = changeResearch({
      research: {
        levels: {},
        labs: [{ researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs }],
        progress: {}
      },
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
      unlockedLabCount: 1,
      serverTimeMs,
      idleTimeAvailable: newCost
    });

    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      return;
    }

    expect(changed.research.progress[RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]).toEqual({
      level: 0,
      elapsedMs: serverTimeMs - startedAtMs
    });

    const resumed = changeResearch({
      research: changed.research,
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
      unlockedLabCount: 1,
      serverTimeMs: serverTimeMs + 60_000,
      idleTimeAvailable: getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)
    });

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) {
      return;
    }

    const savedElapsed = getResearchSavedElapsedMs(resumed.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, 0);
    expect(savedElapsed).toBe(0);
    expect(resumed.research.labs[0]?.startedAtMs).toBe(serverTimeMs + 60_000 - (serverTimeMs - startedAtMs));

    const progress = getResearchProgress(
      RESEARCH_BLACK_HOLE_DAILY_FEEDS,
      0,
      resumed.research.labs[0]?.startedAtMs ?? null,
      serverTimeMs + 60_000
    );
    expect(progress).toBeCloseTo((serverTimeMs - startedAtMs) / durationMs, 5);

    const remainingMs = durationMs * (1 - (progress ?? 0));
    const completed = reconcileResearchProgress({
      research: resumed.research,
      unlockedLabCount: 1,
      serverTimeMs: serverTimeMs + 60_000 + remainingMs,
      idleTimeAvailable: 0
    });
    expect(getResearchLevel(completed.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(1);
  });

  it("rejects selecting the same active research", () => {
    const result = changeResearch({
      research: {
        levels: {},
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs: 1000
          }
        ],
        progress: {}
      },
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
      unlockedLabCount: 1,
      serverTimeMs: 5000,
      idleTimeAvailable: 1_000_000
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SAME_RESEARCH_SELECTED");
    }
  });
});
