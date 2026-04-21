export type IdleRatePlayer = {
  secondsSinceLastCollection: number;
};

export function getIdleSecondsRate(player: IdleRatePlayer): number;
export function calculateIdleSecondsGain(secondsSinceLastCollection: number): number;
