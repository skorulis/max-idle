import { formatSeconds } from "../formatSeconds";
import {
  Atom,
  CircleHelp,
  Clock3,
  Gem,
  Hourglass,
  Plus,
} from "lucide-react";
import { Fragment, useState } from "react";
import type { SyncedPlayerState } from "../app/types";
import { safeNaturalNumber } from "@maxidle/shared/safeNumber";
import {
  SHOP_CURRENCY_TYPES,
  SHOP_UPGRADE_IDS,
  SHOP_UPGRADES,
  type ShopUpgradeDefinition,
  type ShopUpgradeId
} from "../shopUpgrades";
import type { ShopCurrencyType } from "../shopUpgrades";
import {
  formatShopUpgradeDescription,
  getPurchasedShopUpgradeLevelCount,
  getShopCurrencyTierPurchaseCostSum,
  getWorthwhileAchievementsMultiplier,
  hasRefundableIdleShopPurchases,
  hasRefundableRealShopPurchases,
  withShopUpgradeLevel
} from "../shop";
import GameIcon from "../GameIcon";
import { getLucidIcon } from "../getLucidIcon";
import { ShopUpgradeInfoOverlay } from "./ShopUpgradeInfoOverlay";

type ShopPageProps = {
  playerState: SyncedPlayerState | null;
  /** Estimated server clock for live streak labels (e.g. Anti-consumerist overlay) */
  estimatedServerNowMs: number;
  shopPendingQuantity:
    | "seconds_multiplier"
    | "another_seconds_multiplier"
    | "patience"
    | "restraint"
    | "idle_hoarder"
    | "worthwhile_achievements"
    | "anti_consumerist"
    | "consolidation"
    | "quick_collector"
    | "luck"
    | "extra_realtime_wait"
    | "collect_gem_time_boost"
    | "idle_refund"
    | "real_refund"
    | "daily_bonus_feature"
    | "tournament_feature"
    | "storage_extension"
    | null;
  /** Purchase flow for any shop upgrade row; `upgradeId` matches {@link SHOP_UPGRADE_IDS}. */
  onPurchase: (upgradeId: ShopUpgradeId) => Promise<void>;
  onNavigateHome: () => void;
};

function getCurrencyAmount(playerState: SyncedPlayerState, currencyType: ShopCurrencyType): number {
  if (currencyType === SHOP_CURRENCY_TYPES.IDLE) {
    return playerState.idleTime.available;
  }
  if (currencyType === SHOP_CURRENCY_TYPES.REAL) {
    return playerState.realTime.available;
  }
  return playerState.timeGems.available;
}

function formatUpgradeCost(currencyType: ShopCurrencyType, amount: number): string {
  if (currencyType === SHOP_CURRENCY_TYPES.GEM) {
    return amount.toString();
  }
  return formatSeconds(amount);
}

