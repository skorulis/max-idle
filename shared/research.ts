import {
  getResearchItemDefinition,
  type ResearchItemDefinition
} from "./researchItems.js";
import { safeNaturalNumber } from "./safeNumber.js";

export type ResearchLabSlot = {
  researchId: string | null;
  startedAtMs: number | null;
};

export type ResearchProgressEntry = {
  level: number;
  elapsedMs: number;
};

export type ResearchState = {
  levels: Record<string, number>;
  labs: ResearchLabSlot[];
  /** Partial real-time progress toward the current level, keyed by research id. */
  progress: Record<string, ResearchProgressEntry>;
};

export const DEFAULT_RESEARCH_STATE: ResearchState = {
  levels: {},
  labs: [],
  progress: {}
};

export type ReconcileResearchProgressInput = {
  research: ResearchState;
  unlockedLabCount: number;
  serverTimeMs: number;
  idleTimeAvailable: number;
};

export type ReconcileResearchProgressResult = {
  research: ResearchState;
  idleTimeDelta: number;
  levelsGained: number;
};

export type StartResearchInput = {
  research: ResearchState;
  labIndex: number;
  researchId: string;
  unlockedLabCount: number;
  serverTimeMs: number;
  idleTimeAvailable: number;
};

export type StartResearchResult =
  | { ok: true; research: ResearchState; idleTimeDelta: number }
  | { ok: false; code: string };

export type StopResearchInput = {
  research: ResearchState;
  labIndex: number;
  unlockedLabCount: number;
  serverTimeMs: number;
};

export type StopResearchResult =
  | { ok: true; research: ResearchState; idleTimeDelta: number }
  | { ok: false; code: string };

export type ChangeResearchInput = {
  research: ResearchState;
  labIndex: number;
  researchId: string;
  unlockedLabCount: number;
  serverTimeMs: number;
  idleTimeAvailable: number;
};

/** Cost in idle seconds to research from level L to L+1. */
export function getResearchTimeCost(def: ResearchItemDefinition, currentLevel: number): number {
  const level = safeNaturalNumber(currentLevel);
  return Math.floor(def.baseTimeCost * def.growthFactor ** level);
}

/** Real seconds for the timer from level L to L+1. */
export function getResearchDurationSeconds(def: ResearchItemDefinition, currentLevel: number): number {
  const level = safeNaturalNumber(currentLevel);
  return Math.floor(def.baseDuration * def.growthFactor ** level);
}

export function getResearchBonusAtLevel(def: ResearchItemDefinition, level: number): number {
  const safeLevel = safeNaturalNumber(level);
  return def.zeroLevelBonus + def.bonusPerLevel * safeLevel;
}

export function getResearchLevel(state: ResearchState, researchId: string): number {
  return safeNaturalNumber(state.levels[researchId]);
}

export function isResearchAtMaxLevel(def: ResearchItemDefinition, currentLevel: number): boolean {
  return safeNaturalNumber(currentLevel) >= def.maximumLevel;
}

export function getResearchSavedElapsedMs(
  state: ResearchState,
  researchId: string,
  currentLevel: number
): number {
  const entry = state.progress[researchId];
  if (!entry || entry.level !== safeNaturalNumber(currentLevel)) {
    return 0;
  }
  return Math.max(0, Math.floor(entry.elapsedMs));
}

function normalizeProgress(raw: unknown): Record<string, ResearchProgressEntry> {
  const progress: Record<string, ResearchProgressEntry> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return progress;
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0 || !value || typeof value !== "object") {
      continue;
    }
    const entry = value as Record<string, unknown>;
    const level = safeNaturalNumber(entry.level);
    const elapsedMs = safeNaturalNumber(entry.elapsedMs);
    if (elapsedMs > 0) {
      progress[key] = { level, elapsedMs };
    }
  }

  return progress;
}

function getResearchDurationMs(def: ResearchItemDefinition, currentLevel: number): number {
  return getResearchDurationSeconds(def, currentLevel) * 1000;
}

function captureActiveElapsedMs(
  def: ResearchItemDefinition,
  currentLevel: number,
  startedAtMs: number,
  serverTimeMs: number
): number {
  const durationMs = getResearchDurationMs(def, currentLevel);
  if (durationMs <= 0) {
    return 0;
  }
  return Math.min(durationMs, Math.max(0, serverTimeMs - startedAtMs));
}

