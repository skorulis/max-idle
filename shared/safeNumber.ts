export function safeNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function safeNaturalNumber(value: unknown, fallback = 0): number {
  const safeFallback = safeNumber(fallback, 0);
  const normalizedFallback = safeFallback >= 0 ? safeFallback : 0;
  const safeValue = safeNumber(value, normalizedFallback);
  return safeValue >= 0 ? safeValue : normalizedFallback;
}
