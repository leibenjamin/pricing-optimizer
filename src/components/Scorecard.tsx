import InfoTip from "./InfoTip";
import {
  shareTilesFromKPIs,
  type ScorecardBand,
  type ScorecardDelta,
  type ScorecardShareTile,
} from "../lib/scorecard";
import type { SnapshotKPIs } from "../lib/snapshots";

type GuardrailSummary = {
  gapLine: string;
  floorLine: string;
  optimizerLine: string;
};

type BasisLabels = {
  baseline: string;
  active: string;
  pinned: string;
};

type ScorecardProps = {
  view: "current" | "optimized";
  hasOptimized: boolean;
  onChangeView: (view: "current" | "optimized") => void;
  onPinBaseline: () => void;
  basis: BasisLabels;
  kpis: SnapshotKPIs;
  baselineKPIs: SnapshotKPIs | null;
  activeCustomers: number;
  baselineActiveCustomers: number | null;
  marginDeltaPP: number | null;
  guardrails: GuardrailSummary;
  explain: ScorecardDelta | null;
  band?: ScorecardBand | null;
};

const TIER_LABEL: Record<ScorecardShareTile["tier"], string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

function toneClasses(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-700";
  return value >= 0
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function DeltaPill({
  label,
  value,
  formatter,
}: {
  label: string;
  value: number | null;
  formatter: (n: number) => string;
}) {
  if (value === null) {
    return (
      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
        {label}: baseline needed
      </div>
    );
  }
  const tone = toneClasses(value);
  const sign = value >= 0 ? "+" : "-";
  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}: {sign}
      {formatter(Math.abs(value))}
    </div>
  );
}

function MetricCard({
  label,
  infoId,
  aria,
  value,
  baselineLabel,
  delta,
  deltaPct,
  formatter,
}: {
  label: string;
  infoId?: string;
  aria?: string;
  value: string;
  baselineLabel: string;
  delta: number | null;
  deltaPct: number | null;
  formatter: (n: number) => string;
}) {
  const sign = delta === null ? "" : delta >= 0 ? "+" : "-";
  const showDelta = delta !== null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span className="flex items-center gap-1">
          {label}
          {infoId ? <InfoTip className="ml-1" align="right" id={infoId} ariaLabel={aria ?? label} /> : null}
        </span>
        {showDelta ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses(delta)}`}>
            {sign}
            {formatter(Math.abs(delta ?? 0))}
            {deltaPct !== null ? ` (${deltaPct >= 0 ? "+" : "-"}${Math.abs(deltaPct).toFixed(1)}%)` : ""}
          </span>
        ) : null}
      </div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{baselineLabel}</div>
    </div>
  );
}

function ShareTile({ tile }: { tile: ScorecardShareTile }) {
  const barWidth = Math.min(100, Math.max(4, tile.sharePct));
  const tone =
    tile.deltaPP === null
      ? "text-slate-500"
      : tile.deltaPP >= 0
      ? "text-emerald-700"
      : "text-rose-700";
  const deltaText =
    tile.deltaPP === null
      ? "Pin a baseline to see mix deltas."
      : `${tile.deltaPP >= 0 ? "+" : ""}${tile.deltaPP.toFixed(1)}pp vs baseline`;
  const tierColor: Record<ScorecardShareTile["tier"], string> = {
    good: "bg-sky-500",
    better: "bg-indigo-500",
    best: "bg-fuchsia-500",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span className="font-medium text-slate-800">{TIER_LABEL[tile.tier]}</span>
        <span className="font-semibold text-slate-900">{tile.sharePct}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
        <div className={`h-full rounded-full ${tierColor[tile.tier]}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className={`mt-1 text-[11px] ${tone}`}>{deltaText}</div>
    </div>
  );
}

function GuardrailCard({ guardrails }: { guardrails: GuardrailSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-600">Guardrails & optimizer</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug">{guardrails.gapLine}</div>
      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{guardrails.floorLine}</p>
      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{guardrails.optimizerLine}</p>
    </div>
  );
}

function BandCard({ band }: { band: ScorecardBand }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-600">Uncertainty band</div>
      <div className="text-[11px] text-slate-600 mt-1">
        Sensitivity +/-{Math.round((band.priceDelta ?? 0) * 1000) / 10}% | Leak +/-
        {Math.round((band.leakDelta ?? 0) * 1000) / 10}pp
      </div>
      <div className="text-[11px] text-slate-700 mt-1 flex flex-wrap gap-3">
        <span>
          Revenue {fmtUSD(band.low.revenue)} - {fmtUSD(band.high.revenue)}
        </span>
        <span>
          Profit {fmtUSD(band.low.profit)} - {fmtUSD(band.high.profit)}
        </span>
      </div>
    </div>
  );
}

