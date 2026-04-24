import type { ShopState } from "./shop";

export type IdleRatePlayer = {
  secondsSinceLastCollection: number;
};

export function getIdleSecondsRate(player: IdleRatePlayer): number;
export function calculateIdleSecondsGain(secondsSinceLastCollection: number): number;

export type IdleCollectionPlayer = {
  secondsSinceLastCollection: number;
  shop: ShopState | unknown;
  achievementBonusMultiplier: number;
};

export function isIdleCollectionBlockedByRestraint(player: {
  secondsSinceLastCollection: number;
  shop: ShopState | unknown;
}): boolean;
export function getIdleShopBonusMultiplier(shop: ShopState | unknown): number;
export function calculateBoostedIdleSecondsGain(player: IdleCollectionPlayer): number;
export function getEffectiveIdleSecondsRate(player: IdleCollectionPlayer): number;
export function shouldPreserveIdleTimerOnCollect(shop: ShopState | unknown, randomValue?: number): boolean;
