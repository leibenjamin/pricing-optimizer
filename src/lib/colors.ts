// src/lib/colors.ts

// Shared color tokens for tiers/charts to stay consistent.
export type TierKey = "none" | "good" | "better" | "best";

export const TIER_COLORS: Record<TierKey, string> = {
  none: "#e2e8f0", // slate-200 (lighter to reduce dominance)
  good: "#22c55e", // emerald-500
  better: "#0ea5e9", // sky-500
  best: "#a855f7", // purple-500
};

// Backward compatible alias (older components still import this name).
export const TAKE_RATE_COLORS = TIER_COLORS;
