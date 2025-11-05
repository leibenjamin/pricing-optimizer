// src/components/CompareBoard.tsx

export type CompareKPIs = {
  title: string;
  prices: { good: number; better: number; best: number };
  revenue: number;           // N-normalized (same N as app, e.g., 1000)
  profit: number;            // same basis
  convPct: number;           // (good+better+best) * 100
  grossMarginPct: number;    // profit/revenue (0..1) when revenue>0 else 0
};

type SlotId = "A" | "B" | "C";

export function CompareBoard({
  slots,
  current,
  onLoad,
  onClear,
}: {
  slots: Record<SlotId, CompareKPIs | null>;
  current: CompareKPIs;
  onLoad: (slot: SlotId) => void;
  onClear: (slot: SlotId) => void;
}) {
  const order: SlotId[] = ["A", "B", "C"];

  const Card = ({ id }: { id: SlotId }) => {
    const k = slots[id];
    if (!k) {
      return (
        <div className="rounded-2xl border bg-white p-3 shadow-sm text-sm flex flex-col items-start justify-between">
          <div className="font-semibold mb-1">Slot {id}</div>
          <div className="text-gray-500 text-xs mb-3">
            Empty. Use “Save to {id}” to capture the current scenario.
          </div>
          <div className="flex gap-2 mt-auto">
            <button
              className="border rounded px-2 py-1 text-xs bg-white opacity-60 cursor-not-allowed"
              aria-disabled="true"
              disabled
              title="No scenario saved yet"
            >
              Load
            </button>
            <button
              className="border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50"
              onClick={() => onClear(id)}
              title="Clear slot"
            >
              Clear
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border bg-white p-3 shadow-sm text-sm flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Slot {id}</div>
          <div className="text-[11px] text-gray-500">{k.title}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500">Good</div>
            <div className="font-medium">${k.prices.good}</div>
          </div>
          <div>
            <div className="text-gray-500">Better</div>
            <div className="font-medium">${k.prices.better}</div>
          </div>
          <div>
            <div className="text-gray-500">Best</div>
            <div className="font-medium">${k.prices.best}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500">Revenue</div>
            <div className="font-medium">
              ${Math.round(k.revenue).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Profit</div>
            <div className="font-medium">
              ${Math.round(k.profit).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Conv.</div>
            <div className="font-medium">{k.convPct.toFixed(1)}%</div>
          </div>
        </div>

        <div className="text-[11px] text-gray-600">
          Gross margin {Math.round(k.grossMarginPct * 1000) / 10}%
        </div>

        {/* Simple deltas vs current */}
        <div className="text-[11px] text-gray-600">
          Δ Profit vs current:{" "}
          <span className="font-medium">
            ${Math.round(k.profit - current.profit).toLocaleString()}
          </span>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            className="border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50"
            onClick={() => onLoad(id)}
            title="Load this scenario back into the controls"
          >
            Load
          </button>
          <button
            className="border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50"
            onClick={() => onClear(id)}
            title="Clear slot"
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {order.map((id) => (
        <Card key={id} id={id} />
      ))}
    </div>
  );
}

export default CompareBoard;