function setSavedProgress(
  progress: Record<string, ResearchProgressEntry>,
  researchId: string,
  level: number,
  elapsedMs: number,
  def: ResearchItemDefinition
): void {
  const durationMs = getResearchDurationMs(def, level);
  if (durationMs <= 0 || elapsedMs <= 0) {
    delete progress[researchId];
    return;
  }

  const clampedElapsed = Math.min(elapsedMs, Math.max(0, durationMs - 1));
  if (clampedElapsed <= 0) {
    delete progress[researchId];
    return;
  }

  progress[researchId] = { level, elapsedMs: clampedElapsed };
}

function clearSavedProgress(
  progress: Record<string, ResearchProgressEntry>,
  researchId: string
): void {
  delete progress[researchId];
}

function getStartedAtMsForResearch(
  serverTimeMs: number,
  def: ResearchItemDefinition,
  currentLevel: number,
  savedElapsedMs: number
): number {
  const durationMs = getResearchDurationMs(def, currentLevel);
  const clampedElapsed = Math.min(Math.max(0, savedElapsedMs), Math.max(0, durationMs - 1));
  return serverTimeMs - clampedElapsed;
}

export function normalizeResearchState(
  raw: ResearchState,
  unlockedLabCount: number
): ResearchState {
  const levels: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.levels ?? {})) {
    if (typeof key === "string" && key.length > 0) {
      levels[key] = safeNaturalNumber(value);
    }
  }

  const slotCount = safeNaturalNumber(unlockedLabCount);
  const labs: ResearchLabSlot[] = [];
  const sourceLabs = Array.isArray(raw.labs) ? raw.labs : [];

  for (let i = 0; i < slotCount; i += 1) {
    const slot = sourceLabs[i];
    const researchId =
      slot && typeof slot.researchId === "string" && slot.researchId.length > 0
        ? slot.researchId
        : null;
    const startedAtMs =
      slot && slot.startedAtMs != null && Number.isFinite(slot.startedAtMs)
        ? Math.floor(slot.startedAtMs)
        : null;
    labs.push({ researchId, startedAtMs });
  }

  return { levels, labs, progress: normalizeProgress(raw.progress) };
}

export function parseResearchState(raw: unknown, unlockedLabCount: number): ResearchState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return normalizeResearchState(DEFAULT_RESEARCH_STATE, unlockedLabCount);
  }
  const record = raw as Record<string, unknown>;
  return normalizeResearchState(
    {
      levels: (record.levels as Record<string, number>) ?? {},
      labs: (record.labs as ResearchLabSlot[]) ?? [],
      progress: normalizeProgress(record.progress)
    },
    unlockedLabCount
  );
}

function reconcileLabSlot(
  slot: ResearchLabSlot,
  levels: Record<string, number>,
  progress: Record<string, ResearchProgressEntry>,
  serverTimeMs: number,
  idleTimeAvailable: number
): { slot: ResearchLabSlot; idleTimeDelta: number; levelsGained: number } {
  if (!slot.researchId || slot.startedAtMs == null) {
    return { slot, idleTimeDelta: 0, levelsGained: 0 };
  }

  const def = getResearchItemDefinition(slot.researchId);
  if (!def) {
    return {
      slot: { researchId: null, startedAtMs: null },
      idleTimeDelta: 0,
      levelsGained: 0
    };
  }

  let currentSlot = { ...slot };
  let idleTimeDelta = 0;
  let levelsGained = 0;
  let availableIdle = idleTimeAvailable;

  while (currentSlot.startedAtMs != null) {
    const currentLevel = safeNaturalNumber(levels[currentSlot.researchId!]);
    if (isResearchAtMaxLevel(def, currentLevel)) {
      clearSavedProgress(progress, currentSlot.researchId!);
      currentSlot = { researchId: currentSlot.researchId, startedAtMs: null };
      break;
    }

    const durationMs = getResearchDurationMs(def, currentLevel);
    const elapsedMs = serverTimeMs - currentSlot.startedAtMs;
    if (elapsedMs < durationMs) {
      break;
    }

    const nextLevel = currentLevel + 1;
    levels[currentSlot.researchId!] = nextLevel;
    levelsGained += 1;
    clearSavedProgress(progress, currentSlot.researchId!);

    if (isResearchAtMaxLevel(def, nextLevel)) {
      currentSlot = { researchId: currentSlot.researchId, startedAtMs: null };
      break;
    }

    const nextCost = getResearchTimeCost(def, nextLevel);
    if (availableIdle < nextCost) {
      currentSlot = { researchId: currentSlot.researchId, startedAtMs: null };
      break;
    }

    availableIdle -= nextCost;
    idleTimeDelta -= nextCost;
    currentSlot = {
      researchId: currentSlot.researchId,
      startedAtMs: currentSlot.startedAtMs + durationMs
    };
  }

  return { slot: currentSlot, idleTimeDelta, levelsGained };
}

