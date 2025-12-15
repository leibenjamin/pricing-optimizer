// src/components/SegmentCards.tsx

import type { Segment } from "../lib/segments";
import { describeSegment, segmentWeightPct } from "../lib/segmentNarrative";

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
                  {segmentWeightPct(seg)}%
                </div>
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${segmentWeightPct(seg)}%` }}
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
