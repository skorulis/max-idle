export const SHOP_CURRENCY_TYPES = {
  IDLE: "idle",
  REAL: "real",
  GEM: "gem"
} as const;

export type ShopCurrencyType = (typeof SHOP_CURRENCY_TYPES)[keyof typeof SHOP_CURRENCY_TYPES];

export const SHOP_UPGRADE_IDS = {
  SECONDS_MULTIPLIER: "seconds_multiplier",
  RESTRAINT: "restraint",
  LUCK: "luck"
} as const;

export type ShopUpgradeId = (typeof SHOP_UPGRADE_IDS)[keyof typeof SHOP_UPGRADE_IDS];

export const SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER = "%s";

export type ShopUpgradeLevel = {
  cost: number;
  value: number;
};

export type ShopUpgradeDefinition = {
  id: ShopUpgradeId;
  name: string;
  icon: string;
  description: string;
  levels: ShopUpgradeLevel[];
  currencyType: ShopCurrencyType;
};

export const SECONDS_MULTIPLIER_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER,
  name: "Seconds Multiplier",
  icon: "gauge",
  description: "Multiply idle gain by %s",
  levels: [
    { cost: 20, value: 1.1 },
    { cost: 60, value: 1.2 },
    { cost: 120, value: 1.3 },
    { cost: 300, value: 1.4 },
    { cost: 600, value: 1.5 },
    { cost: 30 * 60, value: 1.6 },
    { cost: 3600, value: 1.7 },
    { cost: 2 * 3600, value: 1.8 },
    { cost: 5 * 3600, value: 1.9 },
    { cost: 10 * 3600, value: 2.0 },
    { cost: 24 * 3600, value: 2.1 },
    { cost: 48 * 3600, value: 2.2 },
    { cost: 7 * 24 * 3600, value: 2.3 },
    { cost: 14 * 24 * 3600, value: 2.4 },
    { cost: 28 * 24 * 3600, value: 2.5 },
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
};

export const RESTRAINT_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.RESTRAINT,
  name: "Restraint",
  icon: "shield-alert",
  description: "Multiply idle gain by %s, you must wait 1 hour before collecting.",
  levels: [
    { cost: 2 * 60 * 60, value: 1.5 },
    { cost: 4 * 60 * 60, value: 1.75 },
    { cost: 8 * 60 * 60, value: 2.0 },
    { cost: 12 * 60 * 60, value: 2.25 },
    { cost: 16 * 60 * 60, value: 2.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.REAL
};

export const LUCK_SHOP_UPGRADE: ShopUpgradeDefinition = {
  id: SHOP_UPGRADE_IDS.LUCK,
  name: "Luck",
  icon: "dice-5",
  description: "%s chance to keep timer on collect.",
  levels: [
    { cost: 7 * 24 * 60 * 60, value: 0.1 },
    { cost: 14 * 24 * 60 * 60, value: 0.2 },
    { cost: 28 * 24 * 60 * 60, value: 0.3 },
    { cost: 56 * 24 * 60 * 60, value: 0.4 },
    { cost: 365 * 24 * 60 * 60, value: 0.5 }
  ],
  currencyType: SHOP_CURRENCY_TYPES.IDLE
};

export const SHOP_UPGRADES: ShopUpgradeDefinition[] = [
  SECONDS_MULTIPLIER_SHOP_UPGRADE,
  RESTRAINT_SHOP_UPGRADE,
  LUCK_SHOP_UPGRADE
];

export const SHOP_UPGRADES_BY_ID: Record<ShopUpgradeId, ShopUpgradeDefinition> = {
  [SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER]: SECONDS_MULTIPLIER_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.RESTRAINT]: RESTRAINT_SHOP_UPGRADE,
  [SHOP_UPGRADE_IDS.LUCK]: LUCK_SHOP_UPGRADE
};

export function formatShopUpgradeDescription(upgrade: ShopUpgradeDefinition, value: string): string {
  return upgrade.description.replace(SHOP_UPGRADE_DESCRIPTION_VALUE_PLACEHOLDER, value);
}
