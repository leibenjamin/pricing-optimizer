// src/lib/viewModels.ts
// Thin builders for chart view models to keep App.tsx lean.
import type { FrontierComparison, FrontierMarker, FrontierPoint, FrontierViewModel } from "../components/FrontierChart";
import type { TornadoDatum } from "../components/Tornado";
import type { ScenarioRun } from "./domain";

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
