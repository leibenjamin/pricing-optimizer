import type { Dispatch, SetStateAction } from "react";
import InfoTip from "./InfoTip";
import { Section } from "./Section";
import ActionCluster from "./ActionCluster";
import { TakeRateDeltaTable } from "./TakeRateDeltaTable";
import TakeRateChart, { type TakeRateScenario } from "./TakeRateChart";
import RiskBadge from "./RiskBadge";

type TakeRateSummary = {
  headline: string;
  detail: string;
  baselineLabel: string | null;
  targetLabel: string;
  customerImpact?: string | null;
};

type TakeRateSectionProps = {
  scenarios: TakeRateScenario[];
  summary: TakeRateSummary | null;
  segmentOptions: Array<{ key: string; label: string; nameLower: string }>;
  takeRateMode: "mix" | "delta";
  setTakeRateMode: Dispatch<SetStateAction<"mix" | "delta">>;
  takeRateBaselineKey: string | undefined;
  takeRateSegmentKey: string;
  setTakeRateSegmentKey: Dispatch<SetStateAction<string>>;
  segmentBreakdownEnabled: boolean;
  setSegmentBreakdownEnabled: Dispatch<SetStateAction<boolean>>;
  segmentBreakdownScenarioKey: string | undefined;
  setSegmentBreakdownScenarioKey: Dispatch<SetStateAction<string | undefined>>;
  segmentBreakdownScenarios: TakeRateScenario[];
  segmentScenarioOptions: Array<{ key: string; label: string }>;
  selectedSegmentLabel: string | null;
  riskNote?: string | null;
};

export function TakeRateSection({
  scenarios,
  summary,
  segmentOptions,
  takeRateMode,
  setTakeRateMode,
  takeRateBaselineKey,
  takeRateSegmentKey,
  setTakeRateSegmentKey,
  segmentBreakdownEnabled,
  setSegmentBreakdownEnabled,
  segmentBreakdownScenarioKey,
  setSegmentBreakdownScenarioKey,
  segmentBreakdownScenarios,
  segmentScenarioOptions,
  selectedSegmentLabel,
  riskNote,
}: TakeRateSectionProps) {
  return (
    <Section
      id="take-rate"
      title="Take-Rate Bars"
      className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
      actions={<ActionCluster chart="takerate" id="takerate-main" csv />}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span>
          Demand-only view: leakages and optimizer guardrails do not apply here. Use delta view or the table for small differences; use Scorecard for pocket/list KPI impact.
        </span>
        <InfoTip id="takerate.scope" ariaLabel="About take-rate scope" />
        {summary?.baselineLabel && (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            Baseline: {summary.baselineLabel}
          </span>
        )}
        <div className="flex items-center gap-2">
          <RiskBadge note={riskNote} infoId="risk.badge" />
          <span className="text-[10px] text-amber-700">
            Wide bands? Treat mix deltas as exploratory—validate with customers.
          </span>
        </div>
        {summary?.customerImpact ? (
          <span className="text-[11px] text-slate-700 font-medium">
            Customer impact: {summary.customerImpact}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 items-center text-[11px] text-slate-700">
        <div className="inline-flex overflow-hidden rounded border">
          <button
            type="button"
            className={`px-3 h-8 ${takeRateMode === "mix" ? "bg-slate-900 text-white" : "bg-white"}`}
            onClick={() => setTakeRateMode("mix")}
          >
            Mix
          </button>
          <button
            type="button"
            className={`px-3 h-8 ${takeRateMode === "delta" ? "bg-slate-900 text-white" : "bg-white"}`}
            onClick={() => setTakeRateMode("delta")}
            disabled={!takeRateBaselineKey}
          >
            Delta vs baseline
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-600">Segment scope</label>
          <select
            className="border rounded px-2 py-1 bg-white text-sm"
            value={takeRateSegmentKey}
            onChange={(e) => setTakeRateSegmentKey(e.target.value)}
          >
            {segmentOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-600">Baseline</label>
          <span className="text-sm text-slate-800">
            {takeRateBaselineKey
              ? scenarios.find((s) => s.key === takeRateBaselineKey)?.label ?? "Baseline"
              : "None"}
          </span>
        </div>

        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={segmentBreakdownEnabled}
            onChange={(e) => setSegmentBreakdownEnabled(e.target.checked)}
          />
          Show segment breakdown
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">Take-rate mix</div>
            <InfoTip className="ml-1" align="right" id="chart.takeRate" ariaLabel="How should I read take-rate bars?" />
          </div>
          <TakeRateChart chartId="takerate-main" scenarios={scenarios} mode={takeRateMode} />
        </div>
        <div className="text-xs text-slate-700 space-y-2">
          <div className="text-sm font-semibold text-slate-700">Quick read</div>
          <div className="text-slate-600">
            {summary
              ? summary.headline
              : "Pick baseline/current/optimized to see the summary and deltas. Delta view requires a baseline selection."}
          </div>
          {summary?.detail && <div className="text-slate-600">{summary.detail}</div>}
          {selectedSegmentLabel && (
            <div className="text-[11px] text-slate-500">
              Filtering mix for {selectedSegmentLabel}; active counts scale by that segment&apos;s weight.
            </div>
          )}
        </div>
      </div>

      {segmentBreakdownEnabled && (
        <div className="rounded border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-700">
              Segment mix by tier (
              {segmentBreakdownScenarioKey
                ? segmentScenarioOptions.find((o) => o.key === segmentBreakdownScenarioKey)?.label ?? "Scenario"
                : "Scenario"}
              )
            </div>
            <InfoTip
              id="takeRate.segmentBreakdown"
              ariaLabel="Segment-level take-rate mix for the selected scenario"
              align="right"
            />
          </div>
          <div className="flex items-center gap-2 text-xs mb-2">
            <label className="flex items-center gap-2">
              Scenario
              <select
                className="h-8 rounded border px-2 bg-white"
                value={segmentBreakdownScenarioKey ?? ""}
                onChange={(e) => setSegmentBreakdownScenarioKey(e.target.value || undefined)}
              >
                {segmentScenarioOptions.map((ctx) => (
                  <option key={ctx.key} value={ctx.key}>
                    {ctx.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {segmentBreakdownScenarios.length > 0 ? (
            <TakeRateChart chartId="takerate-segment-breakdown" scenarios={segmentBreakdownScenarios} mode="mix" />
          ) : (
            <div className="text-xs text-slate-500">No segment breakdown available.</div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-700">
        <TakeRateDeltaTable scenarios={scenarios} baselineKey={takeRateBaselineKey} />
      </div>
    </Section>
  );
}
