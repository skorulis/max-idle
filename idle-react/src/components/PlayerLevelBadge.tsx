export type PlayerLevelBadgeProps = {
  /** Whole-number player level from the server (minimum 1). */
  level: number;
  /**
   * Outer diameter of the badge in CSS pixels.
   * Typical values: ~32–40 next to a title, ~96–128 for a hero or spotlight.
   */
  size: number;
  className?: string;
};

/**
 * Circular badge showing the player level number.
 */
export function PlayerLevelBadge({ level, size, className }: PlayerLevelBadgeProps) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const fontSize = Math.max(10, Math.round(size * (safeLevel >= 100 ? 0.28 : 0.42)));

  return (
    <span
      className={["player-level-badge", className].filter(Boolean).join(" ")}
      style={{
        width: size,
        height: size,
        fontSize
      }}
      aria-label={`Player level ${safeLevel}`}
    >
      {safeLevel}
    </span>
  );
}
