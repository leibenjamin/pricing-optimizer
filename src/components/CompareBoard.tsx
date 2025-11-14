// src/components/CompareBoard.tsx
import React from "react";
import type { SnapshotKPIs } from "../lib/snapshots";
import SharesMini from "./SharesMini";
import MiniLine from "./MiniLine";

type SlotId = "A" | "B" | "C";

export default function CompareBoard({
  slots,
  current,
  onLoad,
  onClear,
}: {
  slots: Record<SlotId, SnapshotKPIs | null>;
  current: SnapshotKPIs;
  onLoad: (id: SlotId) => void;
  onClear: (id: SlotId) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Current */}
      <SnapshotCard
        title="Current"
        kpi={current}
        actions={null}
      />

      {/* Saved A/B/C */}
      {(["A", "B", "C"] as const).map((id) => {
        const kpi = slots[id];
        return (
          <SnapshotCard
            key={id}
            title={`Saved ${id}`}
            kpi={kpi ?? null}
            actions={
              <div className="flex gap-2">
                <button
                  className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 disabled:opacity-50"
                  disabled={!kpi}
                  onClick={() => onLoad(id)}
                >
                  Set current
                </button>
                <button
                  className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 disabled:opacity-50"
                  disabled={!kpi}
                  onClick={() => onClear(id)}
                >
                  Delete
                </button>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

function SnapshotCard({
  title,
  kpi,
  actions,
}: {
  title: string;
  kpi: SnapshotKPIs | null;
  actions: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        {actions}
      </div>

      {kpi ? (
        <>
          {/* Top numbers */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Kpi label="Revenue" value={`$${fmt(kpi.revenue)}`} />
            <Kpi label="Profit" value={`$${fmt(kpi.profit)}`} />
            <Kpi label="ARPU (active)" value={`$${fmt(kpi.arpuActive)}`} />
            <Kpi label="Gross margin" value={`${kpi.grossMarginPct.toFixed(1)}%`} />
          </div>

          {/* Tiny charts */}
          <div className="mt-3 space-y-2">
            <SharesMini
              title="Tier shares"
              labels={["None", "Good", "Better", "Best"]}
              values={[
                kpi.shares.none,
                kpi.shares.good,
                kpi.shares.better,
                kpi.shares.best,
              ]}
              height={110}
            />
            <MiniLine
              title="Segment mix (weights)"
              x={[1, 2, 3]}
              y={kpi.segShares.map((w) => w * 100)} // MiniLine expects numeric series; we show as 0..100
              height={110}
            />
          </div>

          {/* Prices */}
          <div className="mt-3 text-[11px] text-gray-600">
            Prices: ${kpi.prices.good.toFixed(2)} / ${kpi.prices.better.toFixed(2)} / ${kpi.prices.best.toFixed(2)}
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-500 italic">Empty. Save the current ladder to this slot.</div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-2 bg-gray-50">
      <div className="text-[11px] text-gray-600">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function fmt(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
