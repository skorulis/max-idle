import type { ObligationReward } from "./obligationReward.js";
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants.js";
export const OBLIGATION_IDS = {
  COLLECT_SOME_TIME: "obl_collect_some_time",
  FIRST_PURCHASE: "obl_first_purchase",
  ACHIEVE_SOMETHING: "obl_achieve_something",
  TIME_GEMS: "obl_time_gems",
  LEVEL_UP: "obl_level_up",
  RAMP_UP: "obl_ramp_up",
  WAIT_IT_OUT: "obl_wait_it_out"
} as const;

export type ObligationId = (typeof OBLIGATION_IDS)[keyof typeof OBLIGATION_IDS];

export type ObligationStatPredicate =
  | { kind: "idle_time_total_gte"; seconds: number }
  | { kind: "real_time_total_gte"; seconds: number }
  | { kind: "time_gems_total_gte"; gems: number }
  | { kind: "upgrades_purchased_gte"; count: number }
  /** Number of rows in `player_collection_history` (idle collects). */
  | { kind: "collection_count_gte"; count: number }
  /** Matches `player_states.achievement_count` (tiers / levels earned). */
  | { kind: "achievement_count_gte"; count: number }
  /** Matches `player_states.level` (shop player level; 0 until first purchase). */
  | { kind: "player_level_gte"; level: number };

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
  achievementCount: number;
  playerLevel: number;
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
    case "achievement_count_gte":
      return s.achievementCount >= predicate.count;
    case "player_level_gte":
      return s.playerLevel >= predicate.level;
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

export function isTournamentFeatureUnlocked(completed: Readonly<Record<string, boolean | undefined>>): boolean {
  return completed[OBLIGATION_IDS.WAIT_IT_OUT] === true;
}

export function isLevelUpgradesUnlocked(completed: Readonly<Record<string, boolean | undefined>>): boolean {
  return completed[OBLIGATION_IDS.TIME_GEMS] === true;
}

export const OBLIGATIONS: ObligationDefinition[] = [
  {
    id: OBLIGATION_IDS.COLLECT_SOME_TIME,
    name: "Collect some time",
    description: "Let’s make sure the idle time generator is working correctly. It was built by a crackpot after all. Make sure you give it a little time to warm up.",
    rewards: [
      { type: "idle", value: 5 * SECONDS_PER_MINUTE },
    ],
    condition: {
      allOf: [{ kind: "collection_count_gte", count: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.FIRST_PURCHASE,
    name: "Buy something nice",
    description: "Go to the shop and get yourself an upgrade, I don’t care what it is, you can regret your choices later on.",
    rewards: [{ type: "idle", value: 10 * SECONDS_PER_MINUTE }],
    condition: {
      allOf: [{ kind: "upgrades_purchased_gte", count: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.ACHIEVE_SOMETHING,
    name: "Achieve something",
    description:
      "You don't seem like a high achiever to me but I'm sure you can manage to do something worthwhile. There's lots of options in the achievement section, find something that you're capable of.",
    rewards: [
      { type: "idle", value: 15 * SECONDS_PER_MINUTE },
      { type: "text", label: "Unlock daily gem reward" }
    ],
    condition: {
      allOf: [{ kind: "achievement_count_gte", count: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.TIME_GEMS,
    name: "Time gems",
    description:
      "Time is a great thing to have, but what's even better are time gems. They're like little packets of time that you can carry around with you. Collect the daily gem reward to get your first one.",
    rewards: [
      { type: "idle", value: 15 * SECONDS_PER_MINUTE },
      { type: "real", value: 10 * SECONDS_PER_MINUTE },
      { type: "text", label: "Unlock level upgrades" }
    ],
    condition: {
      allOf: [{ kind: "time_gems_total_gte", gems: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.LEVEL_UP,
    name: "Level up",
    description:
      "If you check the shop page now you’ll see that you can now purchase new levels. You’ll get a little bonus for doing so but mostly it’s a great way to show off to your friends how much time you’ve wasted. Go buy yourself a level now.",
    rewards: [{ type: "idle", value: 10 * SECONDS_PER_MINUTE }],
    condition: {
      allOf: [{ kind: "player_level_gte", level: 1 }]
    }
  },
  {
    id: OBLIGATION_IDS.RAMP_UP,
    name: "Ramp up",
    description:
      "If you want to make it anywhere you're going to have to start getting a decent amount of time. Get your total idle time over 1 hour. How you get there is up to you, buy some upgrades, stare at the screen, go for a walk, find a way to cheat, as long as you get it done.",
    rewards: [
      { type: "idle", value: 20 * SECONDS_PER_MINUTE },
      { type: "real", value: 20 * SECONDS_PER_MINUTE },
      { type: "text", label: "Unlock daily bonuses" }
    ],
    condition: {
      allOf: [{ kind: "idle_time_total_gte", seconds: SECONDS_PER_HOUR }]
    }
  },
  {
    id: OBLIGATION_IDS.WAIT_IT_OUT,
    name: "Wait it out",
    description:
      "The great thing about idle time is you can get all sorts of bonuses. But real time is a bit harder, that's very much tied into the wall clock. So go take a break and come back when you have 1 hour of real time collected.",
    rewards: [{ type: "text", label: "Unlock tournaments" }, { type: "gem", value: 1 }],
    condition: {
      allOf: [{ kind: "real_time_total_gte", seconds: 1 * SECONDS_PER_HOUR }]
    }
  }
];
