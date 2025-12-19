// src/components/CohortSection.tsx

import type { Dispatch, ReactNode, SetStateAction } from "react";
import InfoTip from "./InfoTip";
import NumberInput from "./NumberInput";
import { Section } from "./Section";
import MiniLine from "./MiniLine";
import type { CohortScenarioVM, CohortSummaryCard } from "../lib/viewModels";
import RiskBadge from "./RiskBadge";

type CohortSectionProps = {
  retentionPct: number;
  setRetentionPct: Dispatch<SetStateAction<number>>;
  retentionMonths: number;
  setRetentionMonths: Dispatch<SetStateAction<number>>;
  priceChurnEnabled: boolean;
  setPriceChurnEnabled: Dispatch<SetStateAction<boolean>>;
  priceChurnPer10: number;
  setPriceChurnPer10: Dispatch<SetStateAction<number>>;
  cohortView: "monthly" | "cumulative";
  setCohortView: Dispatch<SetStateAction<"monthly" | "cumulative">>;
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
  priceChurnEnabled,
  setPriceChurnEnabled,
  priceChurnPer10,
  setPriceChurnPer10,
  cohortView,
  setCohortView,
  showAdvanced,
  setShowAdvanced,
  cohortSummaryCards,
  cohortScenarios,
  actions,
  riskNote,
}: CohortSectionProps) {
  const baseScenario =
    cohortScenarios.find((c) => c.key === "baseline") ?? cohortScenarios[0];
  const optimizedScenario = cohortScenarios.find((c) => c.key === "optimized");

  const crossoverMonth =
    baseScenario && optimizedScenario
      ? optimizedScenario.points.find((p, idx) => p.margin <= (baseScenario.points[idx]?.margin ?? 0))?.month ?? null
      : null;
  const month1Delta =
    baseScenario && optimizedScenario ? optimizedScenario.month1 - baseScenario.month1 : null;
  const totalDelta =
    baseScenario && optimizedScenario ? optimizedScenario.total - baseScenario.total : null;

  const formatPct = (v: number) => `${v.toFixed(1)}%`;
  const formatDeltaPct = (v: number) =>
    `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  const seriesView = cohortView === "cumulative" ? "Cumulative margin" : "Monthly margin";

  const buildSeries = (points: Array<{ month: number; margin: number }>) => {
    if (cohortView === "monthly") return points.map((p) => p.margin);
    let acc = 0;
    return points.map((p) => {
      acc += p.margin;
      return acc;
    });
  };

  return (
    <Section id="cohort-rehearsal" title="Cohort rehearsal" actions={actions}>
      <div
        data-copy-slot="chart.cohort"
        className="text-sm text-slate-700 leading-snug"
      >
        Cohort rehearsal simulates pocket margin on a shrinking cohort. Overlay Baseline/Current/Optimized to see whether lift holds past month 1; adjust retention/horizon to stress churn vs contribution (advanced: price-driven churn). <InfoTip id="cohort.basis" ariaLabel="About cohort basis" />
        <div className="inline-flex items-center gap-2 ml-2">
          <RiskBadge note={riskNote} className="ml-0" infoId="risk.badge" />
          <span className="text-[11px] text-amber-700">Wide bands? Treat cohort lift as a hypothesis; test before rollout.</span>
        </div>
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
          <NumberInput
            step={0.1}
            min={70}
            max={99.9}
            value={retentionPct}
            onValueChange={(v) => setRetentionPct(Math.min(99.9, Math.max(70, v)))}
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
            <div className="flex items-center gap-3">
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
              <label className="flex items-center gap-2">
                View
                <select
                  className="border rounded px-2 h-8 bg-white"
                  value={cohortView}
                  onChange={(e) => setCohortView(e.target.value === "cumulative" ? "cumulative" : "monthly")}
                >
                  <option value="monthly">Monthly margin</option>
                  <option value="cumulative">Cumulative margin</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={priceChurnEnabled}
              onChange={(e) => setPriceChurnEnabled(e.target.checked)}
            />
            Price-driven churn
          </label>
          <InfoTip id="cohort.priceChurn" ariaLabel="How price-driven churn works" />
          <input
            type="range"
            min={0}
            max={10}
            step={0.25}
            value={priceChurnPer10}
            onChange={(e) => setPriceChurnPer10(Number(e.target.value))}
            disabled={!priceChurnEnabled}
          />
          <NumberInput
            step={0.25}
            min={0}
            max={10}
            value={priceChurnPer10}
            onValueChange={(v) => setPriceChurnPer10(Math.min(10, Math.max(0, v)))}
            disabled={!priceChurnEnabled}
            className="w-16 h-7 border rounded px-2"
          />
          <span>% churn per +10% price</span>
        </div>
      )}

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

      {cohortScenarios.length > 1 && baseScenario && optimizedScenario && (
        <div className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
          <div className="font-semibold text-[11px] text-slate-700">Cohort story</div>
          <div>
            Month 1 uplift: {month1Delta === null ? "n/a" : `${month1Delta >= 0 ? "+" : "-"}$${Math.abs(Math.round(month1Delta)).toLocaleString()}`} | Cumulative lift: {totalDelta === null ? "n/a" : `${totalDelta >= 0 ? "+" : "-"}$${Math.abs(Math.round(totalDelta)).toLocaleString()}`}
          </div>
          <div>
            {priceChurnEnabled ? (
              <>
                Retention used: Baseline {formatPct(baseScenario.retentionPct)} | Optimized {formatPct(optimizedScenario.retentionPct)} ({formatDeltaPct(optimizedScenario.priceDeltaPct)} list price vs baseline)
              </>
            ) : (
              <>Retention used: {formatPct(baseScenario.retentionPct)} (flat across scenarios)</>
            )}
          </div>
          <div>
            {crossoverMonth ? `Crossover: month ${crossoverMonth} (optimized falls below baseline monthly margin).` : "No crossover within the selected horizon."}
          </div>
        </div>
      )}

      {cohortScenarios.length > 0 && (
        <div className="mt-2">
          <MiniLine
            title={`Pocket margin by cohort month (${seriesView}; horizon ${retentionMonths}m)`}
            series={cohortScenarios.map((c) => ({
              label: c.label,
              x: c.points.map((p) => p.month),
              y: buildSeries(c.points),
            }))}
            chartId="cohort-curve"
            exportKind="cohort"
          />
        </div>
      )}
    </Section>
  );
}
