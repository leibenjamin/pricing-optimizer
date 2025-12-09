// src/lib/domain.ts
// Shared domain shapes for scenarios, runs, and uncertainty so components can use thin props.
import type { Features, Prices, Segment, Tier } from "./segments";
import type { Leakages } from "./waterfall";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import type { SearchRanges, Constraints } from "./optimize";
import type { SnapshotKPIs } from "./snapshots";
import type { ScorecardBand } from "./scorecard";

// Basic ladder aliases to keep terminology consistent.
export type Ladder = Prices;

export type ChannelMix = Array<{ preset: string; w: number }>;

// Lightweight uncertainty ranges; heuristic-friendly for now.
export type MetricRange = {
  mean: number;
  p10: number;
  p50?: number;
  p90: number;
};

export type ScenarioUncertainty = {
  priceScaleDelta?: number;
  leakDeltaPct?: number;
  metrics?: {
    revenue?: MetricRange;
    profit?: MetricRange;
    arpu?: MetricRange;
    takeRate?: MetricRange;
    pocketMargin?: MetricRange;
  };
  probBelowBaseline?: number;
  source?: "preset" | "heuristic" | "precomputed" | "simulated";
  note?: string;
};

export type Scenario = {
  id: string;
  name: string;
  prices: Prices;
  costs: Prices;
  refPrices: Prices;
  features?: Features;
  segments?: Segment[];
  leak: Leakages;
  priceScale?: number;
  uncertainty?: ScenarioUncertainty;
  channelMix?: ChannelMix;
  priceRange?: TierRangeMap;
  priceRangeSource?: PriceRangeSource;
  optRanges?: SearchRanges;
  optConstraints?: Constraints;
  tornado?: {
    usePocket?: boolean;
    priceBump?: number;
    pctBump?: number;
    rangeMode?: "symmetric" | "data";
    metric?: "profit" | "revenue";
    valueMode?: "absolute" | "percent";
  };
  retentionPct?: number;
  kpiFloorAdj?: number;
  note?: string;
};

export type ScenarioBasis = {
  usePocketProfit?: boolean;
  usePocketMargins?: boolean;
};

// Snapshot of a run (baseline or optimized) bound to a scenario.
export type ScenarioRunMeta = {
  label: string;
  savedAt: number;
  source: "baseline" | "optimized" | "imported" | "manual";
};

export type ScenarioRun = {
  id: string;
  scenarioId: string;
  ladder: Ladder;
  costs: Prices;
  leak: Leakages;
  refPrices?: Prices;
  features: Features;
  segments: Segment[];
  basis: ScenarioBasis;
  kpis: SnapshotKPIs;
  scorecardBand?: ScorecardBand;
  frontierBand?: ScorecardBand;
  uncertainty?: ScenarioUncertainty;
  meta: ScenarioRunMeta;
  note?: string;
};

export type ScenarioBundle = {
  scenario: Scenario;
  baseline: ScenarioRun;
  optimized?: ScenarioRun | null;
  activeRunId: ScenarioRun["id"];
};

// Utility to describe tiered shapes without re-importing Tier everywhere.
export type Tiered<T> = Record<Tier, T>;

// Helper to construct a ScenarioRun from current state slices.
export function makeScenarioRun(args: {
  scenarioId: string;
  ladder: Ladder;
  costs: Prices;
  leak: Leakages;
  refPrices?: Prices;
  features: Features;
  segments: Segment[];
  basis?: ScenarioBasis;
  kpis: SnapshotKPIs;
  scorecardBand?: ScorecardBand;
  frontierBand?: ScorecardBand;
  uncertainty?: ScenarioUncertainty;
  meta?: Partial<ScenarioRunMeta>;
  note?: string;
}): ScenarioRun {
  const meta: ScenarioRunMeta = {
    label: args.meta?.label ?? "Snapshot",
    savedAt: args.meta?.savedAt ?? Date.now(),
    source: args.meta?.source ?? "baseline",
  };
  return {
    id: `${args.scenarioId}-${Math.random().toString(36).slice(2, 8)}`,
    scenarioId: args.scenarioId,
    ladder: args.ladder,
    costs: args.costs,
    leak: args.leak,
    refPrices: args.refPrices,
    features: args.features,
    segments: args.segments,
    basis: args.basis ?? {},
    kpis: args.kpis,
    scorecardBand: args.scorecardBand,
    frontierBand: args.frontierBand,
    uncertainty: args.uncertainty,
    meta,
    note: args.note,
  };
}
