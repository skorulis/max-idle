import { describe, expect, it } from "vitest";
import {
  getCurrentObligationId,
  isLevelUpgradesUnlocked,
  isObligationConditionMet,
  OBLIGATION_IDS,
  OBLIGATIONS,
  type ObligationDefinition,
  type ObligationPlayerSnapshot
} from "./obligations.js";

const minimalSnapshot: ObligationPlayerSnapshot = {
  idleTimeTotal: 0,
  realTimeTotal: 0,
  timeGemsTotal: 0,
  upgradesPurchased: 0,
  collectionCount: 0,
  achievementCount: 0
};

describe("getCurrentObligationId", () => {
  it("returns first obligation id when none completed", () => {
    expect(getCurrentObligationId(new Set())).toBe(OBLIGATION_IDS.COLLECT_SOME_TIME);
    expect(getCurrentObligationId({})).toBe(OBLIGATION_IDS.COLLECT_SOME_TIME);
  });

  it("advances after first is completed", () => {
    expect(getCurrentObligationId(new Set([OBLIGATION_IDS.COLLECT_SOME_TIME]))).toBe(OBLIGATION_IDS.FIRST_PURCHASE);
    expect(getCurrentObligationId({ [OBLIGATION_IDS.COLLECT_SOME_TIME]: true })).toBe(OBLIGATION_IDS.FIRST_PURCHASE);
  });

  it("advances after second is completed", () => {
    expect(
      getCurrentObligationId(new Set([OBLIGATION_IDS.COLLECT_SOME_TIME, OBLIGATION_IDS.FIRST_PURCHASE]))
    ).toBe(OBLIGATION_IDS.ACHIEVE_SOMETHING);
  });

  it("advances after third is completed", () => {
    expect(
      getCurrentObligationId(
        new Set([
          OBLIGATION_IDS.COLLECT_SOME_TIME,
          OBLIGATION_IDS.FIRST_PURCHASE,
          OBLIGATION_IDS.ACHIEVE_SOMETHING
        ])
      )
    ).toBe(OBLIGATION_IDS.TIME_GEMS);
  });

  it("advances after fourth is completed", () => {
    expect(
      getCurrentObligationId(
        new Set([
          OBLIGATION_IDS.COLLECT_SOME_TIME,
          OBLIGATION_IDS.FIRST_PURCHASE,
          OBLIGATION_IDS.ACHIEVE_SOMETHING,
          OBLIGATION_IDS.TIME_GEMS
        ])
      )
    ).toBe(OBLIGATION_IDS.RAMP_UP);
  });

  it("returns null when all complete", () => {
    const done = new Set([
      OBLIGATION_IDS.COLLECT_SOME_TIME,
      OBLIGATION_IDS.FIRST_PURCHASE,
      OBLIGATION_IDS.ACHIEVE_SOMETHING,
      OBLIGATION_IDS.TIME_GEMS,
      OBLIGATION_IDS.RAMP_UP,
      OBLIGATION_IDS.WAIT_IT_OUT
    ]);
    expect(getCurrentObligationId(done)).toBeNull();
    expect(
      getCurrentObligationId({
        [OBLIGATION_IDS.COLLECT_SOME_TIME]: true,
        [OBLIGATION_IDS.FIRST_PURCHASE]: true,
        [OBLIGATION_IDS.ACHIEVE_SOMETHING]: true,
        [OBLIGATION_IDS.TIME_GEMS]: true,
        [OBLIGATION_IDS.RAMP_UP]: true,
        [OBLIGATION_IDS.WAIT_IT_OUT]: true
      })
    ).toBeNull();
  });

  it("ignores false entries in record", () => {
    expect(
      getCurrentObligationId({
        [OBLIGATION_IDS.COLLECT_SOME_TIME]: false,
        [OBLIGATION_IDS.FIRST_PURCHASE]: false
      })
    ).toBe(OBLIGATION_IDS.COLLECT_SOME_TIME);
  });
});

