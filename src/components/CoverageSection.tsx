// src/components/CoverageSection.tsx

import type { Dispatch, SetStateAction } from "react";
import { feasibilitySliceGB } from "../lib/coverage";
import type { Constraints, SearchRanges } from "../lib/optimize";
import type { Leakages } from "../lib/waterfall";
import type { Prices } from "../lib/segments";
import ActionCluster from "./ActionCluster";
import InfoTip from "./InfoTip";
import HeatmapMini from "./HeatmapMini";
import { Section } from "./Section";

type CoverageSnapshot = {
  pct0: number;
  pct1: number;
  delta: number;
  demandPct?: number;
  tested: number;
  step: number;
  floors: { good: number; better: number; best: number };
};

type Props = {
  coverageUsePocket: boolean;
  setCoverageUsePocket: Dispatch<SetStateAction<boolean>>;
  kpiFloorAdj: number;
  setKpiFloorAdj: Dispatch<SetStateAction<number>>;
  coverageSnapshot: CoverageSnapshot;
  optConstraints: Constraints;
  optRanges: SearchRanges;
  costs: Prices;
  leak: Leakages;
  setOptConstraints: Dispatch<SetStateAction<Constraints>>;
  toast: (kind: "success" | "error" | "info" | "warning", msg: string) => void;
};

export function CoverageSection({
  coverageUsePocket,
  setCoverageUsePocket,
  kpiFloorAdj,
  setKpiFloorAdj,
  coverageSnapshot,
  optConstraints,
  optRanges,
  costs,
  leak,
  setOptConstraints,
  toast,
}: Props) {
  const floors1 = coverageSnapshot.floors;
  const basisLabel = coverageUsePocket ? "Pocket margins (after leakages)" : "List margins (before leakages)";
  const basisShort = coverageUsePocket ? "pocket" : "list";
  const stepLabel =
    coverageSnapshot.step >= 1
      ? coverageSnapshot.step.toFixed(0)
      : coverageSnapshot.step.toFixed(2);
  const tone =
    coverageSnapshot.pct1 >= 70
      ? "text-green-700 bg-green-50 border-green-200"
      : coverageSnapshot.pct1 >= 40
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";

  const { cells, gTicks, bTicks, bestUsed } = feasibilitySliceGB(
    optRanges,
    costs,
    floors1,
    { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
    leak,
    coverageUsePocket
  );

  return (
    <Section id="kpi-pocket-coverage" title="Guardrail feasibility" actions={<ActionCluster chart="coverage" id="coverage-heatmap" csv />}>
      <div className="text-[11px] text-slate-600 mb-1">
        Basis: {basisLabel}.
        <InfoTip id="coverage.basis" ariaLabel="How is coverage basis used?" />
      </div>
      <div className="flex items-center gap-3 text-xs mb-2">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={coverageUsePocket} onChange={(e) => setCoverageUsePocket(e.target.checked)} />
          Compare list vs pocket feasibility
        </label>
        <span className="text-[11px] text-slate-500">
          Use this as a sanity check; optimizer floors follow the pocket toggle above.
        </span>
      </div>
      <div
        data-copy-slot="kpi.pocketCoverage"
        className="rounded border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600 leading-relaxed"
      >
        <div className="font-semibold text-[11px] text-slate-700">What this checks</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Readiness checks margin floors + gap floors on the selected basis (sensitivity nudges floors).</li>
          <li>Full guardrails add demand checks (none-share/take-rate) shown below.</li>
          <li>Apply floors pushes the adjusted floors into optimizer guardrails.</li>
        </ul>
      </div>
      <div className="flex items-center gap-2 text-xs mb-2">
        <span className="text-gray-600">Floor sensitivity:</span>
        <input type="range" min={-10} max={10} value={kpiFloorAdj} onChange={(e) => setKpiFloorAdj(Number(e.target.value))} />
        <span className="w-10 text-right">{kpiFloorAdj} %pt.</span>
      </div>

      <div className={`rounded border px-4 py-3 ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Guardrail readiness</div>
            <div className="text-2xl font-semibold leading-tight">{coverageSnapshot.pct1}%</div>
            <div className="text-xs">feasible ladders ({basisShort} floors)</div>
            <div className="text-[11px] text-gray-600 mt-1">
              baseline {coverageSnapshot.pct0}% -&gt; {coverageSnapshot.pct1}% - {coverageSnapshot.delta >= 0 ? `+${coverageSnapshot.delta}%pt.` : `${coverageSnapshot.delta}%pt.`} -{" "}
              {coverageSnapshot.tested.toLocaleString()} combos - step ${stepLabel}
            </div>
            {coverageSnapshot.demandPct !== undefined && (
              <div className="text-[11px] text-gray-600">
                Full guardrails: {coverageSnapshot.demandPct}% of ladders (adds none-share/take-rate).
              </div>
            )}
          </div>
          <button
            className="text-xs border rounded px-3 py-1 bg-white hover:bg-gray-50"
            onClick={() => {
              setOptConstraints((c) => ({
                ...c,
                marginFloor: { ...floors1 },
              }));
              toast(
                "success",
                `Applied floors: Good ${Math.round(floors1.good * 100)}%, Better ${Math.round(floors1.better * 100)}%, Best ${Math.round(floors1.best * 100)}%`
              );
            }}
          >
            Apply floors
          </button>
        </div>
        <div className="text-[11px] text-gray-700 mt-2 space-y-1">
          <div>
            <span className="font-semibold text-gray-800">Floors tested:</span> Good {Math.round(floors1.good * 100)}% | Better {Math.round(floors1.better * 100)}% | Best{" "}
            {Math.round(floors1.best * 100)}% ({kpiFloorAdj} %pt. sensitivity applied).
          </div>
          <div>
            <span className="font-semibold text-gray-800">Gaps and grid:</span> G-&gt;B gap {optConstraints.gapGB}, B-&gt;Best gap {optConstraints.gapBB}; step ${stepLabel} across{" "}
            {coverageSnapshot.tested.toLocaleString()} ladder combinations.
          </div>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-700">Advanced: feasibility heatmap</summary>
        <div className="text-[11px] text-slate-600 mt-2 space-y-1">
          <div>Heatmap is a Good vs Better slice; Best is pinned near the lowest feasible price (about {bestUsed}).</div>
          <div>Green cells clear floors and gaps under the selected basis; gray cells fail a gap or a margin floor.</div>
          <div>Demand guardrails are not shown here; use the readiness card for full guardrails.</div>
          <div>If the green band collapses, ease floors, widen gaps, or broaden ranges before running.</div>
        </div>
        <div className="mt-2">
          <HeatmapMini cells={cells} gTicks={gTicks} bTicks={bTicks} chartId="coverage-heatmap" />
        </div>
      </details>
    </Section>
  );
}
