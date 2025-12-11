import type { ScorecardDelta } from "../lib/scorecard";
import RiskBadge from "./RiskBadge";

type GuardrailSummary = {
  gapLine: string;
  floorLine: string;
  optimizerLine: string;
};

type CalloutsSnapshotProps = {
  hasResult: boolean;
  basisLabel: string;
  ladderLabel: string;
  delta: ScorecardDelta | null;
  fallbackNarrative: ScorecardDelta | null;
  guardrails: GuardrailSummary;
  optimizerWhyLines: string[];
  binds?: string[];
  topDriverLine?: string | null;
  guardrailFloorLine?: string | null;
  validationNotes?: string[];
  riskNote?: string | null;
};

export default function CalloutsSnapshot({
  hasResult,
  basisLabel,
  ladderLabel,
  delta,
  fallbackNarrative,
  guardrails,
  optimizerWhyLines,
  binds = [],
  topDriverLine,
  guardrailFloorLine,
  validationNotes,
  riskNote,
}: CalloutsSnapshotProps) {
  if (!hasResult) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
        Run the optimizer to populate lift, driver, and guardrail callouts. We auto-pin your baseline before running so
        the deltas below have context.
      </div>
    );
  }

  const driverHeadline =
    delta?.mainDriver ?? fallbackNarrative?.mainDriver ?? "Drivers appear here once a baseline is set.";
  const driverSegment =
    delta?.segmentLine ??
    fallbackNarrative?.segmentLine ??
    "Narrate which segment is winning or losing once deltas are available.";
  const driverSuggestion = fallbackNarrative?.suggestion;

  const optimizerNote =
    optimizerWhyLines.length > 0
      ? optimizerWhyLines.slice(0, 2)
      : [guardrails.optimizerLine || "Optimizer ready - rerun if you change ranges, floors, or basis."];
  const validationList =
    validationNotes && validationNotes.length
      ? validationNotes
      : [
          "Validate guardrails in Pocket floor coverage.",
          "Review leakages in Pocket waterfall.",
          "Rerun optimizer after ladder or basis tweaks, then export/print the summary.",
          "Baseline auto-saved before this run; re-pin after manual tweaks to compare future changes.",
        ];

  return (
    <>
      <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
        <span>Basis: {basisLabel}.</span>
        {ladderLabel ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {ladderLabel}
          </span>
        ) : null}
        <RiskBadge note={riskNote} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 shadow-sm">
          <div className="text-[11px] uppercase text-slate-600">Lift vs baseline</div>
          <div className="text-2xl font-semibold text-slate-900">
            {delta
              ? `${delta.deltaProfit >= 0 ? "+" : "-"}$${Math.abs(delta.deltaProfit).toLocaleString()}`
              : "Baseline pending"}
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
            {delta ? (
              <>
                <li>Revenue {delta.deltaRevenue >= 0 ? "+" : "-"}${Math.abs(delta.deltaRevenue).toLocaleString()}</li>
                <li>Active {delta.deltaActive >= 0 ? "+" : "-"}{Math.abs(delta.deltaActive).toFixed(0)}</li>
                <li>ARPU {delta.deltaARPU >= 0 ? "+" : "-"}${Math.abs(delta.deltaARPU).toFixed(2)}</li>
              </>
            ) : (
              <li>Set or pin a baseline so deltas have context.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 shadow-sm">
          <div className="text-[11px] uppercase text-slate-600">Main driver</div>
          <div className="text-sm font-semibold text-slate-900">{driverHeadline}</div>
          <p className="text-[11px] text-slate-600 mt-1 leading-snug">{driverSegment}</p>
          {driverSuggestion ? (
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">{driverSuggestion}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-purple-100 bg-purple-50/50 px-3 py-3 shadow-sm">
          <div className="text-[11px] uppercase text-slate-600">Guardrails & outlook</div>
          <div className="text-sm font-semibold text-slate-900 leading-snug">{guardrails.gapLine}</div>
          <p className="text-[11px] text-slate-600 mt-1 leading-snug">{guardrailFloorLine ?? guardrails.floorLine}</p>
          {binds.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-700 leading-snug">
              {binds.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
          {topDriverLine ? (
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">Largest driver near optimum: {topDriverLine}</p>
          ) : null}
          {optimizerNote.map((line, idx) => (
            <p key={idx} className="text-[11px] text-slate-600 mt-1 leading-snug">
              {line}
            </p>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 shadow-sm">
          <div className="text-[11px] uppercase text-slate-600">Next steps</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-700 leading-snug">
            {validationList.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
