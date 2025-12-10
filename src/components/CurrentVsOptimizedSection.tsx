import type { Prices } from "../lib/segments";
import type { ScorecardDelta } from "../lib/scorecard";
import { Section } from "./Section";

export type CurrentVsOptimizedVM = {
  basisLabel: string;
  driftNote: string | null;
  deltaLabel: string;
  curPrices: Prices;
  curProfit: number;
  best: Prices;
  bestProfit: number;
  deltaProfit: number;
  revenueDeltaCurrent: number | null;
  activeDeltaCurrent: number | null;
  arpuDeltaCurrent: number | null;
  binds: string[];
  topDriverLine: string | null;
  guardrailFloorLine: string;
  tornadoMetricLabel: string;
  explainDelta: ScorecardDelta | null;
};

type Props = {
  vm: CurrentVsOptimizedVM | null;
  canUndo: boolean;
  canPinBaseline: boolean;
  onApplyOptimized: (best: Prices) => void;
  onUndoApply: () => void;
  onPinBaseline: () => void;
};

export function CurrentVsOptimizedSection({
  vm,
  canUndo,
  canPinBaseline,
  onApplyOptimized,
  onUndoApply,
  onPinBaseline,
}: Props) {
  if (!vm) {
    return (
      <Section id="current-vs-optimized" title="Current vs Optimized">
        <div className="text-xs text-gray-600">Run the optimizer to populate the optimized ladder.</div>
      </Section>
    );
  }

  const {
    curPrices,
    curProfit,
    best,
    bestProfit,
    deltaProfit,
    revenueDeltaCurrent,
    activeDeltaCurrent,
    arpuDeltaCurrent,
    deltaLabel,
    driftNote,
  } = vm;

  return (
    <Section id="current-vs-optimized" title="Current vs Optimized">
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <div className="font-semibold mb-1">Current</div>
            <div>Good: ${curPrices.good}</div>
            <div>Better: ${curPrices.better}</div>
            <div>Best: ${curPrices.best}</div>
            <div className="mt-2 text-xs text-gray-600">Profit: ${Math.round(curProfit).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <div className="font-semibold mb-1">Optimized</div>
            <div>Good: ${best.good}</div>
            <div>Better: ${best.better}</div>
            <div>Best: ${best.best}</div>
            <div className="mt-2 text-xs text-gray-600">Profit: ${Math.round(bestProfit).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 lg:col-span-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-600">Delta</div>
                <div className="text-xl font-bold leading-tight">
                  {deltaProfit >= 0 ? "+" : "-"}${Math.abs(Math.round(deltaProfit)).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-600">{deltaLabel}</div>
              </div>
              <div className="text-right text-[11px] text-slate-600">
                <div>Revenue {revenueDeltaCurrent != null ? `${revenueDeltaCurrent >= 0 ? "+" : "-"}$${Math.abs(revenueDeltaCurrent).toLocaleString()}` : "n/a"}</div>
                <div>Active {activeDeltaCurrent != null ? `${activeDeltaCurrent >= 0 ? "+" : "-"}${Math.abs(activeDeltaCurrent)}` : "n/a"}</div>
                <div>ARPU {arpuDeltaCurrent != null ? `${arpuDeltaCurrent >= 0 ? "+" : "-"}$${Math.abs(arpuDeltaCurrent).toFixed(2)}` : "n/a"}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button className="w-full border rounded px-3 py-2 text-sm font-semibold bg-white hover:bg-gray-50" onClick={() => onApplyOptimized(best)}>
                Apply optimized ladder
              </button>
              <button
                className="w-full text-sm border rounded px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50"
                disabled={!canUndo}
                onClick={onUndoApply}
              >
                Undo apply ladder
              </button>
              {canPinBaseline ? (
                <button className="w-full text-xs border rounded px-3 py-2 bg-white hover:bg-gray-50" onClick={onPinBaseline}>
                  Pin this as baseline
                </button>
              ) : null}
            </div>
            {driftNote ? <div className="text-[11px] text-slate-600 leading-snug">{driftNote}</div> : null}
          </div>
        </div>
      </div>
    </Section>
  );
}
