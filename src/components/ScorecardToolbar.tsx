type ScorecardView = "current" | "optimized";

type ScorecardToolbarProps = {
  baselineText: string;
  pinnedBasisText: string;
  activeBasisText: string;
  onPinBaseline: () => void;
  view: ScorecardView;
  onChangeView: (view: ScorecardView) => void;
  hasOptimized: boolean;
};

function ToolbarChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex-1 min-w-[180px] max-w-[320px] rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800 leading-tight truncate" title={value}>
        {value}
      </div>
      {hint ? <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function ToolbarToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const activeClasses = active ? "bg-gray-900 text-white" : "bg-white text-slate-700";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50";

  return (
    <button
      type="button"
      className={`px-3 py-1.5 text-xs font-semibold ${activeClasses} ${disabledClasses}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function ScorecardToolbar({
  baselineText,
  pinnedBasisText,
  activeBasisText,
  onPinBaseline,
  view,
  onChangeView,
  hasOptimized,
}: ScorecardToolbarProps) {
  return (
    <div className="flex w-full flex-col gap-3 text-xs text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Comparison context
        </div>
        <button
          type="button"
          className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={onPinBaseline}
        >
          Pin current as baseline
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <ToolbarChip label="Baseline for deltas" value={baselineText} hint="Frozen reference for charts" />
        <ToolbarChip label="Pinned basis" value={pinnedBasisText} hint="Use to narrate or export" />
        <ToolbarChip label="Active basis" value={activeBasisText} hint="What cards below are showing" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
        <div className="text-[11px] text-slate-500">
          Toggle what the scorecard tiles display; optimized view requires a successful run.
        </div>
        <div className="inline-flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">View</span>
          <div className="inline-flex overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
            <ToolbarToggle
              label="Current"
              active={view === "current"}
              onClick={() => onChangeView("current")}
            />
            <ToolbarToggle
              label="Optimized"
              active={view === "optimized"}
              disabled={!hasOptimized}
              onClick={() => hasOptimized && onChangeView("optimized")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
