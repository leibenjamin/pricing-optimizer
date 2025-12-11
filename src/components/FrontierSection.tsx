import type { ComponentType, ReactNode } from "react";
import { Suspense } from "react";
import type { Tier } from "../lib/waterfall";
import type { FrontierViewModel } from "./FrontierChart";
import { Section } from "./Section";
import InfoTip from "./InfoTip";
import ErrorBoundary from "./ErrorBoundary";

type FrontierSectionProps = {
  frontierViewModel: FrontierViewModel;
  frontierSummary: {
    headline: string;
    feasibility: { feasibleCount: number; infeasibleCount: number };
  } | null;
  riskNote?: string | null;
  frontierTier: Tier;
  setFrontierTier: (tier: Tier) => void;
  frontierCompareCharm: boolean;
  setFrontierCompareCharm: (v: boolean) => void;
  usePocketProfit: boolean;
  frontierSweep: { min: number; max: number; step: number };
  actions?: ReactNode;
  FrontierChartComponent: ComponentType<{ chartId: string; viewModel: FrontierViewModel }>;
};

export function FrontierSection({
  frontierViewModel,
  frontierSummary,
  riskNote,
  frontierTier,
  setFrontierTier,
  frontierCompareCharm,
  setFrontierCompareCharm,
  usePocketProfit,
  frontierSweep,
  actions,
  FrontierChartComponent,
}: FrontierSectionProps) {
  return (
    <Section
      id="profit-frontier"
      title="Profit Frontier"
      className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
      actions={actions}
    >
      <div
        data-copy-slot="chart.profitFrontier"
        className="text-sm text-slate-700 leading-snug"
      >
        Frontier sweeps the selected tier across its scenario/optimizer range and holds the other tiers fixed. Markers show Baseline/Current/Optimized prices; infeasible points flag where gaps/margins fail. Use this to sanity-check before or after running the optimizer.
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 mb-2">
        <label className="flex items-center gap-1">
          Sweep tier
          <select
            className="border rounded px-2 h-7 bg-white"
            value={frontierTier}
            onChange={(e) => setFrontierTier(e.target.value as Tier)}
          >
            <option value="good">Good</option>
            <option value="better">Better</option>
            <option value="best">Best</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Charm comparison
          <input
            type="checkbox"
            checked={frontierCompareCharm}
            onChange={(e) => setFrontierCompareCharm(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[11px] text-slate-600">
            Compare {frontierCompareCharm ? "with vs without .99" : "without vs with .99"}
          </span>
        </label>
      </div>

      {frontierSummary && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-800">
          {frontierSummary.headline}
          <div className="mt-1 text-[11px] text-slate-600">
            Feasible points: {frontierSummary.feasibility.feasibleCount.toLocaleString()}{" "}
            {frontierSummary.feasibility.infeasibleCount
              ? `(infeasible flagged: ${frontierSummary.feasibility.infeasibleCount.toLocaleString()})`
              : ""}
          </div>
        </div>
      )}
      <div className="text-[11px] text-slate-600">
        Basis: {usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}; sweep {frontierTier} from ${frontierSweep.min.toFixed(2)} to ${frontierSweep.max.toFixed(2)} (step {frontierSweep.step >= 1 ? frontierSweep.step.toFixed(0) : frontierSweep.step.toFixed(2)}).
        Constraints (gaps/floors) are shown as feasible (green) vs infeasible (gray). If points are sparse, widen the scenario ranges or relax guardrails.
        <InfoTip id="frontier.overlay" ariaLabel="About frontier feasibility overlay" />
        {riskNote ? (
          <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
            {riskNote}
          </span>
        ) : null}
      </div>
      <Suspense
        fallback={<div className="text-xs text-gray-500 p-2">Loading frontier...</div>}
      >
        <ErrorBoundary title="Profit Frontier chart failed">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Profit frontier</h3>
            <InfoTip
              className="ml-1"
              align="right"
              id="chart.frontier"
              ariaLabel="What does the Profit Frontier chart show?"
            />
          </div>
          <FrontierChartComponent chartId="frontier-main" viewModel={frontierViewModel} />
        </ErrorBoundary>
      </Suspense>
    </Section>
  );
}
