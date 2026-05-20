/**
 * Hard-coded compile-time feature toggles. Flip these booleans in source when
 * rolling a feature in or out across the app. Not for per-user or remote flags.
 */
export const FEATURE_FLAGS = {
  RESEARCH_LABS: true,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
