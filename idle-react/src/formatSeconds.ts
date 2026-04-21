export function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds === 0) {
    return "0s";
  }

  const units: Array<{ label: string; size: number }> = [
    { label: "y", size: 365 * 24 * 60 * 60 },
    { label: "w", size: 7 * 24 * 60 * 60 },
    { label: "d", size: 24 * 60 * 60 },
    { label: "h", size: 60 * 60 },
    { label: "m", size: 60 },
    { label: "s", size: 1 }
  ];

  let remaining = safeSeconds;
  const parts: string[] = [];
  for (const unit of units) {
    const value = Math.floor(remaining / unit.size);
    if (value > 0) {
      parts.push(`${value}${unit.label}`);
      remaining -= value * unit.size;
    }
  }

  return parts.join(" ");
}
