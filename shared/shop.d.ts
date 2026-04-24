export type ShopState = {
  seconds_multiplier: number;
  [key: string]: unknown;
};

export function normalizeShopState(shop: unknown): ShopState;
export function getSecondsMultiplier(shop: unknown): number;
export function withSecondsMultiplier(shop: unknown, secondsMultiplier: number): ShopState;
export function multiplierToLevel(secondsMultiplier: number): number;
export function levelToMultiplier(level: number): number;
export function getSecondsMultiplierUpgradeCost(currentLevel: number): number;
export function getSecondsMultiplierPurchaseCost(currentLevel: number, quantity: number): number;
