/** Normalize DB JSON to completed obligation ids (only `true` values kept). */
export function parseObligationsCompleted(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true) {
      out[key] = true;
    }
  }
  return out;
}
