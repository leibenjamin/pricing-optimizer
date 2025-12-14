import InfoTip from "./InfoTip";
import {
  shareTilesFromKPIs,
  type ScorecardBand,
  type ScorecardDelta,
  type ScorecardShareTile,
} from "../lib/scorecard";
import type { SnapshotKPIs } from "../lib/snapshots";
import type { ScenarioRun } from "../lib/domain";
import RiskBadge from "./RiskBadge";

type GuardrailSummary = {
  gapLine: string;
  floorLine: string;
  optimizerLine: string;
  optimizerHint?: string;
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
  onViewInsights?: () => void;
  basis: BasisLabels;
  kpis: SnapshotKPIs;
  run?: ScenarioRun | null;
  baselineRun?: ScenarioRun | null;
  activeCustomers: number;
  baselineActiveCustomers: number | null;
  marginDeltaPP: number | null;
  guardrails: GuardrailSummary;
  explain: ScorecardDelta | null;
  band?: ScorecardBand | null;
  riskNote?: string | null;
  priceDeltas?: Array<{ tier: "good" | "better" | "best"; base: number; current: number; delta: number | null }>;
};

const TIER_LABEL: Record<ScorecardShareTile["tier"], string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const fmtPrice = (n: number) => `$${n.toFixed(2)}`;

