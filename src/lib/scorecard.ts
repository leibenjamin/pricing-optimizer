// src/lib/scorecard.ts
import type { SnapshotKPIs } from "./snapshots";

export type ScorecardDelta = {
  deltaProfit: number;
  deltaRevenue: number;
  deltaARPU: number;
  deltaActive: number;
  mainDriver: string;
  segmentLine: string;
  suggestion: string;
};

export type ScorecardBand = {
  priceDelta?: number;
  leakDelta?: number;
  low: { revenue: number; profit: number };
  high: { revenue: number; profit: number };
};

export type ScorecardShareTile = {
  tier: "good" | "better" | "best";
  sharePct: number;
  baselineSharePct: number | null;
  deltaPP: number | null;
};

export function shareTilesFromKPIs(
  kpis: SnapshotKPIs,
  baseline: SnapshotKPIs | null
): ScorecardShareTile[] {
  const tiers: Array<"good" | "better" | "best"> = ["good", "better", "best"];
  return tiers.map((tier) => {
    const sharePct = Math.max(
      0,
      Math.round((kpis.shares[tier] ?? 0) * 1000) / 10
    );
    const baselineSharePct = baseline
      ? Math.round((baseline.shares[tier] ?? 0) * 1000) / 10
      : null;
    const deltaPP =
      baselineSharePct !== null ? sharePct - baselineSharePct : null;
    return { tier, sharePct, baselineSharePct, deltaPP };
  });
}

