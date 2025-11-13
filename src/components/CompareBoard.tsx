// src/components/CompareBoard.tsx
import React, { forwardRef, useImperativeHandle } from "react";
import type { Prices, Features, Segment } from "../lib/segments";
import type { Leakages } from "../lib/waterfall";
import { useStickyState } from "../lib/useStickyState";
import { makeSnapshot, snapshotsToCSV, type Snapshot } from "../lib/snapshots";
import { downloadBlob } from "../lib/download";
import MiniLine from "./MiniLine";
import HeatmapMini from "./HeatmapMini";

export type CompareBoardHandle = {
  exportCSV: () => void;
  clearAll: () => void;
};

export default forwardRef(function CompareBoard(
  props: {
    prices: Prices;
    costs: Prices;
    feats: Features;
    segments: Segment[];
    refPrices?: Prices;
    leak: Leakages;
    N: number;
    usePocketProfit?: boolean;
    usePocketMargins?: boolean;
    onSetPrices: (p: Prices) => void;
  },
  ref: React.Ref<CompareBoardHandle>
) {
  const {
    prices, costs, feats, segments, refPrices, leak, N,
    usePocketProfit = false, usePocketMargins = false,
    onSetPrices,
  } = props;

  const [snaps, setSnaps] = useStickyState<Snapshot[]>("cmp.snaps", []);

  function addSnapshot() {
    const s = makeSnapshot({
      prices, costs, feats, segments, refPrices, N, leak,
      usePocketProfit, usePocketMargins
    });
    setSnaps(prev => [s, ...prev].slice(0, 24)); // cap to 24
  }

  function deleteSnapshot(id: string) {
    setSnaps(prev => prev.filter(x => x.id !== id));
  }

  function exportCSV() {
    const text = snapshotsToCSV(snaps);
    downloadBlob(text, "snapshots.csv", "text/csv;charset=utf-8");
  }

  function clearAll() {
    setSnaps([]);
  }

  useImperativeHandle(ref, () => ({
    exportCSV,
    clearAll,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
          onClick={addSnapshot}
          title="Save current ladder & KPIs as a card"
        >
          Save snapshot
        </button>
        <button
          className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={exportCSV}
          disabled={snaps.length === 0}
          title="Download all snapshot rows as CSV"
        >
          Export CSV
        </button>
        <button
          className="px-3 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={clearAll}
          disabled={snaps.length === 0}
          title="Remove all snapshots"
        >
          Clear
        </button>
        <div className="text-[11px] text-gray-500 ml-2">
          {snaps.length} saved
        </div>
      </div>

      {snaps.length === 0 ? (
        <div className="text-sm text-gray-600">
          No snapshots yet. Click <b>Save snapshot</b> after adjusting prices to compare variants here.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {snaps.map(s => (
            <article key={s.id} className="border rounded-lg bg-white p-3 shadow-sm print-card print-avoid">
              <header className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">
                  {s.name} <span className="text-xs text-gray-500">{new Date(s.at).toLocaleTimeString()}</span>
                </div>
                <div className="text-[11px] text-gray-500">ID {s.id}</div>
              </header>

              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Prices</div>
                  <div>${s.prices.good} / ${s.prices.better} / ${s.prices.best}</div>
                </div>
                <div>
                  <div className="text-gray-500">Rev / Profit</div>
                  <div>${s.revenue.toLocaleString()} / ${s.profit.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500">ARPU / GM%</div>
                  <div>${s.arpuActive} / {s.grossMarginPct}%</div>
                </div>
              </div>

              {/* tiny visual row */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="border rounded p-2">
                  <div className="text-[11px] text-gray-500 mb-1">Tier mix</div>
                  <HeatmapMini
                    labels={["None","Good","Better","Best"]}
                    values={[s.shares.none, s.shares.good, s.shares.better, s.shares.best]}
                  />
                </div>
                <div className="border rounded p-2">
                  <div className="text-[11px] text-gray-500 mb-1">Segment weights</div>
                  <MiniLine
                    x={s.segShares.map(x => Math.round(x*100)).map((_, i) => i)}
                    y={s.segShares.map(x => Math.round(x*100))}
                    // MiniLine expects x, y
                  />
                </div>
              </div>

              <footer className="mt-3 flex items-center justify-between gap-2">
                <button
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                  onClick={() => onSetPrices(s.prices)}
                  title="Apply these prices to the current ladder"
                >
                  Set current
                </button>
                <button
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                  onClick={() => deleteSnapshot(s.id)}
                >
                  Delete
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
});
