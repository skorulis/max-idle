export type RoundingMode = "floor" | "ceil" | "round" | "trunc";

export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
export const SECONDS_PER_WEEK = 7 * 24 * 60 * 60;
export const SECONDS_PER_DAY = 24 * 60 * 60;
export const SECONDS_PER_HOUR = 60 * 60;
export const SECONDS_PER_MINUTE = 60;

export type DurationParts = {
  years: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Decomposes seconds using the same units as {@link formatSeconds} (365-day years, 7-day weeks). */
export function breakDownSeconds(seconds: number, roundingMode: RoundingMode = "floor"): DurationParts {
  let remaining = Math.max(0, Math[roundingMode](seconds));
  const years = Math.floor(remaining / SECONDS_PER_YEAR);
  remaining -= years * SECONDS_PER_YEAR;
  const weeks = Math.floor(remaining / SECONDS_PER_WEEK);
  remaining -= weeks * SECONDS_PER_WEEK;
  const days = Math.floor(remaining / SECONDS_PER_DAY);
  remaining -= days * SECONDS_PER_DAY;
  const hours = Math.floor(remaining / SECONDS_PER_HOUR);
  remaining -= hours * SECONDS_PER_HOUR;
  const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);
  remaining -= minutes * SECONDS_PER_MINUTE;
  const secs = remaining;
  return { years, weeks, days, hours, minutes, seconds: secs };
}

const units: Array<{ label: string; size: number }> = [
  { label: "y", size: SECONDS_PER_YEAR },
  { label: "w", size: SECONDS_PER_WEEK },
  { label: "d", size: SECONDS_PER_DAY },
  { label: "h", size: SECONDS_PER_HOUR },
  { label: "m", size: SECONDS_PER_MINUTE },
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
