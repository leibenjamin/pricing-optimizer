// src/lib/viewModels.ts
// Thin builders for chart view models to keep App.tsx lean.
import type { FrontierComparison, FrontierMarker, FrontierPoint, FrontierViewModel } from "../components/FrontierChart";
import type { TornadoDatum } from "../components/Tornado";
import type { ScenarioRun } from "./domain";
import type { SnapshotKPIs } from "./snapshots";
import type { ScorecardDelta } from "./scorecard";
import type { Prices } from "./segments";
import type { Leakages } from "./waterfall";
import { simulateCohort } from "./simCohort";

export function buildFrontierViewModel(args: {
  base: { points: FrontierPoint[]; feasiblePoints?: FrontierPoint[]; infeasiblePoints?: FrontierPoint[]; optimum: FrontierPoint | null };
  alt?: FrontierComparison;
  markers?: FrontierMarker[];
  xLabel?: string;
  run?: ScenarioRun | null;
}): FrontierViewModel {
  return {
    base: {
      points: args.base.points,
      feasiblePoints: args.base.feasiblePoints,
      infeasiblePoints: args.base.infeasiblePoints,
      optimum: args.base.optimum,
    },
    alt: args.alt,
    markers: args.markers,
    xLabel: args.xLabel,
    scenarioRun: args.run ?? null,
  };
}

export function buildTornadoViewModel(args: {
  title: string;
  rows: TornadoDatum[];
  valueMode: "absolute" | "percent";
  metric: "profit" | "revenue";
  run?: ScenarioRun | null;
}) {
  return {
    title: args.title,
    rows: args.rows,
    valueMode: args.valueMode,
    metric: args.metric,
    run: args.run ?? null,
  };
}

export type ScorecardGuardrails = {
  gapLine: string;
  floorLine: string;
  optimizerLine: string;
};

export type ScorecardViewModel = {
  kpis: SnapshotKPIs;
  run: ScenarioRun | null;
  baselineRun: ScenarioRun | null;
  activeCustomers: number;
  baselineActiveCustomers: number | null;
  marginDeltaPP: number | null;
  explain: ScorecardDelta | null;
  guardrails: ScorecardGuardrails;
};

export function buildScorecardViewModel(args: {
  view: "current" | "optimized";
  baselineRun: ScenarioRun | null;
  optimizedRun: ScenarioRun | null;
  currentKPIs: SnapshotKPIs;
  optimizedKPIs: SnapshotKPIs | null;
  explainCurrent: ScorecardDelta | null;
  explainOptimized: ScorecardDelta | null;
  N: number;
  guardrailsCurrent: ScorecardGuardrails;
  guardrailsOptimized: ScorecardGuardrails;
}): ScorecardViewModel {
  const baselineKpis = args.baselineRun?.kpis ?? null;
  const activeKpis =
    args.view === "optimized" && args.optimizedKPIs ? args.optimizedKPIs : args.currentKPIs;
  const run = args.view === "optimized" ? args.optimizedRun : null;
  const explain = args.view === "optimized" ? args.explainOptimized : args.explainCurrent;
  const baselineActiveCustomers = baselineKpis
    ? Math.round(args.N * (1 - baselineKpis.shares.none))
    : null;
  const activeCustomers = Math.round(args.N * (1 - activeKpis.shares.none));
  const marginDeltaPP =
    baselineKpis && baselineKpis.revenue > 0
      ? ((activeKpis.revenue > 0 ? activeKpis.profit / activeKpis.revenue : 0) -
          baselineKpis.profit / baselineKpis.revenue) *
        100
      : null;
  const guardrails = args.view === "optimized" ? args.guardrailsOptimized : args.guardrailsCurrent;
  return {
    kpis: activeKpis,
    run,
    baselineRun: args.baselineRun,
    activeCustomers,
    baselineActiveCustomers,
    marginDeltaPP,
    explain,
    guardrails,
  };
}

export type CohortScenarioVM = {
  key: string;
  label: string;
  shares: SnapshotKPIs["shares"];
  points: Array<{ month: number; margin: number }>;
  total: number;
  month1: number;
  monthEnd: number;
};

export type CohortSummaryCard = {
  key: string;
  label: string;
  total: number;
  monthEnd: number;
  deltaTotal: number | null;
  deltaEnd: number | null;
};

export function buildCohortViewModel(args: {
  baseline: {
    label: string;
    kpis: SnapshotKPIs;
    prices: Prices;
    leak: Leakages;
    costs: Prices;
  } | null;
  current: {
    label: string;
    kpis: SnapshotKPIs;
    prices: Prices;
    leak: Leakages;
    costs: Prices;
  } | null;
  optimized: {
    label: string;
    kpis: SnapshotKPIs;
    prices: Prices;
    leak: Leakages;
    costs: Prices;
  } | null;
  retentionMonths: number;
  retentionPct: number;
}): { scenarios: CohortScenarioVM[]; summaries: CohortSummaryCard[] } {
  const r = args.retentionPct / 100;
  const months = Math.max(6, Math.min(24, args.retentionMonths));

  const build = (
    key: string,
    label: string,
    shares: SnapshotKPIs["shares"],
    pricesForMargin: Prices,
    leakForMargin: Leakages,
    costsForMargin: Prices
  ): CohortScenarioVM => {
    const pts = simulateCohort(pricesForMargin, shares, leakForMargin, costsForMargin, months, r);
    const total = pts.reduce((s, p) => s + p.margin, 0);
    return {
      key,
      label,
      shares,
      points: pts,
      total,
      month1: pts[0]?.margin ?? 0,
      monthEnd: pts[pts.length - 1]?.margin ?? 0,
    };
  };

  const scenarios: CohortScenarioVM[] = [];
  if (args.baseline) {
    scenarios.push(
      build("baseline", args.baseline.label, args.baseline.kpis.shares, args.baseline.prices, args.baseline.leak, args.baseline.costs)
    );
  }
  if (args.current) {
    scenarios.push(
      build("current", args.current.label, args.current.kpis.shares, args.current.prices, args.current.leak, args.current.costs)
    );
  }
  if (args.optimized) {
    scenarios.push(
      build("optimized", args.optimized.label, args.optimized.kpis.shares, args.optimized.prices, args.optimized.leak, args.optimized.costs)
    );
  }

  const summaries: CohortSummaryCard[] = [];
  if (scenarios.length) {
    const base = scenarios.find((c) => c.key === "baseline") ?? scenarios[0];
    scenarios.forEach((c) => {
      const deltaTotal = c.key === base.key ? null : c.total - base.total;
      const deltaEnd = c.key === base.key ? null : c.monthEnd - base.monthEnd;
      summaries.push({
        key: c.key,
        label: c.key === "baseline" ? "Baseline" : c.label,
        total: c.total,
        monthEnd: c.monthEnd,
        deltaTotal,
        deltaEnd,
      });
    });
  }

  return { scenarios, summaries };
}