export default function Scorecard({
  view,
  hasOptimized,
  onChangeView,
  onPinBaseline,
  basis,
  kpis,
  baselineKPIs,
  activeCustomers,
  baselineActiveCustomers,
  marginDeltaPP,
  guardrails,
  explain,
  band,
}: ScorecardProps) {
  const baselineFallback = "Baseline auto-saves when you apply a preset or run Optimize.";

  const summaryPills =
    baselineKPIs && baselineActiveCustomers !== null
      ? [
          {
            label: "Profit vs baseline",
            value: kpis.profit - baselineKPIs.profit,
            formatter: fmtUSD,
          },
          {
            label: "Active vs baseline",
            value: activeCustomers - baselineActiveCustomers,
            formatter: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}`,
          },
          {
            label: "Gross margin delta",
            value: marginDeltaPP,
            formatter: (v: number) => `${v.toFixed(1)} pp`,
          },
        ]
      : [];

  const marginPct = kpis.revenue > 0 ? (kpis.profit / kpis.revenue) * 100 : 0;
  const baselineMarginPct =
    baselineKPIs && baselineKPIs.revenue > 0 ? (baselineKPIs.profit / baselineKPIs.revenue) * 100 : null;

  const metrics = [
    {
      key: "revenue",
      label: "Revenue (N=1000)",
      infoId: "kpi.revenue",
      aria: "Why is Revenue computed this way?",
      value: fmtUSD(kpis.revenue),
      baselineLabel: baselineKPIs ? `Baseline ${fmtUSD(baselineKPIs.revenue)}` : baselineFallback,
      delta: baselineKPIs ? kpis.revenue - baselineKPIs.revenue : null,
      deltaPct:
        baselineKPIs && baselineKPIs.revenue
          ? ((kpis.revenue - baselineKPIs.revenue) / Math.max(baselineKPIs.revenue, 1e-9)) * 100
          : null,
      formatter: (v: number) => fmtUSD(v),
    },
    {
      key: "profit",
      label: "Profit (N=1000)",
      infoId: "kpi.profit",
      aria: "How is Profit calculated here?",
      value: fmtUSD(kpis.profit),
      baselineLabel: baselineKPIs ? `Baseline ${fmtUSD(baselineKPIs.profit)}` : baselineFallback,
      delta: baselineKPIs ? kpis.profit - baselineKPIs.profit : null,
      deltaPct:
        baselineKPIs && baselineKPIs.profit
          ? ((kpis.profit - baselineKPIs.profit) / Math.max(baselineKPIs.profit, 1e-9)) * 100
          : null,
      formatter: (v: number) => fmtUSD(v),
    },
    {
      key: "active",
      label: "Active customers",
      infoId: "kpi.active",
      aria: "What does Active customers mean?",
      value: activeCustomers.toLocaleString(),
      baselineLabel:
        baselineActiveCustomers !== null ? `Baseline ${baselineActiveCustomers.toLocaleString()}` : baselineFallback,
      delta: baselineActiveCustomers !== null ? activeCustomers - baselineActiveCustomers : null,
      deltaPct:
        baselineActiveCustomers && baselineActiveCustomers > 0
          ? ((activeCustomers - baselineActiveCustomers) / baselineActiveCustomers) * 100
          : null,
      formatter: (v: number) => Math.round(v).toLocaleString(),
    },
    {
      key: "arpu",
      label: "ARPU (active)",
      infoId: "kpi.arpu",
      aria: "What is ARPU (active)?",
      value: `$${kpis.arpuActive.toFixed(2)}`,
      baselineLabel: baselineKPIs ? `Baseline $${baselineKPIs.arpuActive.toFixed(2)}` : baselineFallback,
      delta: baselineKPIs ? kpis.arpuActive - baselineKPIs.arpuActive : null,
      deltaPct:
        baselineKPIs && baselineKPIs.arpuActive
          ? ((kpis.arpuActive - baselineKPIs.arpuActive) / Math.max(baselineKPIs.arpuActive, 1e-9)) * 100
          : null,
      formatter: (v: number) => `$${v.toFixed(2)}`,
    },
    {
      key: "margin",
      label: "Gross margin",
      infoId: "kpi.gm",
      aria: "How is Gross margin computed?",
      value: fmtPct(marginPct),
      baselineLabel: baselineMarginPct !== null ? `Baseline ${fmtPct(baselineMarginPct)}` : baselineFallback,
      delta: marginDeltaPP,
      deltaPct: null,
      formatter: (v: number) => `${v.toFixed(1)} pp`,
    },
  ];

  const shareTiles = shareTilesFromKPIs(kpis, baselineKPIs);
  const headline = explain?.mainDriver
    ? explain.mainDriver
    : baselineKPIs
    ? "Driver story appears once optimizer runs with a pinned baseline."
    : "Pin a baseline to unlock driver and lift narratives.";
  const segmentLine =
    explain?.segmentLine ??
    (baselineKPIs
      ? "Narrate which segment is winning or losing once deltas are available."
      : "Apply a preset and pin baseline to populate change stories.");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[260px] space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600">Quick story</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                View: {view === "current" ? "Current ladder" : "Optimized ladder"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                Basis: {basis.active}
              </span>
            </div>
            <div className="text-sm font-semibold text-slate-900 leading-snug">{headline}</div>
            <p className="text-[11px] text-slate-600 leading-snug">{segmentLine}</p>
            {explain?.suggestion ? (
              <p className="text-[11px] text-slate-600 leading-snug">{explain.suggestion}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {summaryPills.length > 0 ? (
                summaryPills.map((pill) =>
                  pill.value === null ? null : (
                    <DeltaPill key={pill.label} label={pill.label} value={pill.value} formatter={pill.formatter} />
                  )
                )
              ) : (
                <div className="text-[11px] text-slate-600">
                  Baseline auto-saves on preset or Optimize; pin anytime to compare lifts.
                </div>
              )}
              <a className="text-sky-600 text-xs hover:underline ml-auto" href="#callouts">
                Jump to Callouts
              </a>
            </div>
            <div className="text-[11px] text-slate-500">
              Baseline: {basis.baseline}. Pinned story: {basis.pinned}. View toggle sits above.
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-72">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Context</span>
              <div className="inline-flex overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  className={`px-2 py-1 text-[11px] font-semibold ${
                    view === "current" ? "bg-gray-900 text-white" : "bg-white text-slate-700"
                  }`}
                  onClick={() => onChangeView("current")}
                >
                  Current
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-[11px] font-semibold ${
                    view === "optimized" ? "bg-gray-900 text-white" : "bg-white text-slate-700"
                  } ${!hasOptimized ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => hasOptimized && onChangeView("optimized")}
                  disabled={!hasOptimized}
                >
                  Optimized
                </button>
              </div>
            </div>
            <GuardrailCard guardrails={guardrails} />
            {band ? <BandCard band={band} /> : null}
            <button
              type="button"
              className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 print:hidden"
              onClick={onPinBaseline}
            >
              Pin current as baseline
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((card) => (
          <MetricCard
            key={card.key}
            label={card.label}
            infoId={card.infoId}
            aria={card.aria}
            value={card.value}
            baselineLabel={card.baselineLabel}
            delta={card.delta}
            deltaPct={card.deltaPct}
            formatter={card.formatter}
          />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>Choice mix at this ladder</span>
            <span className="text-slate-500">Pair with Callouts to narrate who is buying and why.</span>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {shareTiles.map((tile) => (
              <ShareTile key={tile.tier} tile={tile} />
            ))}
          </div>
        </div>

        <div className="md:col-span-2 grid gap-3">
          <div className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Driver snapshot</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug">{headline}</div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">{segmentLine}</p>
            {explain?.suggestion ? (
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">{explain.suggestion}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-600">Baseline & story pins</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug">{basis.baseline}</div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              Active view: {basis.active}. Story uses: {basis.pinned}.
            </p>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              Pin before/after runs to lock deltas; exports lean on the pinned story basis.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap gap-2">
          <span className="font-semibold text-slate-800">New to this panel?</span>
          <span>
            Quick demo: pick a preset -&gt; click Optimize -&gt; read the green/red deltas and the driver snapshot above, then
            jump to Callouts on the right rail.
          </span>
          <span>
            Power user: adjust ranges/floors/basis, rerun Optimize, pin baselines between iterations, then export the story once the mix
            and guardrails look right.
          </span>
        </div>
      </div>
    </div>
  );
}
