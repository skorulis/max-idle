import type { ObligationReward } from "./obligationReward.js";
import { SECONDS_PER_MINUTE } from "./timeConstants.js";
export const OBLIGATION_IDS = {
  COLLECT_SOME_TIME: "obl_collect_some_time",
  FIRST_PURCHASE: "obl_first_purchase"
} as const;

export type ObligationId = (typeof OBLIGATION_IDS)[keyof typeof OBLIGATION_IDS];

export type ObligationStatPredicate =
  | { kind: "idle_time_total_gte"; seconds: number }
  | { kind: "real_time_total_gte"; seconds: number }
  | { kind: "time_gems_total_gte"; gems: number }
  | { kind: "upgrades_purchased_gte"; count: number }
  /** Number of rows in `player_collection_history` (idle collects). */
  | { kind: "collection_count_gte"; count: number };

export type ObligationCondition = {
  allOf: ObligationStatPredicate[];
};

export type ObligationDefinition = {
  id: ObligationId;
  name: string;
  description: string;
  rewards: ObligationReward[];
  condition: ObligationCondition;
};

/** Fields available from `player_states` for evaluating obligations. */
export type ObligationPlayerSnapshot = {
  idleTimeTotal: number;
  realTimeTotal: number;
  timeGemsTotal: number;
  upgradesPurchased: number;
  collectionCount: number;
};

function isPredicateMet(predicate: ObligationStatPredicate, s: ObligationPlayerSnapshot): boolean {
  switch (predicate.kind) {
    case "idle_time_total_gte":
      return s.idleTimeTotal >= predicate.seconds;
    case "real_time_total_gte":
      return s.realTimeTotal >= predicate.seconds;
    case "time_gems_total_gte":
      return s.timeGemsTotal >= predicate.gems;
    case "upgrades_purchased_gte":
      return s.upgradesPurchased >= predicate.count;
    case "collection_count_gte":
      return s.collectionCount >= predicate.count;
    default: {
      const _exhaustive: never = predicate;
      return _exhaustive;
    }
  }
}

export function isObligationConditionMet(def: ObligationDefinition, snapshot: ObligationPlayerSnapshot): boolean {
  return def.condition.allOf.every((p) => isPredicateMet(p, snapshot));
}

function completedIdSet(completed: ReadonlySet<string> | Readonly<Record<string, boolean | undefined>>): Set<string> {
  if (completed instanceof Set) {
    return new Set(completed);
  }
  return new Set(
    Object.entries(completed)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
  );
}

export function getCurrentObligationId(
  completed: ReadonlySet<string> | Readonly<Record<string, boolean | undefined>>
): ObligationId | null {
  const done = completedIdSet(completed);
  for (const def of OBLIGATIONS) {
    if (!done.has(def.id)) {
      return def.id;
    }
  }
  return null;
}

export function getObligationDefinition(id: ObligationId): ObligationDefinition | undefined {
  return OBLIGATIONS.find((d) => d.id === id);
}

export const OBLIGATIONS: ObligationDefinition[] = [
  {
    id: OBLIGATION_IDS.COLLECT_SOME_TIME,
    name: "Collect some time",
    description: "Let’s make sure the idle time generator is working correctly. It was built by a crackpot after all. Make sure you give it a little time to warm up.",
    rewards: [
      { type: "idle", value: 5 * SECONDS_PER_MINUTE },
      // TODO: Unlock shop
    ],
    condition: {
      allOf: [{ kind: "collection_count_gte", count: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.FIRST_PURCHASE,
    name: "First investment",
    description: "Purchase any upgrade from the shop.",
    rewards: [{ type: "gem", value: 2 }],
    condition: {
      allOf: [{ kind: "upgrades_purchased_gte", count: 1 }]
    }
  }
];
