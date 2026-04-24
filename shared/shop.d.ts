export type ShopState = {
  seconds_multiplier: number;
  restraint: boolean;
  luck: boolean;
  [key: string]: unknown;
};

export function normalizeShopState(shop: unknown): ShopState;
export function getSecondsMultiplier(shop: unknown): number;
export function withSecondsMultiplier(shop: unknown, secondsMultiplier: number): ShopState;
export function getRestraintEnabled(shop: unknown): boolean;
export function withRestraint(shop: unknown, enabled: boolean): ShopState;
export function getRestraintUpgradeCost(): number;
export function getLuckEnabled(shop: unknown): boolean;
export function withLuck(shop: unknown, enabled: boolean): ShopState;
export function getLuckUpgradeCost(): number;
export function multiplierToLevel(secondsMultiplier: number): number;
export function levelToMultiplier(level: number): number;
export function getSecondsMultiplierUpgradeCost(currentLevel: number): number;
export function getSecondsMultiplierPurchaseCost(currentLevel: number, quantity: number): number;
