export type TutorialStep = {
  id: string;
  title: string;
  icon: string;
  body: string;
  
};

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "1",
    title: "Welcome",
    icon: "sparkles",
    body: "Welcome to Max Idle! This game is a race to do nothing. Unlike other idle games, you don't win by playing constantly but by proving yourself more patient than any other."
  },
  {
    id: "2",
    title: "Idle time",
    icon: "atom",
    body: "Below is the core of the game, your idle time generator. It will accumulate no matter what you are doing so there's no need to stare. Keep it running to move up the leaderboard or collect it to spend on upgrades."
  },
] as const;

export const KNOWN_TUTORIAL_IDS: ReadonlySet<string> = new Set(TUTORIAL_STEPS.map((s) => s.id));

export function parseCompletedTutorialIds(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Completed ids in canonical tutorial order (comma-separated). */
export function mergedTutorialProgressString(raw: string, completedId: string): string {
  const set = parseCompletedTutorialIds(raw);
  set.add(completedId);
  return TUTORIAL_STEPS.map((s) => s.id)
    .filter((id) => set.has(id))
    .join(",");
}
