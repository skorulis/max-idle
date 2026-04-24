export const SHOP_CURRENCY_TYPES = {
  IDLE: "idle",
  REAL: "real",
  GEM: "gem"
} as const;

export type ShopCurrencyType = (typeof SHOP_CURRENCY_TYPES)[keyof typeof SHOP_CURRENCY_TYPES];

export const SHOP_UPGRADE_IDS = {
  RESTRAINT: "restraint",
  LUCK: "luck"
} as const;

export type ShopUpgradeId = (typeof SHOP_UPGRADE_IDS)[keyof typeof SHOP_UPGRADE_IDS];

export type ShopUpgradeDefinition = {
  id: ShopUpgradeId;
  name: string;
  description: string;
  cost: number;
  currencyType: ShopCurrencyType;
};

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  description: "+50% idle gain, but you must wait 1 hour before collecting.",
  cost: 2 * 60 * 60,
  currencyType: SHOP_CURRENCY_TYPES.REAL
};

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  description: "50% chance to keep timer on collect.",
  cost: 7 * 24 * 60 * 60,
  currencyType: SHOP_CURRENCY_TYPES.IDLE
};

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [RESTRAINT_SHOP_UPGRADE, LUCK_SHOP_UPGRADE];

export const SHOP_UPGRADES_BY_ID: Record<ShopUpgradeId, ShopUpgradeDefinition> = {
  [SHOP_UPGRADE_IDS.RESTRAINT]: RESTRAINT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LUCK]: LUCK_SHOP_UPGRADE
};
