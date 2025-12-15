// src/components/ResultsOverviewSection.tsx

import type { ScorecardBand, ScorecardDelta } from "../lib/scorecard";
import type { ScorecardGuardrails, ScorecardViewModel } from "../lib/viewModels";
import { useState } from "react";
import { Section } from "./Section";
import Scorecard from "./Scorecard";
import InsightsPanel from "./InsightsPanel";

type ResultsOverviewSectionProps = {
  scorecardView: "current" | "optimized";
  hasOptimized: boolean;
  onChangeView: (view: "current" | "optimized") => void;
  onPinBaseline: () => void;
  scorecardVM: ScorecardViewModel;
  scorecardBand: ScorecardBand | null;
  priceDeltas?: Array<{ tier: "good" | "better" | "best"; base: number; current: number; delta: number | null }>;
  insights: {
    hasResult: boolean;
    basisLabel: string;
    ladderLabel: string;
    delta: ScorecardDelta | null;
    fallbackNarrative: ScorecardDelta | null;
    guardrails: ScorecardGuardrails;
    optimizerWhyLines: string[];
    binds?: string[];
    topDriverLine?: string | null;
    guardrailFloorLine?: string | null;
    validationNotes?: string[];
    riskNote?: string | null;
  };
};

export function ResultsOverviewSection({
  scorecardView,
  hasOptimized,
  onChangeView,
  onPinBaseline,
  scorecardVM,
  scorecardBand,
  priceDeltas,
  insights,
}: ResultsOverviewSectionProps) {
  const [tab, setTab] = useState<"summary" | "insights">("summary");
  const tabButton = (id: "summary" | "insights", label: string) => {
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        className={`px-3 py-1.5 text-xs font-semibold ${
          active ? "bg-gray-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
        }`}
        aria-pressed={active}
        onClick={() => setTab(id)}
      >
        {label}
      </button>
    );
  };
  return (
    <Section id="results-overview" title="Results Overview">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <div className="inline-flex overflow-hidden rounded border border-slate-200 bg-white shadow-sm print:hidden">
          {tabButton("summary", "Summary")}
          {tabButton("insights", "Insights")}
        </div>
        <span className="text-slate-600">
          Summary = results at a glance. Insights = why it moved + what to do next.
        </span>
      </div>

      <div className={`${tab === "summary" ? "block" : "hidden"} print:block`}>
        <Scorecard
          view={scorecardView}
          hasOptimized={hasOptimized}
          onChangeView={onChangeView}
          onPinBaseline={onPinBaseline}
          basis={scorecardVM.basis}
          kpis={scorecardVM.kpis}
          run={scorecardVM.run}
          baselineRun={scorecardVM.baselineRun}
          activeCustomers={scorecardVM.activeCustomers}
          baselineActiveCustomers={scorecardVM.baselineActiveCustomers}
          marginDeltaPP={scorecardVM.marginDeltaPP}
          guardrails={scorecardVM.guardrails}
          explain={scorecardVM.explain}
          band={scorecardBand}
          riskNote={insights.riskNote}
          priceDeltas={priceDeltas}
          onViewInsights={() => setTab("insights")}
        />
      </div>

      <div className={`${tab === "insights" ? "block" : "hidden"} print:block`}>
        <InsightsPanel
          hasResult={insights.hasResult}
          basisLabel={insights.basisLabel}
          ladderLabel={insights.ladderLabel}
          delta={insights.delta}
          fallbackNarrative={insights.fallbackNarrative}
          guardrails={insights.guardrails}
          optimizerWhyLines={insights.optimizerWhyLines}
          binds={insights.binds}
          topDriverLine={insights.topDriverLine}
          guardrailFloorLine={insights.guardrailFloorLine}
          validationNotes={insights.validationNotes}
          riskNote={insights.riskNote}
        />
      </div>
    </Section>
  );
}
