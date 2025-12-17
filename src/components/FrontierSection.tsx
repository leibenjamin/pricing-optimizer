// src/components/FrontierSection.tsx

import type { ComponentType, ReactNode } from "react";
import { Suspense } from "react";
import type { Tier } from "../lib/waterfall";
import type { FrontierViewModel } from "./FrontierChart";
import { Section } from "./Section";
import InfoTip from "./InfoTip";
import ErrorBoundary from "./ErrorBoundary";
import RiskBadge from "./RiskBadge";

type FrontierSectionProps = {
  frontierViewModel: FrontierViewModel;
  frontierSummary: {
    headline: string;
    bullets?: string[];
    feasibility: { feasibleCount: number; infeasibleCount: number };
  } | null;
  riskNote?: string | null;
  frontierTier: Tier;
  setFrontierTier: (tier: Tier) => void;
  frontierCompareMode: "none" | "optimized" | "charm";
  setFrontierCompareMode: (v: "none" | "optimized" | "charm") => void;
  hasOptimizedComparison: boolean;
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
  frontierCompareMode,
  setFrontierCompareMode,
  hasOptimizedComparison,
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
        className="px-3 py-1.5 text-[11px] leading-snug rounded border border-dashed border-slate-300 bg-slate-50/70 text-slate-700"
      >
        <div className="font-semibold text-slate-800 text-[11px]">How to read</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Sweep one tier (x) while holding the other tiers fixed; the curve is projected profit (y).</li>
          <li>Hover the curve to see the segment mix; vertical markers and dots show Baseline / Current / Optimized (hover dots for labels).</li>
          <li>Green vs gray dots show where gaps/margin floors pass or fail under the current basis.</li>
          <li>Flat peak = robust; sharp peak = sensitive to small price mistakes.</li>
          <li>
            If Optimized looks "off the curve", it's because the other tiers differ; use Compare -&gt; Optimized ladder
            slice.
          </li>
        </ul>
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
          Compare
          <select
            className="border rounded px-2 h-7 bg-white"
            value={frontierCompareMode}
            onChange={(e) => setFrontierCompareMode(e.target.value as "none" | "optimized" | "charm")}
          >
            <option value="none">None</option>
            <option value="optimized" disabled={!hasOptimizedComparison}>
              Optimized ladder slice
            </option>
            <option value="charm">Charm endings (.99)</option>
          </select>
        </label>
        <div className="text-[11px] text-slate-600">
          {frontierCompareMode === "optimized"
            ? "Dashed line holds other tiers at the optimizer ladder."
            : frontierCompareMode === "charm"
            ? "Dashed line compares with vs without .99 endings."
            : "No comparison line."}
        </div>
      </div>

      {frontierSummary && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-800">
          <div className="font-semibold">{frontierSummary.headline}</div>
          {frontierSummary.bullets?.length ? (
            <ul className="mt-1 list-disc ml-4 space-y-0.5 text-[11px] text-slate-700">
              {frontierSummary.bullets.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-1 text-[11px] text-slate-600">
            Feasible points: {frontierSummary.feasibility.feasibleCount.toLocaleString()}{" "}
            {frontierSummary.feasibility.infeasibleCount
              ? `(infeasible flagged: ${frontierSummary.feasibility.infeasibleCount.toLocaleString()})`
              : ""}
          </div>
        </div>
      )}
      <div className="text-[11px] text-slate-600">
        Basis: {usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}; sweep {frontierTier} from ${frontierSweep.min.toFixed(2)} to ${frontierSweep.max.toFixed(2)} (step {frontierSweep.step >= 1 ? frontierSweep.step.toFixed(0) : frontierSweep.step.toFixed(2)}). <InfoTip id="frontier.basis" ariaLabel="About frontier basis" />
        Constraints (gaps/floors) are shown as feasible (green) vs infeasible (gray). If points are sparse, widen the scenario ranges or relax guardrails.
        <InfoTip id="frontier.overlay" ariaLabel="About frontier feasibility overlay" />
        <RiskBadge note={riskNote} className="ml-2" infoId="risk.badge" />
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
