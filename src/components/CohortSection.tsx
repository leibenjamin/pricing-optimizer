import type { Dispatch, ReactNode, SetStateAction } from "react";
import InfoTip from "./InfoTip";
import { Section } from "./Section";
import MiniLine from "./MiniLine";
import type { CohortScenarioVM, CohortSummaryCard } from "../lib/viewModels";
import RiskBadge from "./RiskBadge";

type CohortSectionProps = {
  retentionPct: number;
  setRetentionPct: Dispatch<SetStateAction<number>>;
  retentionMonths: number;
  setRetentionMonths: Dispatch<SetStateAction<number>>;
  showAdvanced: boolean;
  setShowAdvanced: Dispatch<SetStateAction<boolean>>;
  cohortSummaryCards: CohortSummaryCard[];
  cohortScenarios: CohortScenarioVM[];
  actions?: ReactNode;
  riskNote?: string | null;
};

export function CohortSection({
  retentionPct,
  setRetentionPct,
  retentionMonths,
  setRetentionMonths,
  showAdvanced,
  setShowAdvanced,
  cohortSummaryCards,
  cohortScenarios,
  actions,
  riskNote,
}: CohortSectionProps) {
  return (
    <Section id="cohort-rehearsal" title="Cohort rehearsal" actions={actions}>
      <div
        data-copy-slot="chart.cohort"
        className="text-sm text-slate-700 leading-snug"
      >
        Cohort rehearsal simulates pocket margin on a shrinking cohort. Overlay Baseline/Current/Optimized to see whether lift holds past month 1; adjust retention/horizon to stress churn vs contribution.
        <RiskBadge note={riskNote} className="ml-2" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <label className="font-medium">Monthly retention</label>
          <InfoTip id="cohort.retention" ariaLabel="What does monthly retention do?" />
          <input
            type="range"
            min={70}
            max={99.9}
            step={0.1}
            value={retentionPct}
            onChange={(e) => setRetentionPct(Number(e.target.value))}
          />
          <input
            type="number"
            step={0.1}
            min={70}
            max={99.9}
            value={retentionPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              setRetentionPct(Math.min(99.9, Math.max(70, v)));
            }}
            className="w-16 h-7 border rounded px-2"
          />
          <span>%</span>
          <span className="text-gray-500 ml-2">
            (churn ~ {(100 - retentionPct).toFixed(1)}%/mo)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="underline text-slate-600"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
          {showAdvanced && (
            <label className="flex items-center gap-2">
              Horizon
              <select
                className="border rounded px-2 h-8 bg-white"
                value={retentionMonths}
                onChange={(e) => setRetentionMonths(Math.min(24, Math.max(6, Number(e.target.value))))}
              >
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={18}>18 months</option>
                <option value={24}>24 months</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {cohortSummaryCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {cohortSummaryCards.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm shadow-sm"
            >
              <div className="text-[11px] uppercase text-slate-600">{c.label}</div>
              <div className="text-lg font-semibold text-slate-900">
                ${Math.round(c.total).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-600">
                Month {retentionMonths}: ${Math.round(c.monthEnd).toLocaleString()}
              </div>
              {c.deltaTotal !== null && (
                <div
                  className={`text-[11px] font-medium ${
                    (c.deltaTotal ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {(c.deltaTotal ?? 0) >= 0 ? "+" : "-"}$
                  {Math.abs(Math.round(c.deltaTotal ?? 0)).toLocaleString()} vs baseline
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-sm text-slate-600">
          Pin a baseline or run the optimizer to compare cohort decay.
        </div>
      )}

      {cohortScenarios.length > 0 && (
        <div className="mt-2">
          <MiniLine
            title={`Pocket margin by cohort month (retention ${retentionPct.toFixed(1)}%, horizon ${retentionMonths}m)`}
            series={cohortScenarios.map((c) => ({
              label: c.label,
              x: c.points.map((p) => p.month),
              y: c.points.map((p) => p.margin),
            }))}
            chartId="cohort-curve"
            exportKind="cohort"
          />
        </div>
      )}
    </Section>
  );
}