export function reconcileResearchProgress(
  input: ReconcileResearchProgressInput
): ReconcileResearchProgressResult {
  const research = normalizeResearchState(input.research, input.unlockedLabCount);
  const levels = { ...research.levels };
  const progress = { ...research.progress };
  let idleTimeDelta = 0;
  let levelsGained = 0;
  let idleTimeAvailable = safeNaturalNumber(input.idleTimeAvailable);

  const labs = research.labs.map((slot) => {
    const result = reconcileLabSlot(
      slot,
      levels,
      progress,
      input.serverTimeMs,
      idleTimeAvailable
    );
    idleTimeDelta += result.idleTimeDelta;
    levelsGained += result.levelsGained;
    idleTimeAvailable += result.idleTimeDelta;
    return result.slot;
  });

  return {
    research: { levels, labs, progress },
    idleTimeDelta,
    levelsGained
  };
}

export function startResearch(input: StartResearchInput): StartResearchResult {
  const def = getResearchItemDefinition(input.researchId);
  if (!def) {
    return { ok: false, code: "RESEARCH_ITEM_NOT_FOUND" };
  }

  const research = normalizeResearchState(input.research, input.unlockedLabCount);
  if (input.labIndex < 0 || input.labIndex >= research.labs.length) {
    return { ok: false, code: "LAB_SLOT_NOT_UNLOCKED" };
  }

  const slot = research.labs[input.labIndex];
  if (slot.startedAtMs != null) {
    return { ok: false, code: "LAB_ALREADY_RESEARCHING" };
  }

  const currentLevel = getResearchLevel(research, input.researchId);
  if (isResearchAtMaxLevel(def, currentLevel)) {
    return { ok: false, code: "RESEARCH_AT_MAX_LEVEL" };
  }

  const cost = getResearchTimeCost(def, currentLevel);
  if (input.idleTimeAvailable < cost) {
    return { ok: false, code: "INSUFFICIENT_IDLE_TIME" };
  }

  const progress = { ...research.progress };
  const savedElapsedMs = getResearchSavedElapsedMs(research, input.researchId, currentLevel);
  const startedAtMs = getStartedAtMsForResearch(
    input.serverTimeMs,
    def,
    currentLevel,
    savedElapsedMs
  );
  clearSavedProgress(progress, input.researchId);

  const labs = [...research.labs];
  labs[input.labIndex] = {
    researchId: input.researchId,
    startedAtMs
  };

  return {
    ok: true,
    research: { levels: research.levels, labs, progress },
    idleTimeDelta: -cost
  };
}

export function stopResearch(input: StopResearchInput): StopResearchResult {
  const research = normalizeResearchState(input.research, input.unlockedLabCount);
  if (input.labIndex < 0 || input.labIndex >= research.labs.length) {
    return { ok: false, code: "LAB_SLOT_NOT_UNLOCKED" };
  }

  const slot = research.labs[input.labIndex];
  if (!slot.researchId || slot.startedAtMs == null) {
    return { ok: false, code: "LAB_NOT_RESEARCHING" };
  }

  const def = getResearchItemDefinition(slot.researchId);
  const progress = { ...research.progress };
  const labs = [...research.labs];

  if (!def) {
    labs[input.labIndex] = { researchId: null, startedAtMs: null };
    return { ok: true, research: { levels: research.levels, labs, progress }, idleTimeDelta: 0 };
  }

  const currentLevel = getResearchLevel(research, slot.researchId);
  const refund = getResearchTimeCost(def, currentLevel);
  setSavedProgress(
    progress,
    slot.researchId,
    currentLevel,
    captureActiveElapsedMs(def, currentLevel, slot.startedAtMs, input.serverTimeMs),
    def
  );

  labs[input.labIndex] = {
    researchId: slot.researchId,
    startedAtMs: null
  };

  return {
    ok: true,
    research: { levels: research.levels, labs, progress },
    idleTimeDelta: refund
  };
}

