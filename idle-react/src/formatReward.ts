import type { SurveyCurrencyType } from "./app/types";
import { formatSeconds } from "./formatSeconds";

/** Human-readable amount for idle seconds, real seconds, or time gems (survey rewards, copy, etc.). */
export function formatRewardAmount(currencyType: SurveyCurrencyType, value: number): string {
  switch (currencyType) {
    case "gem":
      return `${value} Time Gem${value === 1 ? "" : "s"}`;
    case "idle":
      return `${formatSeconds(value)} of idle time`;
    case "real":
      return `${formatSeconds(value)} of real time`;
    default: {
      const _exhaustive: never = currencyType;
      return _exhaustive;
    }
  }
}
