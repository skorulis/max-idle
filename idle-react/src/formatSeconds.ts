export type RoundingMode = "floor" | "ceil" | "round" | "trunc";

const units: Array<{ label: string; size: number }> = [
  { label: "y", size: 365 * 24 * 60 * 60 },
  { label: "w", size: 7 * 24 * 60 * 60 },
  { label: "d", size: 24 * 60 * 60 },
  { label: "h", size: 60 * 60 },
  { label: "m", size: 60 },
  { label: "s", size: 1 }
];

function toParts(totalSeconds: number): Array<{ unitSize: number; text: string }> {
  let remaining = totalSeconds;
  const parts: Array<{ unitSize: number; text: string }> = [];
  for (const unit of units) {
    const value = Math.floor(remaining / unit.size);
    if (value > 0) {
      parts.push({ unitSize: unit.size, text: `${value}${unit.label}` });
      remaining -= value * unit.size;
    }
  }
  return parts;
}

export function formatSeconds(seconds: number, maxUnits?: number, roundingMode: RoundingMode = "floor"): string {
  const roundedSeconds = Math[roundingMode](seconds);
  const safeSeconds = Math.max(0, roundedSeconds);
  if (safeSeconds === 0) {
    return "0s";
  }
  const parts = toParts(safeSeconds);

  if (typeof maxUnits === "number" && Number.isFinite(maxUnits) && maxUnits > 0) {
    const limited = parts.slice(0, maxUnits);
    if (limited.length === 0) {
      return "0s";
    }
    if (parts.length <= maxUnits) {
      return limited.map((part) => part.text).join(" ");
    }

    const smallestDisplayedUnit = limited[limited.length - 1]?.unitSize ?? 1;
    const roundedDisplaySeconds = Math[roundingMode](safeSeconds / smallestDisplayedUnit) * smallestDisplayedUnit;
    const displayParts = toParts(Math.max(0, roundedDisplaySeconds));
    return displayParts.slice(0, maxUnits).map((part) => part.text).join(" ");
  }

  return parts.map((part) => part.text).join(" ");
}