export function changeResearch(input: ChangeResearchInput): StartResearchResult {
  const newDef = getResearchItemDefinition(input.researchId);
  if (!newDef) {
    return { ok: false, code: "RESEARCH_ITEM_NOT_FOUND" };
  }

  const research = normalizeResearchState(input.research, input.unlockedLabCount);
  if (input.labIndex < 0 || input.labIndex >= research.labs.length) {
    return { ok: false, code: "LAB_SLOT_NOT_UNLOCKED" };
  }

  const slot = research.labs[input.labIndex];
  if (slot.startedAtMs == null) {
    return { ok: false, code: "LAB_NOT_RESEARCHING" };
  }

  if (slot.researchId === input.researchId) {
    return { ok: false, code: "SAME_RESEARCH_SELECTED" };
  }

  const newLevel = getResearchLevel(research, input.researchId);
  if (isResearchAtMaxLevel(newDef, newLevel)) {
    return { ok: false, code: "RESEARCH_AT_MAX_LEVEL" };
  }

  const newCost = getResearchTimeCost(newDef, newLevel);

  let refund = 0;
  const progress = { ...research.progress };

  if (slot.researchId) {
    const currentDef = getResearchItemDefinition(slot.researchId);
    if (currentDef) {
      const currentLevel = getResearchLevel(research, slot.researchId);
      refund = getResearchTimeCost(currentDef, currentLevel);
      setSavedProgress(
        progress,
        slot.researchId,
        currentLevel,
        captureActiveElapsedMs(currentDef, currentLevel, slot.startedAtMs, input.serverTimeMs),
        currentDef
      );
    }
  }

  if (input.idleTimeAvailable + refund < newCost) {
    return { ok: false, code: "INSUFFICIENT_IDLE_TIME" };
  }

  const savedElapsedMs = getResearchSavedElapsedMs(
    { ...research, progress },
    input.researchId,
    newLevel
  );
  const startedAtMs = getStartedAtMsForResearch(
    input.serverTimeMs,
    newDef,
    newLevel,
    savedElapsedMs
  );
  clearSavedProgress(progress, input.researchId);

  const labs = [...research.labs];
  labs[input.labIndex] = {
    researchId: input.researchId,
    startedAtMs
  };

  return {
    ok: true,
    research: { levels: research.levels, labs, progress },
    idleTimeDelta: refund - newCost
  };
}

/** Progress toward completing the current level (0–1), or null if not actively researching. */
export function getResearchProgress(
  def: ResearchItemDefinition,
  currentLevel: number,
  startedAtMs: number | null,
  serverTimeMs: number
): number | null {
  if (startedAtMs == null) {
    return null;
  }
  const durationMs = getResearchDurationMs(def, currentLevel);
  if (durationMs <= 0) {
    return 1;
  }
  const elapsedMs = Math.max(0, serverTimeMs - startedAtMs);
  return Math.min(1, elapsedMs / durationMs);
}

export function getResearchDisplayBonus(
  def: ResearchItemDefinition,
  currentLevel: number
): number {
  return getResearchBonusAtLevel(def, currentLevel);
}

/** Human-readable effect at `level` for UI (catalog, lab cards). */
export function formatResearchBonusLabel(def: ResearchItemDefinition, level: number): string {
  return def.format(getResearchBonusAtLevel(def, level));
}

/** Effect now (at completed `level`) → after the in-progress research level completes (`level` + 1). At max, only the capped value. */
export function formatResearchEffectProgression(
  def: ResearchItemDefinition,
  completedLevel: number
): string {
  if (isResearchAtMaxLevel(def, completedLevel)) {
    return def.format(getResearchBonusAtLevel(def, completedLevel));
  }
  const current = getResearchBonusAtLevel(def, completedLevel);
  const afterNext = getResearchBonusAtLevel(def, completedLevel + 1);
  return `${def.format(current)} -> ${def.format(afterNext)}`;
}
