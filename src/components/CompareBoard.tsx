// src/components/CompareBoard.tsx

import type { SnapshotKPIs } from "../lib/snapshots";
import SharesMini from "./SharesMini";

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
  const order: Array<{ key: "current" | SlotId; label: string }> = [
    { key: "current", label: "Current" },
    { key: "A", label: "Saved A" },
    { key: "B", label: "Saved B" },
    { key: "C", label: "Saved C" },
  ];

  // Horizontal scroll container on small viewports; cards won't get squished.
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 md:grid md:grid-cols-[repeat(4,minmax(280px,1fr))]">
        {order.map((col) => {
          const data =
            col.key === "current" ? current : (slots[col.key as SlotId] ?? null);
          const isEmpty = !data;

          return (
            <div
              key={col.key}
              className={[
                "shrink-0", // don't let flex squeeze below min width
                "min-w-[280px] max-w-[360px] md:max-w-none", // sane card width
                "w-[300px] md:w-auto", // pleasant default width in scroll view
                "rounded-xl border bg-white shadow-sm",
                "p-3 flex flex-col gap-2",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{col.label}</div>
                {col.key !== "current" && (
                  <div className="flex gap-2">
                    <button
                      className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
                      onClick={() => onLoad(col.key as SlotId)}
                    >
                      Set current
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
                      onClick={() => onClear(col.key as SlotId)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {isEmpty ? (
                <p className="text-xs text-gray-500 italic">
                  Empty. Save the current ladder to this slot.
                </p>
              ) : (
                <SnapshotCard kpis={data!} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function money(n: number) {
  return Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "-";
}
function pct(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(n % 1 ? 1 : 0)}%`;
}

function SnapshotCard({ kpis }: { kpis: SnapshotKPIs }) {
  const gm = Number.isFinite(kpis.grossMarginPct)
    ? (kpis.grossMarginPct as number)
    : kpis.revenue > 0
    ? (kpis.profit / kpis.revenue) * 100
    : NaN;
  const segs = kpis.segShares ?? [];
  const prices = kpis.prices;
  return (
    <>
      {kpis.title && (
        <div className="text-[11px] text-gray-500 mb-1">
          {kpis.title}
        </div>
      )}
      {kpis.subtitle && (
        <div className="text-[11px] text-gray-500 mb-1">
          {kpis.subtitle}
        </div>
      )}
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Revenue" value={money(kpis.revenue)} />
        <Kpi label="Profit" value={money(kpis.profit)} />
        <Kpi label="ARPU (active)" value={money(kpis.arpuActive)} />
        <Kpi label="Gross margin" value={pct(gm)} />
      </div>

      {/* Tier shares mini bars */}
      <div className="pt-1">
        <SharesMini
          title="Tier shares"
          labels={["None", "Good", "Better", "Best"]}
          values={[kpis.shares.none, kpis.shares.good, kpis.shares.better, kpis.shares.best]}
          height={140}
        />
      </div>

      {/* Segment mix line as simple text to avoid chart prop mismatch */}
      <div className="text-xs text-gray-600">
        <div className="font-medium mb-1">Segment mix (weights)</div>
        <div className="rounded border px-2 py-1">
          {segs.length ? segs.map((w, i) => `${i + 1}: ${(w * 100).toFixed(0)}%`).join("  |  ") : "-"}
        </div>
      </div>

      {/* Prices line */}
      <div className="mt-1 text-[11px] text-gray-500">
        Prices:{" "}
        {prices
          ? `$${prices.good.toFixed(2)} / $${prices.better.toFixed(2)} / $${prices.best.toFixed(2)}`
          : "-"}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
