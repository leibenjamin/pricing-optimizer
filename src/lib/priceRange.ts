// src/lib/priceRange.ts
import type { Tier } from "./waterfall";

export type TierRange = { min: number; max: number };
export type TierRangeMap = Partial<Record<Tier, TierRange>>;
export type PriceRangeSource = "synthetic" | "imported" | "shared";

const TIER_VALUES: readonly Tier[] = ["good", "better", "best"] as const;

export function isTier(val: unknown): val is Tier {
  return TIER_VALUES.includes(val as Tier);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Collapse a list of alternative rows into tier-level min/max stats.
 * Accepts any shape that exposes { alt, price }.
 */
export function collectPriceRange(
  rows: Array<{ alt: unknown; price: unknown }>
): TierRangeMap {
  const acc: TierRangeMap = {};
  for (const row of rows) {
    if (!isTier(row.alt)) continue;
    const price = toNumber(row.price);
    if (price == null) continue;
    const stats = acc[row.alt];
    if (!stats) {
      acc[row.alt] = { min: price, max: price };
    } else {
      stats.min = Math.min(stats.min, price);
      stats.max = Math.max(stats.max, price);
    }
  }
  return acc;
}

export function hasMeaningfulRange(map: TierRangeMap | null | undefined): boolean {
  if (!map) return false;
  return TIER_VALUES.some((tier) => {
    const stats = map[tier];
    return Boolean(
      stats &&
        Number.isFinite(stats.min) &&
        Number.isFinite(stats.max) &&
        stats.max > stats.min
    );
  });
}
