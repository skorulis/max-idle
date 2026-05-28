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
  RESEARCH_DAILY_BONUS_ACTIVATION_COST,
  RESEARCH_ITEM_IDS
} from "./researchItems.js";
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants.js";

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

  it("formats daily bonus activation cost with duration units", () => {
    expect(formatResearchEffectProgression(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 0)).toBe(
      "1d -> 23h 30m"
    );
  });

  it("shows penultimate and final values one level below max", () => {
    expect(formatResearchEffectProgression(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 39)).toBe(
      "4h 30m -> 4h"
    );
  });

  it("shows a single value at max level for daily bonus activation cost", () => {
    expect(formatResearchEffectProgression(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 40)).toBe("4h");
  });
});

describe("getResearchTimeCost", () => {
  it("scales with growthFactor by current level", () => {
    expect(getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)).toBe(
      Math.floor(RESEARCH_BLACK_HOLE_DAILY_FEEDS.baseTimeCost)
    );
    expect(getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 1)).toBe(
      Math.floor(RESEARCH_BLACK_HOLE_DAILY_FEEDS.baseTimeCost * RESEARCH_BLACK_HOLE_DAILY_FEEDS.growthFactor)
    );
  });

  it("scales daily bonus activation cost with its growth factor", () => {
    expect(getResearchTimeCost(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 0)).toBe(
      Math.floor(RESEARCH_DAILY_BONUS_ACTIVATION_COST.baseTimeCost)
    );
    expect(getResearchTimeCost(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 1)).toBe(
      Math.floor(
        RESEARCH_DAILY_BONUS_ACTIVATION_COST.baseTimeCost *
          RESEARCH_DAILY_BONUS_ACTIVATION_COST.growthFactor
      )
    );
  });
});

describe("getResearchDurationSeconds", () => {
  describe("Black hole daily feeds (2h base, ×2.3 per level)", () => {
    it("level 0 → 1 takes 7200s (2h)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0)).toBe(7200);
    });

    it("level 1 → 2 takes 16560s (4h 36m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 1)).toBe(16560);
    });

    it("level 3 → 4 takes 87602s (1d 20m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 3)).toBe(87602);
    });

    it("level 5 → 6 takes 463416s (5d 8h 43m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 5)).toBe(463416);
    });

    it("level 9 → 10 takes 12968299s (~150d)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 9)).toBe(12968299);
    });
  });

  describe("Black hole feed amount (2h base, ×2.3 per level)", () => {
    it("level 0 → 1 takes 7200s (2h)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 0)).toBe(7200);
    });

    it("level 1 → 2 takes 16560s (4h 36m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 1)).toBe(16560);
    });

    it("level 3 → 4 takes 87602s (1d 20m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 3)).toBe(87602);
    });

    it("level 5 → 6 takes 463416s (5d 8h 43m)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 5)).toBe(463416);
    });

    it("level 9 → 10 takes 12968299s (~150d)", () => {
      expect(getResearchDurationSeconds(RESEARCH_BLACK_HOLE_FEED_AMOUNT, 9)).toBe(12968299);
    });
  });

  describe("Daily bonus activation cost (4h base, ×1.25 per level)", () => {
    it("level 0 → 1 takes 14400s (4h)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 0)).toBe(14400);
    });

    it("level 1 → 2 takes 18000s (5h)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 1)).toBe(18000);
    });

    it("level 3 → 4 takes 28125s (7h 48m 45s)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 3)).toBe(28125);
    });

    it("level 5 → 6 takes 43945s (12h 12m 25s)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 5)).toBe(43945);
    });

    it("level 19 → 20 takes 999200s (~11d)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 19)).toBe(999200);
    });

    it("level 29 → 30 takes 9305781s (~107d)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 29)).toBe(9305781);
    });

    it("level 39 → 40 takes 86666847s (~1003d)", () => {
      expect(getResearchDurationSeconds(RESEARCH_DAILY_BONUS_ACTIVATION_COST, 39)).toBe(86666847);
    });
  });
});

describe("RESEARCH_DAILY_BONUS_ACTIVATION_COST definition", () => {
  it("reduces activation idle cost by 30 minutes per level from 24h at level 0", () => {
    const def = RESEARCH_DAILY_BONUS_ACTIVATION_COST;
    expect(def.zeroLevelBonus).toBe(24 * SECONDS_PER_HOUR);
    expect(def.bonusPerLevel).toBe(-30 * SECONDS_PER_MINUTE);
    expect(def.zeroLevelBonus + def.bonusPerLevel * 40).toBe(4 * SECONDS_PER_HOUR);
  });

  it("allows up to 40 levels", () => {
    expect(RESEARCH_DAILY_BONUS_ACTIVATION_COST.maximumLevel).toBe(40);
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

  it("clears the lab to offline when the final level completes", () => {
    const def = RESEARCH_BLACK_HOLE_DAILY_FEEDS;
    const startedAtMs = 0;
    const durationMs = getResearchDurationSeconds(def, 9) * 1000;
    const result = reconcileResearchProgress({
      research: {
        levels: { [RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]: 9 },
        labs: [{ researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs }],
        progress: {}
      },
      unlockedLabCount: 1,
      serverTimeMs: startedAtMs + durationMs,
      idleTimeAvailable: 1_000_000
    });
    expect(getResearchLevel(result.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(10);
    expect(result.research.labs[0]).toEqual({ researchId: null, startedAtMs: null });
  });

  it("clears a maxed-out lab that still has a stale active slot", () => {
    const result = reconcileResearchProgress({
      research: {
        levels: { [RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS]: 10 },
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs: 1_000_000
          }
        ],
        progress: {}
      },
      unlockedLabCount: 1,
      serverTimeMs: 2_000_000,
      idleTimeAvailable: 0
    });
    expect(result.research.labs[0]).toEqual({ researchId: null, startedAtMs: null });
    expect(result.levelsGained).toBe(0);
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

  it("completes faster when labSpeedMultiplier is above 1", () => {
    const startedAtMs = 1_000_000;
    const durationMs = getResearchDurationSeconds(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0) * 1000;
    const multiplier = 4;
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
      serverTimeMs: startedAtMs + durationMs / multiplier,
      idleTimeAvailable: 0,
      labSpeedMultiplier: multiplier
    });
    expect(getResearchLevel(result.research, RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS)).toBe(1);
    expect(result.levelsGained).toBe(1);
    expect(result.research.labs[0]?.startedAtMs).toBeNull();
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

  it("rejects when another lab is already actively researching the same item", () => {
    const cost = getResearchTimeCost(RESEARCH_BLACK_HOLE_DAILY_FEEDS, 0);
    const result = startResearch({
      research: {
        levels: {},
        labs: [
          { researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS, startedAtMs: 1000 },
          { researchId: null, startedAtMs: null }
        ],
        progress: {}
      },
      labIndex: 1,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
      unlockedLabCount: 2,
      serverTimeMs: 5000,
      idleTimeAvailable: cost
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESEARCH_ALREADY_IN_PROGRESS");
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

  it("rejects changing to research already active in another lab", () => {
    const result = changeResearch({
      research: {
        levels: {},
        labs: [
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_DAILY_FEEDS,
            startedAtMs: 1000
          },
          {
            researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
            startedAtMs: 2000
          }
        ],
        progress: {}
      },
      labIndex: 0,
      researchId: RESEARCH_ITEM_IDS.BLACK_HOLE_FEED_AMOUNT,
      unlockedLabCount: 2,
      serverTimeMs: 5000,
      idleTimeAvailable: 1_000_000
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESEARCH_ALREADY_IN_PROGRESS");
    }
  });
});
