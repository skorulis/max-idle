export const DEFAULT_LAB_SPEED_MULTIPLIER = 1;

/** Parse `LAB_SPEED_MULTIPLIER` / `VITE_LAB_SPEED_MULTIPLIER` (defaults to 1). */
export function parseLabSpeedMultiplier(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_LAB_SPEED_MULTIPLIER;
  }

  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("LAB_SPEED_MULTIPLIER must be a positive number");
  }

  return value;
}

export function normalizeLabSpeedMultiplier(value: number | undefined): number {
  if (value === undefined || value === DEFAULT_LAB_SPEED_MULTIPLIER) {
    return DEFAULT_LAB_SPEED_MULTIPLIER;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_LAB_SPEED_MULTIPLIER;
  }
  return value;
}

/** Wall-clock elapsed scaled so each real second counts as `multiplier` seconds of lab time. */
export function getEffectiveLabElapsedMs(realElapsedMs: number, labSpeedMultiplier: number): number {
  return Math.max(0, realElapsedMs) * normalizeLabSpeedMultiplier(labSpeedMultiplier);
}
