// src/components/CompareBoardSection.tsx

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SnapshotKPIs } from "../lib/snapshots";
import CompareBoard from "./CompareBoard";
import InfoTip from "./InfoTip";
import { Section } from "./Section";

type SlotId = "A" | "B" | "C";

type Props = {
  className?: string;
  explanation: ReactNode;
  slots: Record<SlotId, SnapshotKPIs | null>;
  current: SnapshotKPIs;
  compareUseSavedSegments: boolean;
  setCompareUseSavedSegments: Dispatch<SetStateAction<boolean>>;
  compareUseSavedLeak: boolean;
  setCompareUseSavedLeak: Dispatch<SetStateAction<boolean>>;
  compareUseSavedRefs: boolean;
  setCompareUseSavedRefs: Dispatch<SetStateAction<boolean>>;
  onSaveSlot: (id: SlotId) => void;
  onLoadSlot: (id: SlotId) => void;
  onClearSlot: (id: SlotId) => void;
};

export function CompareBoardSection({
  className,
  explanation,
  slots,
  current,
  compareUseSavedSegments,
  setCompareUseSavedSegments,
  compareUseSavedLeak,
  setCompareUseSavedLeak,
  compareUseSavedRefs,
  setCompareUseSavedRefs,
  onSaveSlot,
  onLoadSlot,
  onClearSlot,
}: Props) {
  return (
    <Section id="compare-board" title="Scenario Compare (A/B/C)" className={className}>
      {explanation}
      <div className="text-[11px] text-slate-600 mb-1">
        Slots use saved prices/costs/refs/leak/segments and the saved pocket/list basis if present; Current uses live state. Use A/B/C to branch mixed moves without losing the pinned baseline in Results Overview.
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-1">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={compareUseSavedSegments}
            onChange={(e) => setCompareUseSavedSegments(e.target.checked)}
          />
          Use saved segments for slots
        </label>
        <InfoTip id="compare.toggles" ariaLabel="How compare toggles work" />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-2">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={compareUseSavedLeak}
            onChange={(e) => setCompareUseSavedLeak(e.target.checked)}
          />
          Use saved leak for slots
        </label>
        <InfoTip id="compare.leak" ariaLabel="Use saved leak?" />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-3">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={compareUseSavedRefs}
            onChange={(e) => setCompareUseSavedRefs(e.target.checked)}
          />
          Use saved reference prices for slots
        </label>
        <InfoTip id="compare.refs" ariaLabel="Use saved reference prices?" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
        <span className="text-gray-600">Save current to:</span>
        {(["A", "B", "C"] as const).map((id) => (
          <button
            key={id}
            className="border rounded px-2 py-1 bg-white hover:bg-gray-50"
            onClick={() => onSaveSlot(id)}
          >
            Save to {id}
          </button>
        ))}
      </div>

      <CompareBoard
        slots={slots}
        current={current}
        onLoad={(id) => onLoadSlot(id)}
        onClear={(id) => onClearSlot(id)}
      />
    </Section>
  );
}
