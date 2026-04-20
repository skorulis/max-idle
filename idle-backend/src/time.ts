export function calculateElapsedSeconds(from: Date, to: Date): number {
  const elapsedMs = to.getTime() - from.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  return Math.floor(elapsedMs / 1000);
}
