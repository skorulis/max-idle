/** Currency kinds for obligation rewards; matches survey / UI `formatRewardAmount` types. */
export type ObligationRewardType = "idle" | "real" | "gem";

export type ObligationCurrencyReward = {
  type: ObligationRewardType;
  value: number;
};

/** Display-only reward (e.g. feature unlock); no currency delta from `sumObligationRewardDeltas`. */
export type ObligationTextReward = {
  type: "text";
  label: string;
};

export type ObligationReward = ObligationCurrencyReward | ObligationTextReward;