describe("isObligationConditionMet", () => {
  const synth: ObligationDefinition = {
    id: OBLIGATION_IDS.COLLECT_SOME_TIME,
    name: "Test",
    description: "Test",
    rewards: [],
    condition: {
      allOf: [
        { kind: "idle_time_total_gte", seconds: 100 },
        { kind: "upgrades_purchased_gte", count: 2 }
      ]
    }
  };

  it("requires all predicates", () => {
    expect(isObligationConditionMet(synth, { ...minimalSnapshot, idleTimeTotal: 100, upgradesPurchased: 2 })).toBe(
      true
    );
    expect(isObligationConditionMet(synth, { ...minimalSnapshot, idleTimeTotal: 99, upgradesPurchased: 2 })).toBe(false);
    expect(isObligationConditionMet(synth, { ...minimalSnapshot, idleTimeTotal: 100, upgradesPurchased: 1 })).toBe(
      false
    );
  });

  it("supports collection_count_gte", () => {
    const coll: ObligationDefinition = {
      id: OBLIGATION_IDS.COLLECT_SOME_TIME,
      name: "Test",
      description: "Test",
      rewards: [],
      condition: { allOf: [{ kind: "collection_count_gte", count: 3 }] }
    };
    expect(isObligationConditionMet(coll, { ...minimalSnapshot, collectionCount: 3 })).toBe(true);
    expect(isObligationConditionMet(coll, { ...minimalSnapshot, collectionCount: 2 })).toBe(false);
  });

  it("supports achievement_count_gte", () => {
    const ach: ObligationDefinition = {
      id: OBLIGATION_IDS.ACHIEVE_SOMETHING,
      name: "Test",
      description: "Test",
      rewards: [],
      condition: { allOf: [{ kind: "achievement_count_gte", count: 1 }] }
    };
    expect(isObligationConditionMet(ach, { ...minimalSnapshot, achievementCount: 1 })).toBe(true);
    expect(isObligationConditionMet(ach, { ...minimalSnapshot, achievementCount: 0 })).toBe(false);
  });

  it("supports time_gems_total_gte", () => {
    const gems: ObligationDefinition = {
      id: OBLIGATION_IDS.TIME_GEMS,
      name: "Test",
      description: "Test",
      rewards: [],
      condition: { allOf: [{ kind: "time_gems_total_gte", gems: 1 }] }
    };
    expect(isObligationConditionMet(gems, { ...minimalSnapshot, timeGemsTotal: 1 })).toBe(true);
    expect(isObligationConditionMet(gems, { ...minimalSnapshot, timeGemsTotal: 0 })).toBe(false);
  });

  it("supports idle_time_total_gte for one hour", () => {
    const ramp: ObligationDefinition = {
      id: OBLIGATION_IDS.RAMP_UP,
      name: "Test",
      description: "Test",
      rewards: [],
      condition: { allOf: [{ kind: "idle_time_total_gte", seconds: 3600 }] }
    };
    expect(isObligationConditionMet(ramp, { ...minimalSnapshot, idleTimeTotal: 3600 })).toBe(true);
    expect(isObligationConditionMet(ramp, { ...minimalSnapshot, idleTimeTotal: 3599 })).toBe(false);
  });

  it("supports real_time_total_gte for six hours", () => {
    const waitItOut: ObligationDefinition = {
      id: OBLIGATION_IDS.WAIT_IT_OUT,
      name: "Test",
      description: "Test",
      rewards: [],
      condition: { allOf: [{ kind: "real_time_total_gte", seconds: 6 * 3600 }] }
    };
    expect(isObligationConditionMet(waitItOut, { ...minimalSnapshot, realTimeTotal: 6 * 3600 })).toBe(true);
    expect(isObligationConditionMet(waitItOut, { ...minimalSnapshot, realTimeTotal: 6 * 3600 - 1 })).toBe(false);
  });
});

describe("isLevelUpgradesUnlocked", () => {
  it("is false until TIME_GEMS obligation is completed", () => {
    expect(isLevelUpgradesUnlocked({})).toBe(false);
    expect(isLevelUpgradesUnlocked({ [OBLIGATION_IDS.TIME_GEMS]: false })).toBe(false);
    expect(isLevelUpgradesUnlocked({ [OBLIGATION_IDS.TIME_GEMS]: true })).toBe(true);
  });
});

describe("OBLIGATIONS order", () => {
  it("matches design queue order", () => {
    expect(OBLIGATIONS.map((d) => d.id)).toEqual([
      OBLIGATION_IDS.COLLECT_SOME_TIME,
      OBLIGATION_IDS.FIRST_PURCHASE,
      OBLIGATION_IDS.ACHIEVE_SOMETHING,
      OBLIGATION_IDS.TIME_GEMS,
      OBLIGATION_IDS.RAMP_UP,
      OBLIGATION_IDS.WAIT_IT_OUT
    ]);
  });
});
