import { SHOP_CURRENCY_TYPES, type ShopCurrencyType } from "./shopUpgrades";

const SHOP_CURRENCY_PATH_SEGMENTS = Object.values(SHOP_CURRENCY_TYPES);

export function isShopCurrencyPathSegment(segment: string): segment is ShopCurrencyType {
  return (SHOP_CURRENCY_PATH_SEGMENTS as readonly string[]).includes(segment);
}

export function parseShopCurrencyPathSegment(segment: string | undefined): ShopCurrencyType | null {
  if (segment === undefined || !isShopCurrencyPathSegment(segment)) {
    return null;
  }
  return segment;
}

export function shopPathForCurrency(currency: ShopCurrencyType): string {
  return `/shop/${currency}`;
}