function formatDecimalUpTo2(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatMultiplier(value: number): string {
  return `${formatDecimalUpTo2(value)}x`;
}

function formatChance(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatUpgradeValue(upgrade: ShopUpgradeDefinition, value: number): string {
  if (upgrade.id === SHOP_UPGRADE_IDS.LUCK) {
    return formatChance(value);
  }
  /** Template includes literal `x` after placeholder (`%sx`). */
  if (upgrade.id === SHOP_UPGRADE_IDS.IDLE_HOARDER) {
    return formatDecimalUpTo2(value);
  }
  if (
    upgrade.id === SHOP_UPGRADE_IDS.SECONDS_MULTIPLIER ||
    (upgrade.id as string) === "another_seconds_multiplier" ||
    upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT ||
    upgrade.id === SHOP_UPGRADE_IDS.COLLECT_GEM_TIME_BOOST ||
    upgrade.id === SHOP_UPGRADE_IDS.CONSOLIDATION ||
    upgrade.id === SHOP_UPGRADE_IDS.QUICK_COLLECTOR
  ) {
    return formatMultiplier(value);
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS) {
    return `${value.toFixed(2)}×`;
  }
  /** Template includes literal `x` after placeholder (`%sx`). */
  if (upgrade.id === SHOP_UPGRADE_IDS.ANTI_CONSUMERIST) {
    return formatDecimalUpTo2(value);
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.STORAGE_EXTENSION) {
    return formatSeconds(value, 2, "floor");
  }
  return value.toString();
}

/** Second `%s` in `valueDescription` (e.g. restraint wait hours). */
function formatUpgradeSecondaryValue(upgrade: ShopUpgradeDefinition, value2: number): string {
  if (
    upgrade.id === SHOP_UPGRADE_IDS.PATIENCE ||
    upgrade.id === SHOP_UPGRADE_IDS.ANTI_CONSUMERIST ||
    upgrade.id === SHOP_UPGRADE_IDS.QUICK_COLLECTOR
  ) {
    return formatSeconds(value2, 2, "floor");
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.RESTRAINT) {
    return String(Math.round(value2));
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.IDLE_HOARDER) {
    return formatDecimalUpTo2(value2);
  }
  if (upgrade.id === SHOP_UPGRADE_IDS.CONSOLIDATION) {
    return String(Math.round(value2));
  }
  return formatUpgradeValue(upgrade, value2);
}

function formatValueDescription(
  upgrade: ShopUpgradeDefinition,
  value: number,
  value2?: number
): string {
  const valueDescription = upgrade.valueDescription;
  if (!valueDescription) {
    return "";
  }
  let result = valueDescription.replace("%s", formatUpgradeValue(upgrade, value));
  if (result.includes("%s")) {
    result = result.replace(
      "%s",
      value2 !== undefined ? formatUpgradeSecondaryValue(upgrade, value2) : ""
    );
  }
  return result;
}

function formatShopCategoryTitle(category: string): string {
  return category
    .trim()
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

type ShopUpgradeGroup = {
  categoryKey: string | null;
  categoryTitle: string | null;
  upgrades: ShopUpgradeDefinition[];
};

/** Uncategorized first (no header), then each distinct category in first-seen order. */
function groupVisibleShopUpgradesByCategory(upgrades: ShopUpgradeDefinition[]): ShopUpgradeGroup[] {
  const uncategorized: ShopUpgradeDefinition[] = [];
  const categoryKeys: string[] = [];
  const byCategory = new Map<string, ShopUpgradeDefinition[]>();

  for (const upgrade of upgrades) {
    const raw = upgrade.category?.trim();
    if (!raw) {
      uncategorized.push(upgrade);
      continue;
    }
    if (!byCategory.has(raw)) {
      byCategory.set(raw, []);
      categoryKeys.push(raw);
    }
    byCategory.get(raw)!.push(upgrade);
  }

  const groups: ShopUpgradeGroup[] = [];
  if (uncategorized.length > 0) {
    groups.push({ categoryKey: null, categoryTitle: null, upgrades: uncategorized });
  }
  for (const key of categoryKeys) {
    const list = byCategory.get(key);
    if (list && list.length > 0) {
      groups.push({
        categoryKey: key,
        categoryTitle: formatShopCategoryTitle(key),
        upgrades: list
      });
    }
  }
  return groups;
}

export function ShopPage({
  playerState,
  estimatedServerNowMs,
  shopPendingQuantity,
  onPurchase,
  onNavigateHome
}: ShopPageProps) {
  const [selectedCurrencyType, setSelectedCurrencyType] = useState<ShopCurrencyType>(SHOP_CURRENCY_TYPES.IDLE);
  const [selectedUpgradeForInfo, setSelectedUpgradeForInfo] = useState<ShopUpgradeDefinition | null>(null);

  if (!playerState) {
    return (
      <section className="card">
        <p>Start idling to unlock the shop.</p>
        <button type="button" className="secondary" onClick={onNavigateHome}>
          Go to Home
        </button>
      </section>
    );
  }

  const syncedPlayer = playerState;

  const idlePurchasedLevels = getPurchasedShopUpgradeLevelCount(syncedPlayer.shop, SHOP_CURRENCY_TYPES.IDLE);
  const realPurchasedLevels = getPurchasedShopUpgradeLevelCount(syncedPlayer.shop, SHOP_CURRENCY_TYPES.REAL);

  const visibleUpgrades = SHOP_UPGRADES.filter((upgrade) => upgrade.currencyType === selectedCurrencyType);
  const visibleUpgradeGroups = groupVisibleShopUpgradesByCategory(visibleUpgrades);
  function getValueDescriptionParts(
    upgrade: ShopUpgradeDefinition,
    playerState: SyncedPlayerState,
    level: number
  ): { value: number; value2?: number } | null {
    const valueDescription = upgrade.valueDescription;
    if (typeof valueDescription !== "string" || valueDescription.length === 0) {
      return null;
    }
    if (level > upgrade.maxLevel()) {
      return null;
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS) {
      const achievementCount = safeNaturalNumber(playerState.achievementCount);
      const value = getWorthwhileAchievementsMultiplier(
        withShopUpgradeLevel(playerState.shop, SHOP_UPGRADE_IDS.WORTHWHILE_ACHIEVEMENTS, level),
        achievementCount
      );
      return { value };
    }
    if (level <= 0) {
      const zl = upgrade.zeroLevel;
      if (!zl) {
        return null;
      }
      if (upgrade.id === SHOP_UPGRADE_IDS.PATIENCE) {
        if (!Number.isFinite(zl.value) || !Number.isFinite(zl.value2)) {
          return null;
        }
        return { value: zl.value, value2: zl.value2 };
      }
      const value = zl.value;
      if (value === undefined || value === null || !Number.isFinite(value)) {
        return null;
      }
      const rawV2 = zl.value2;
      if (rawV2 !== undefined && Number.isFinite(rawV2)) {
        return { value, value2: rawV2 };
      }
      return { value };
    }
    if (upgrade.id === SHOP_UPGRADE_IDS.PATIENCE) {
      const levelDef = upgrade.levels[level - 1];
      if (!levelDef || !Number.isFinite(levelDef.value) || !Number.isFinite(levelDef.value2)) {
        return null;
      }
      return { value: levelDef.value, value2: levelDef.value2 };
    }

    const levelDef = upgrade.levels[level - 1];
    const value = levelDef?.value;
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return null;
    }
    const rawV2 = levelDef?.value2;
    if (rawV2 !== undefined && Number.isFinite(rawV2)) {
      return { value, value2: rawV2 };
    }
    return { value };
  }

  function getUpgradeRowState(upgrade: ShopUpgradeDefinition): {
    description: string;
    currentValueDescription: string | null;
    nextValueDescription: string | null;
    cost: number | null;
    isPending: boolean;
    isOwned: boolean;
    onPurchase: () => Promise<void>;
  } {
    const purchasedLevel = getUpgradeCurrentLevel(upgrade) ?? 0;
    const currentParts = getValueDescriptionParts(upgrade, syncedPlayer, purchasedLevel);
    const nextParts = getValueDescriptionParts(upgrade, syncedPlayer, purchasedLevel + 1);

    const currentValueDescription =
      currentParts !== null
        ? formatValueDescription(upgrade, currentParts.value, currentParts.value2)
        : null;
    const nextValueDescription =
      nextParts !== null
        ? formatValueDescription(upgrade, nextParts.value, nextParts.value2)
        : null;

    if (upgrade.id === SHOP_UPGRADE_IDS.EXTRA_REALTIME_WAIT) {
      const level = upgrade.levels[0] ?? null;
      return {
        description: level
          ? formatShopUpgradeDescription(upgrade, formatSeconds(level.value, 2, "floor"))
          : upgrade.description,
        currentValueDescription,
        nextValueDescription,
        cost: level?.cost ?? null,
        isPending: shopPendingQuantity === upgrade.id,
        isOwned: false,
        onPurchase: () => onPurchase(upgrade.id)
      };
    }

    const currentLevel = upgrade.currentLevel(syncedPlayer.shop);
    const maxLevel = upgrade.maxLevel();
    const isOwned = currentLevel >= maxLevel;
    const isPending = shopPendingQuantity === upgrade.id;
    const nextLevel = upgrade.levels[currentLevel] ?? null;
    const cost =
      upgrade.currencyType === SHOP_CURRENCY_TYPES.GEM
        ? nextLevel?.cost ?? null
        : isOwned
          ? null
          : getShopCurrencyTierPurchaseCostSum(
              upgrade.currencyType,
              upgrade.currencyType === SHOP_CURRENCY_TYPES.IDLE ? idlePurchasedLevels : realPurchasedLevels,
              1
            );
    return {
      description:
        isOwned
            ? "Maximum level reached."
            : upgrade.description,
      currentValueDescription,
      nextValueDescription,
      cost,
      isPending,
      isOwned,
      onPurchase: () => onPurchase(upgrade.id)
    };
  }

  function getUpgradeCurrentLevel(upgrade: ShopUpgradeDefinition): number | null {
    if (upgrade.levels.length <= 1) {
      return null;
    }
    return upgrade.currentLevel(syncedPlayer.shop);
  }

  return (
    <>
      <section className="card">
        <h2>Shop</h2>
        <div className="shop-currencies">
          <button
            type="button"
            className={`shop-currency-card shop-currency-button${
              selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE ? " shop-currency-card-active" : ""
            }`}
            onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.IDLE)}
            aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.IDLE}
          >
            <p className="shop-currency-title">
              <Atom size={16} aria-hidden="true" />
              Idle Time
            </p>
            <p className="shop-currency-value">{formatSeconds(syncedPlayer.idleTime.available, 2, "floor")}</p>
            <p className="subtle shop-currency-purchased">
              {idlePurchasedLevels} purchase{idlePurchasedLevels === 1 ? "" : "s"} made
            </p>
          </button>
          <button
            type="button"
            className={`shop-currency-card shop-currency-button${
              selectedCurrencyType === SHOP_CURRENCY_TYPES.REAL ? " shop-currency-card-active" : ""
            }`}
            onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.REAL)}
            aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.REAL}
          >
            <p className="shop-currency-title">
              <Clock3 size={16} aria-hidden="true" />
              Real Time
            </p>
            <p className="shop-currency-value">{formatSeconds(syncedPlayer.realTime.available, 2, "floor")}</p>
            <p className="subtle shop-currency-purchased">
              {realPurchasedLevels} purchase{realPurchasedLevels === 1 ? "" : "s"} made
            </p>
          </button>
          <button
            type="button"
            className={`shop-currency-card shop-currency-button${
              selectedCurrencyType === SHOP_CURRENCY_TYPES.GEM ? " shop-currency-card-active" : ""
            }`}
            onClick={() => setSelectedCurrencyType(SHOP_CURRENCY_TYPES.GEM)}
            aria-pressed={selectedCurrencyType === SHOP_CURRENCY_TYPES.GEM}
          >
            <p className="shop-currency-title">
              <Gem size={16} aria-hidden="true" />
              Time Gems
            </p>
            <p className="shop-currency-value">{syncedPlayer.timeGems.available}</p>
          </button>
        </div>
        {visibleUpgrades.length === 0 ? (
          <p className="subtle">No upgrades currently available for this currency.</p>
        ) : (
          <div className="shop-upgrade-list">
            {visibleUpgradeGroups.map((group) => (
              <Fragment key={group.categoryKey ?? "__uncategorized__"}>
                {group.categoryTitle ? (
                  <div className="shop-upgrade-category">
                    <hr className="shop-upgrade-category-rule" aria-hidden="true" />
                    <h3 className="shop-upgrade-category-title">{group.categoryTitle}</h3>
                    <hr className="shop-upgrade-category-rule" aria-hidden="true" />
                  </div>
                ) : null}
                {group.upgrades.map((upgrade) => {
                  const upgradeState = getUpgradeRowState(upgrade);
                  const currentLevel = getUpgradeCurrentLevel(upgrade);
                  const upgradeAvailableBalance = getCurrencyAmount(syncedPlayer, upgrade.currencyType);
                  const cannotAfford = upgradeState.cost !== null && upgradeAvailableBalance < upgradeState.cost;
                  const refundUnavailable =
                    (upgrade.id === SHOP_UPGRADE_IDS.IDLE_REFUND &&
                      !hasRefundableIdleShopPurchases(syncedPlayer.shop)) ||
                    (upgrade.id === SHOP_UPGRADE_IDS.REAL_REFUND &&
                      !hasRefundableRealShopPurchases(syncedPlayer.shop));
                  const isDisabled =
                    shopPendingQuantity !== null ||
                    upgradeState.isOwned ||
                    upgradeState.cost === null ||
                    cannotAfford ||
                    refundUnavailable;
                  const isPurchasable = !isDisabled && !upgradeState.isPending;
                  return (
                    <div key={upgrade.id} className={`shop-upgrade-row${upgradeState.isOwned ? " shop-upgrade-row-owned" : ""}`}>
                      <div className="shop-upgrade-main">
                        <GameIcon icon={getLucidIcon(upgrade.icon)} className="shop-upgrade-icon" />
                        <div className="shop-upgrade-copy">
                          <div className="shop-upgrade-name-row">
                            <p className="shop-upgrade-name">
                              {upgrade.name}
                              {currentLevel !== null ? ` (Lvl ${currentLevel})` : ""}
                            </p>
                            <button
                              type="button"
                              className="info-icon-button shop-upgrade-info-button"
                              aria-label={`Show details for ${upgrade.name}`}
                              onClick={() => setSelectedUpgradeForInfo(upgrade)}
                            >
                              <CircleHelp size={14} aria-hidden="true" />
                            </button>
                          </div>
                          <p className="shop-upgrade-description">{upgradeState.description}</p>
                          {upgradeState.currentValueDescription ? (
                            <p className="shop-upgrade-description subtle">Current: {upgradeState.currentValueDescription}</p>
                          ) : null}
                          {upgradeState.nextValueDescription ? (
                            <p className="shop-upgrade-description subtle">Next: {upgradeState.nextValueDescription}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="shop-upgrade-action">
                        <button
                          type="button"
                          className={`secondary shop-upgrade-buy-button${isPurchasable ? " shop-upgrade-buy-button-purchasable" : ""}`}
                          onClick={() => void upgradeState.onPurchase()}
                          disabled={isDisabled}
                          aria-label={upgradeState.isPending ? "Purchase in progress" : undefined}
                        >
                          {upgradeState.isOwned ? (
                            "Owned"
                          ) : upgradeState.isPending ? (
                            <Hourglass
                              size={16}
                              aria-hidden="true"
                              className="shop-upgrade-buy-hourglass-spin"
                            />
                          ) : upgradeState.cost === null ? (
                            "Max level"
                          ) : (
                            <>
                              <Plus size={18} aria-hidden="true" className="shop-upgrade-buy-plus" />
                              <span className="shop-upgrade-buy-cost">
                                {formatUpgradeCost(upgrade.currencyType, upgradeState.cost)}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
      </section>
      <ShopUpgradeInfoOverlay
        open={selectedUpgradeForInfo !== null}
        upgrade={selectedUpgradeForInfo}
        shop={syncedPlayer.shop}
        estimatedServerNowMs={estimatedServerNowMs}
        onClose={() => setSelectedUpgradeForInfo(null)}
      />
    </>
  );
}