function toneClasses(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-700";
  return value >= 0
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function priceToneClasses(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-700";
  return value > 0
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value < 0
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function pctLabel(args: { base: number | null; delta: number | null; pct: number | null }): string | null {
  const { base, delta, pct } = args;
  if (delta === null || base === null) return null;
  if (Math.abs(base) < 1e-9) return Math.abs(delta) < 1e-9 ? "0%" : "new";
  if (pct === null) return null;
  return `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`;
}

function DeltaBadge({
  delta,
  deltaPctLabel,
  formatAbs,
  tone,
}: {
  delta: number | null;
  deltaPctLabel: string | null;
  formatAbs: (n: number) => string;
  tone: string;
}) {
  if (delta === null) return null;
  const sign = delta >= 0 ? "+" : "-";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {sign}
      {formatAbs(Math.abs(delta))}
      {deltaPctLabel ? ` (${deltaPctLabel})` : ""}
    </span>
  );
}

type TierComparison = {
  tier: ScorecardShareTile["tier"];
  sharePct: number;
  shareDeltaPP: number | null;
  activePrice: number | null;
  baselinePrice: number | null;
  priceDelta: number | null;
  priceDeltaPct: number | null;
  activeCustomers: number | null;
  baselineCustomers: number | null;
  customerDelta: number | null;
  customerDeltaPct: number | null;
};

function TierComparisonCard({
  data,
}: {
  data: TierComparison;
}) {
  const shareTone =
    data.shareDeltaPP === null
      ? "text-slate-500"
      : data.shareDeltaPP >= 0
      ? "text-emerald-700"
      : "text-rose-700";

  const fmtCount = (n: number) => Math.round(n).toLocaleString();
  const baselinePriceText = data.baselinePrice === null ? "—" : fmtPrice(data.baselinePrice);
  const activePriceText = data.activePrice === null ? "—" : fmtPrice(data.activePrice);
  const baselineCustomersText = data.baselineCustomers === null ? "—" : fmtCount(data.baselineCustomers);
  const activeCustomersText = data.activeCustomers === null ? "—" : fmtCount(data.activeCustomers);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{TIER_LABEL[data.tier]}</div>
        <div className={`text-[11px] ${shareTone}`}>
          {data.sharePct.toFixed(1)}%
          {data.shareDeltaPP !== null ? ` (${data.shareDeltaPP >= 0 ? "+" : ""}${data.shareDeltaPP.toFixed(1)}pp)` : ""}
        </div>
      </div>

      <div className="mt-2 space-y-2 text-[11px] text-slate-700">
        <div className="grid grid-cols-[76px,1fr] items-center gap-2">
          <div className="text-slate-600">Price</div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate">
              <span className="font-semibold text-slate-900">{activePriceText}</span>
              <span className="ml-2 text-slate-500">base {baselinePriceText}</span>
            </div>
            <DeltaBadge
              delta={data.priceDelta}
              deltaPctLabel={pctLabel({ base: data.baselinePrice, delta: data.priceDelta, pct: data.priceDeltaPct })}
              formatAbs={(n) => `$${n.toFixed(2)}`}
              tone={priceToneClasses(data.priceDelta)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[76px,1fr] items-center gap-2">
          <div className="text-slate-600">Customers</div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate">
              <span className="font-semibold text-slate-900">{activeCustomersText}</span>
              <span className="ml-2 text-slate-500">base {baselineCustomersText}</span>
            </div>
            <DeltaBadge
              delta={data.customerDelta}
              deltaPctLabel={pctLabel({ base: data.baselineCustomers, delta: data.customerDelta, pct: data.customerDeltaPct })}
              formatAbs={(n) => fmtCount(n)}
              tone={toneClasses(data.customerDelta)}
            />
          </div>
        </div>
      </div>
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
    <div className="rounded-xl border border-slate-200 bg-white/80 p-2 shadow-sm flex flex-col gap-1">
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
      <div className="text-lg font-semibold text-slate-900 leading-snug">{value}</div>
      <div className="text-[10px] text-slate-500 leading-tight">{baselineLabel}</div>
    </div>
  );
}

function GuardrailCard({ guardrails }: { guardrails: GuardrailSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-600">Guardrails & optimizer</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug">{guardrails.gapLine}</div>
      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{guardrails.floorLine}</p>
      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
        {guardrails.optimizerLine}
        {guardrails.optimizerHint ? ` Tip: ${guardrails.optimizerHint}` : ""}
      </p>
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
        <span className="text-slate-500">(Basis follows Optimize toggle; pocket includes leakages, list ignores them.)</span>
      </div>
    </div>
  );
}

export default function Scorecard({
  view,
  hasOptimized,
  onChangeView,
  onPinBaseline,
  onViewInsights,
  basis,
  kpis,
  run,
  baselineRun,
  activeCustomers,
  baselineActiveCustomers,
  marginDeltaPP,
  guardrails,
  explain,
  band,
  riskNote,
  priceDeltas,
}: ScorecardProps) {
  const activeKpis = run?.kpis ?? kpis;
  const baselineKpis = baselineRun?.kpis ?? null;
  const baselineFallback = "No pinned baseline yet.";
  const shareTiles = shareTilesFromKPIs(activeKpis, baselineKpis);
  const activeLabel = view === "optimized" ? "Optimized" : "Current";

  const tierComparisons: TierComparison[] = (() => {
    const tiers: TierComparison["tier"][] = ["good", "better", "best"];
    const activeDenom = 1 - (activeKpis.shares.none ?? 0);
    const activeN = activeDenom > 1e-9 ? activeCustomers / activeDenom : null;

    const baselineDenom =
      baselineKpis && typeof baselineKpis.shares.none === "number" ? 1 - baselineKpis.shares.none : null;
    const baselineN =
      baselineKpis && baselineActiveCustomers !== null && baselineDenom !== null && baselineDenom > 1e-9
        ? baselineActiveCustomers / baselineDenom
        : null;

    const priceByTier = new Map<TierComparison["tier"], { base: number; current: number }>();
    if (priceDeltas && priceDeltas.length) {
      priceDeltas.forEach((p) => {
        priceByTier.set(p.tier, { base: p.base, current: p.current });
      });
    }

    return tiers.map((tier) => {
      const tile = shareTiles.find((t) => t.tier === tier);
      const baselinePrice = priceByTier.get(tier)?.base ?? baselineRun?.ladder?.[tier] ?? null;
      const activePrice = priceByTier.get(tier)?.current ?? activeKpis.prices?.[tier] ?? run?.ladder?.[tier] ?? null;
      const priceDelta = baselinePrice !== null && activePrice !== null ? activePrice - baselinePrice : null;
      const priceDeltaPct =
        priceDelta !== null && baselinePrice !== null && Math.abs(baselinePrice) > 1e-9
          ? (priceDelta / baselinePrice) * 100
          : null;

      const activeTierCustomers =
        activeN !== null ? Math.round(activeN * (activeKpis.shares[tier] ?? 0)) : null;
      const baselineTierCustomers =
        baselineN !== null && baselineKpis ? Math.round(baselineN * (baselineKpis.shares[tier] ?? 0)) : null;
      const customerDelta =
        baselineTierCustomers !== null && activeTierCustomers !== null ? activeTierCustomers - baselineTierCustomers : null;
      const customerDeltaPct =
        customerDelta !== null && baselineTierCustomers !== null && baselineTierCustomers > 0
          ? (customerDelta / baselineTierCustomers) * 100
          : null;

      return {
        tier,
        sharePct: tile?.sharePct ?? 0,
        shareDeltaPP: tile?.deltaPP ?? null,
        activePrice,
        baselinePrice,
        priceDelta,
        priceDeltaPct,
        activeCustomers: activeTierCustomers,
        baselineCustomers: baselineTierCustomers,
        customerDelta,
        customerDeltaPct,
      };
    });
  })();

  const marginPct = activeKpis.revenue > 0 ? (activeKpis.profit / activeKpis.revenue) * 100 : 0;
  const baselineMarginPct =
    baselineKpis && baselineKpis.revenue > 0 ? (baselineKpis.profit / baselineKpis.revenue) * 100 : null;
  const wideBand =
    band && ((band.priceDelta ?? 0) > 0.12 || (band.leakDelta ?? 0) > 0.12);

  const metrics = [
    {
      key: "revenue",
      label: "Revenue (N=1000)",
      infoId: "kpi.revenue",
      aria: "Why is Revenue computed this way?",
      value: fmtUSD(activeKpis.revenue),
      baselineLabel: baselineKpis ? `Baseline ${fmtUSD(baselineKpis.revenue)}` : baselineFallback,
      delta: baselineKpis ? activeKpis.revenue - baselineKpis.revenue : null,
      deltaPct:
        baselineKpis && baselineKpis.revenue
          ? ((activeKpis.revenue - baselineKpis.revenue) / Math.max(baselineKpis.revenue, 1e-9)) * 100
          : null,
      formatter: (v: number) => fmtUSD(v),
    },
    {
      key: "profit",
      label: "Profit (N=1000)",
      infoId: "kpi.profit",
      aria: "How is Profit calculated here?",
      value: fmtUSD(activeKpis.profit),
      baselineLabel: baselineKpis ? `Baseline ${fmtUSD(baselineKpis.profit)}` : baselineFallback,
      delta: baselineKpis ? activeKpis.profit - baselineKpis.profit : null,
      deltaPct:
        baselineKpis && baselineKpis.profit
          ? ((activeKpis.profit - baselineKpis.profit) / Math.max(baselineKpis.profit, 1e-9)) * 100
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
      value: `$${activeKpis.arpuActive.toFixed(2)}`,
      baselineLabel: baselineKpis ? `Baseline $${baselineKpis.arpuActive.toFixed(2)}` : baselineFallback,
      delta: baselineKpis ? activeKpis.arpuActive - baselineKpis.arpuActive : null,
      deltaPct:
        baselineKpis && baselineKpis.arpuActive
          ? ((activeKpis.arpuActive - baselineKpis.arpuActive) / Math.max(baselineKpis.arpuActive, 1e-9)) * 100
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
  const headline = explain?.mainDriver
    ? explain.mainDriver
    : baselineKpis
    ? "Driver story appears once optimizer runs with a pinned baseline."
    : "Pin a baseline to unlock driver and lift narratives.";
  const mixShift =
    shareTiles.length && baselineKpis
      ? (() => {
          const withDelta = shareTiles
            .filter((t) => t.deltaPP !== null)
            .map((t) => ({ tier: TIER_LABEL[t.tier], delta: t.deltaPP as number }));
          if (!withDelta.length) return null;
          withDelta.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
          const top = withDelta[0];
          return `Mix shift: ${top.tier} ${top.delta >= 0 ? "+" : ""}${top.delta.toFixed(1)}pp vs baseline.`;
        })()
      : null;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white/90 p-2 sm:p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-600">Quick story</span>
          <span className="hidden print:inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            View: {view === "current" ? "Current ladder" : "Optimized ladder"}
          </span>
          <div className="inline-flex overflow-hidden rounded border border-slate-200 bg-white shadow-sm print:hidden">
            <button
              type="button"
              className={`px-2 py-1 text-[11px] font-semibold ${
                view === "current" ? "bg-gray-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => onChangeView("current")}
            >
              Current
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-[11px] font-semibold ${
                view === "optimized" ? "bg-gray-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              } ${!hasOptimized ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => hasOptimized && onChangeView("optimized")}
              disabled={!hasOptimized}
            >
              Optimized
            </button>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            Basis: {basis.active}
          </span>
          {onViewInsights ? (
            <button
              type="button"
              className="ml-auto text-sky-700 text-xs font-semibold hover:underline print:hidden"
              onClick={onViewInsights}
            >
              See insights
            </button>
          ) : null}
        </div>

        <div className="mt-2 text-sm font-semibold text-slate-900 leading-snug">{headline}</div>
        {mixShift ? <p className="mt-1 text-[11px] text-slate-600 leading-snug">{mixShift}</p> : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <RiskBadge note={riskNote} infoId="risk.badge" />
          {wideBand ? (
            <span className="text-[11px] text-amber-700">Bands are wide; test mixed moves before rollout.</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
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

      <div className="rounded-xl border border-slate-200 bg-white/90 p-2 sm:p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-800">Tier ladder and mix vs baseline</span>
          <span className="text-slate-500">{activeLabel} vs baseline</span>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
          {tierComparisons.map((t) => (
            <TierComparisonCard key={t.tier} data={t} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-2 sm:p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-800">Context</span>
          <button
            type="button"
            className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 print:hidden"
            onClick={onPinBaseline}
          >
            Pin current as baseline
          </button>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Baseline: {basis.baseline}. Pinned story: {basis.pinned}.{" "}
          <InfoTip id="scorecard.basis" ariaLabel="About scorecard basis" />
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <GuardrailCard guardrails={guardrails} />
          {band ? <BandCard band={band} /> : null}
        </div>
      </div>
    </div>
  );
}
