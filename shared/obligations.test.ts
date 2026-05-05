import { describe, expect, it } from "vitest";
import {
  getCurrentObligationId,
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
  collectionCount: 0
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

  it("returns null when all complete", () => {
    const done = new Set([OBLIGATION_IDS.COLLECT_SOME_TIME, OBLIGATION_IDS.FIRST_PURCHASE]);
    expect(getCurrentObligationId(done)).toBeNull();
    expect(
      getCurrentObligationId({
        [OBLIGATION_IDS.COLLECT_SOME_TIME]: true,
        [OBLIGATION_IDS.FIRST_PURCHASE]: true
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
});

describe("OBLIGATIONS order", () => {
  it("matches design queue order", () => {
    expect(OBLIGATIONS.map((d) => d.id)).toEqual([OBLIGATION_IDS.COLLECT_SOME_TIME, OBLIGATION_IDS.FIRST_PURCHASE]);
  });
});
