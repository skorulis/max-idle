/** Currency kinds for obligation rewards; matches survey / UI `formatRewardAmount` types. */
export type ObligationRewardType = "idle" | "real" | "gem";

export type ObligationReward = {
  type: ObligationRewardType;
  value: number;
};
