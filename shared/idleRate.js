const IDLE_RATE_STEPS = [
  { seconds: 0, rate: 1 },
  { seconds: 60, rate: 2 },
  { seconds: 10 * 60, rate: 4 },
  { seconds: 60 * 60, rate: 6 },
  { seconds: 6 * 60 * 60, rate: 8 },
  { seconds: 24 * 60 * 60, rate: 16 },
  { seconds: 7 * 24 * 60 * 60, rate: 32 },
  { seconds: 4 * 7 * 24 * 60 * 60, rate: 64 },
  { seconds: 365 * 24 * 60 * 60, rate: 128 }
];

function clampElapsedSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function interpolateRate(start, end, elapsedSeconds) {
  const range = end.seconds - start.seconds;
  if (range <= 0) {
    return end.rate;
  }
  const progress = (elapsedSeconds - start.seconds) / range;
  return start.rate + (end.rate - start.rate) * progress;
}

export function getIdleSecondsRate(player) {
  const elapsedSeconds = clampElapsedSeconds(player.secondsSinceLastCollection);
  if (elapsedSeconds <= 0) {
    return IDLE_RATE_STEPS[0].rate;
  }

  for (let i = 1; i < IDLE_RATE_STEPS.length; i += 1) {
    const end = IDLE_RATE_STEPS[i];
    if (elapsedSeconds <= end.seconds) {
      return interpolateRate(IDLE_RATE_STEPS[i - 1], end, elapsedSeconds);
    }
  }

  return IDLE_RATE_STEPS[IDLE_RATE_STEPS.length - 1].rate;
}

export function calculateIdleSecondsGain(secondsSinceLastCollection) {
  const elapsedSeconds = clampElapsedSeconds(secondsSinceLastCollection);
  if (elapsedSeconds <= 0) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < IDLE_RATE_STEPS.length; i += 1) {
    const start = IDLE_RATE_STEPS[i - 1];
    const end = IDLE_RATE_STEPS[i];
    if (elapsedSeconds <= start.seconds) {
      break;
    }

    const segmentEnd = Math.min(elapsedSeconds, end.seconds);
    const delta = segmentEnd - start.seconds;
    if (delta <= 0) {
      continue;
    }

    const slope = (end.rate - start.rate) / (end.seconds - start.seconds);
    total += start.rate * delta + 0.5 * slope * delta * delta;
  }

  const lastStep = IDLE_RATE_STEPS[IDLE_RATE_STEPS.length - 1];
  if (elapsedSeconds > lastStep.seconds) {
    total += (elapsedSeconds - lastStep.seconds) * lastStep.rate;
  }

  return Math.floor(total);
}
