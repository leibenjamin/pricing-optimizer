// src/components/SegmentCards.tsx
import type { Segment } from "../lib/segments";

function clampPct(x: number) {
  return Math.max(0, Math.min(100, Math.round(x * 100)));
}

export function describeSegment(seg: Segment): string[] {
  const lines: string[] = [];
  const price = Math.abs(seg.betaPrice);
  if (price >= 0.22) {
    lines.push("Extremely price-sensitive; even small list moves change take-rate.");
  } else if (price >= 0.16) {
    lines.push("Price-aware but will trade up if the bundle feels superior.");
  } else if (price >= 0.10) {
    lines.push("Balances price and value; charm pricing helps more than deep cuts.");
  } else {
    lines.push("Value-first; comfortable paying for differentiated tiers.");
  }

  const featGap = seg.betaFeatA - seg.betaFeatB;
  if (Math.abs(featGap) < 0.05) {
    lines.push("Cares about Feature A + B evenly -- mention both benefits when pitching.");
  } else if (featGap > 0) {
    lines.push("Feature A is the upgrade trigger; highlight that story when nudging them up.");
  } else {
    lines.push("Feature B is the differentiator; bundle services add-ons to win them over.");
  }

  const anchor = seg.alphaAnchor ?? 0;
  const loss = seg.lambdaLoss ?? 1;
  if (anchor > 0.12) {
    lines.push("Anchored on reference prices -- list vs pocket messaging matters.");
  }
  if (loss > 1.35) {
    lines.push("Loss-averse: offer give-back guarantees or promo safety nets.");
  }

  return lines.slice(0, 3);
}

export default function SegmentCards({ segments }: { segments: Segment[] }) {
  if (!segments.length) {
    return (
      <p className="text-xs text-slate-500">
        Run the estimator or import a scenario to see segment narratives.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((seg) => {
        const lines = describeSegment(seg);
        return (
          <div
            key={seg.name}
            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  Segment
                </div>
                <div className="text-base font-semibold text-slate-900">
                  {seg.name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Weight</div>
                <div className="text-sm font-semibold text-slate-900">
                  {clampPct(seg.weight)}%
                </div>
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${clampPct(seg.weight)}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-600 list-disc list-inside">
              {lines.map((line, idx) => (
                <li key={`${seg.name}-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
