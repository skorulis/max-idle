import { describe, expect, it } from "vitest";
import { getDailyBonusActivationCostIdleSeconds } from "./dailyBonus.js";
import { DEFAULT_RESEARCH_STATE } from "./research.js";
import { RESEARCH_ITEM_IDS } from "./researchItems.js";
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants.js";

describe("getDailyBonusActivationCostIdleSeconds", () => {
  it("returns 24 hours at research level 0", () => {
    expect(getDailyBonusActivationCostIdleSeconds(DEFAULT_RESEARCH_STATE)).toBe(24 * SECONDS_PER_HOUR);
  });

  it("reduces activation cost by 30 minutes per research level", () => {
    expect(
      getDailyBonusActivationCostIdleSeconds({
        ...DEFAULT_RESEARCH_STATE,
        levels: { [RESEARCH_ITEM_IDS.DAILY_BONUS_ACTIVATION_COST]: 5 }
      })
    ).toBe(24 * SECONDS_PER_HOUR - 5 * 30 * SECONDS_PER_MINUTE);
  });

  it("returns 4 hours at max research level 40", () => {
    expect(
      getDailyBonusActivationCostIdleSeconds({
        ...DEFAULT_RESEARCH_STATE,
        levels: { [RESEARCH_ITEM_IDS.DAILY_BONUS_ACTIVATION_COST]: 40 }
      })
    ).toBe(4 * SECONDS_PER_HOUR);
  });
});
