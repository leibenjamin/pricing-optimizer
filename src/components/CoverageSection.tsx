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
    <Section id="kpi-pocket-coverage" title="KPI - Pocket floor coverage" actions={<ActionCluster chart="coverage" id="coverage-heatmap" csv />}>
      <div className="text-[11px] text-slate-600 mb-1">
        Basis: {coverageUsePocket ? "Pocket margins (after leakages)" : "List margins (before leakages)"}.
        <InfoTip id="coverage.basis" ariaLabel="How is coverage basis used?" />
      </div>
      <div className="flex items-center gap-3 text-xs mb-2">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={coverageUsePocket} onChange={(e) => setCoverageUsePocket(e.target.checked)} />
          Use pocket margins for coverage
        </label>
        <span className="text-[11px] text-slate-500">
          Toggle to inspect list vs pocket feasibility; optimizer runs use the pocket toggle above.
        </span>
      </div>
      <div
        data-copy-slot="kpi.pocketCoverage"
        className="rounded border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600 leading-relaxed"
      >
        <div className="font-semibold text-[11px] text-slate-700">How to read pocket floor coverage</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Coverage is the share of Good/Better/Best ladders inside the search grid that clear pocket-margin floors after promo/FX/refund leakages.</li>
          <li>The sensitivity slider bumps every floor up or down (in percentage points) to stress-test how fragile feasibility is before you run the optimizer.</li>
          <li>Apply floors pushes the adjusted floors into the optimizer guardrails so the global search aligns with what you are validating here.</li>
        </ul>
      </div>
      <div className="flex items-center gap-2 text-xs mb-2">
        <span className="text-gray-600">Floor sensitivity:</span>
        <input type="range" min={-10} max={10} value={kpiFloorAdj} onChange={(e) => setKpiFloorAdj(Number(e.target.value))} />
        <span className="w-10 text-right">{kpiFloorAdj} pp</span>
      </div>

      <div className={`rounded border px-4 py-3 inline-flex items-center gap-4 ${tone}`}>
        <div>
          <div className="text-2xl font-semibold leading-tight">{coverageSnapshot.pct1}%</div>
          <div className="text-xs">feasible ladders (pocket floors)</div>
          <div className="text-[11px] text-gray-600 mt-1">
            baseline {coverageSnapshot.pct0}% -&gt; {coverageSnapshot.pct1}% - {coverageSnapshot.delta >= 0 ? `+${coverageSnapshot.delta}pp` : `${coverageSnapshot.delta}pp`} -{" "}
            {coverageSnapshot.tested.toLocaleString()} combos - step ${coverageSnapshot.step}
          </div>
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
          {Math.round(floors1.best * 100)}% ({kpiFloorAdj} pp sensitivity applied).
        </div>
        <div>
          <span className="font-semibold text-gray-800">Grid and gaps:</span> Good -&gt; Better gap {optConstraints.gapGB}, Better -&gt; Best gap {optConstraints.gapBB}; step ${optRanges.step} across{" "}
          {coverageSnapshot.tested.toLocaleString()} ladder combinations.
        </div>
      </div>

      <div className="mt-3">
        <details className="mb-1">
          <summary className="cursor-pointer select-none text-[11px] text-gray-600">How to read this heatmap</summary>
          <div className="text-[11px] text-gray-600 mt-1 space-y-1">
            <div>Best is pinned near the lowest feasible price (about {bestUsed}) so we can see the Good vs Better feasibility wedge.</div>
            <div>Green cells = Good/Better price pairs that clear the pocket floors and respect the required gaps; gray cells fail a gap or a margin floor.</div>
            <div>If the green band collapses as you raise floors, either ease the floors, widen the gap guardrails, or broaden the search ranges before running the optimizer.</div>
          </div>
        </details>
        <HeatmapMini cells={cells} gTicks={gTicks} bTicks={bTicks} chartId="coverage-heatmap" />
      </div>
    </Section>
  );
}
