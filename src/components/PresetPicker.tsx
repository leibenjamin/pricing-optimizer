// src/components/PresetPicker.tsx

import InfoTip from "./InfoTip";
import type { Preset } from "../lib/presets";
import type { Prices } from "../lib/segments";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number) => `$${n.toFixed(2)}`;

function leakSummary(p: Preset) {
  const L = p.leak;
  // Show the most credible quick tells
  // (payments %/fixed, average promo, refunds)
  const avgPromo = (L.promo.good + L.promo.better + L.promo.best) / 3;
  const avgVol   = (L.volume.good + L.volume.better + L.volume.best) / 3;
  return [
    `Pay ${pct(L.paymentPct)}${L.paymentFixed ? ` + $${L.paymentFixed.toFixed(2)}` : ""}`,
    `Promo ~${pct(avgPromo)}`,
    `Volume ~${pct(avgVol)}`,
    `Refunds ${pct(L.refundsPct)}`,
    L.fxPct ? `FX ${pct(L.fxPct)}` : null,
  ].filter(Boolean).join(" | ");
}

function featureSummary(p: Preset) {
  if (!p.features) return null;
  const { featA, featB } = p.features;
  return `Features: A ${featA.good}/${featA.better}/${featA.best}; B ${featB.good}/${featB.better}/${featB.best}`;
}

function optimizerSummary(p: Preset) {
  if (!p.optConstraints) return null;
  const c = p.optConstraints;
  const floors = `${pct(c.marginFloor.good)} / ${pct(c.marginFloor.better)} / ${pct(c.marginFloor.best)}`;
  const basis = c.usePocketProfit ? "Pocket profit" : "List profit";
  const floorBasis = c.usePocketMargins ? "pocket floors" : "list floors";
  const charm = c.charm ? "charm on" : "charm off";
  return `${basis}, ${floorBasis}, gaps ${c.gapGB}/${c.gapBB}, floors ${floors}, ${charm}`;
}

function rangeSummary(p: Preset) {
  if (!p.optRanges) return null;
  const { good, better, best, step } = p.optRanges;
  return `Ranges: G ${money(good[0])}-${money(good[1])}, B ${money(better[0])}-${money(better[1])}, Best ${money(best[0])}-${money(best[1])} (step ${step})`;
}

function sensitivitySummary(p: Preset) {
  const bits: string[] = [];
  if (p.tornado) {
    const metric = p.tornado.metric === "revenue" ? "Revenue" : "Profit";
    const units = p.tornado.valueMode === "percent" ? "% view" : "$ view";
    const span = p.tornado.rangeMode === "data" ? "data-driven span" : "+/-" + (p.tornado.priceBump ?? 10) + "%";
    bits.push(`${metric} tornado (${units}, ${p.tornado.usePocket ? "Pocket" : "List"}), ${span}, leak bump ${p.tornado.pctBump ?? 0}%pt.`);
  }
  if (typeof p.retentionPct === "number") bits.push(`Retention ${p.retentionPct}%`);
  if (typeof p.kpiFloorAdj === "number" && p.kpiFloorAdj !== 0) bits.push(`Floor sensitivity ${p.kpiFloorAdj}%pt.`);
  return bits.length ? bits.join(" | ") : null;
}

function channelSummary(p: Preset) {
  if (!p.channelMix || !p.channelMix.length) return null;
  return `Channel blend: ${p.channelMix.map((r) => `${r.preset} ${Math.round(r.w)}%`).join(" | ")}`;
}

export default function PresetPicker({
  presets,
  activeId,
  onApply,
  onResetActive,
  onReapply,
  activeDiffs,
  className = "",
  infoId,
}: {
  presets: Preset[];
  activeId?: string | null;
  onApply: (p: Preset) => void;
  onResetActive?: (p: Preset) => void;
  onReapply?: (p: Preset) => void;
  activeDiffs?: string[] | null;
  className?: string;
  infoId?: string; // from explain("presets.scenario")
}) {
  return (
    <section className={className} aria-label="Preset scenarios">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Preset scenarios
        </h3>
        {infoId ? <InfoTip id={infoId} className="ml-1" ariaLabel="About scenario presets" /> : null}
      </div>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {presets.map((p) => {
          const isActive = p.id === activeId;
          const diffs = isActive ? activeDiffs ?? [] : [];
          const isDirty = isActive && diffs.length > 0;
          return (
            <div
              key={p.id}
              className={
                "min-w-0 rounded-xl border bg-white shadow-sm p-3 flex flex-col gap-3 h-auto" +
                (isActive ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold leading-tight wrap-break-word">{p.name}</div>
                  {p.note ? (
                    <div className="text-xs text-slate-600 whitespace-normal wrap-break-word leading-tight">{p.note}</div>
                  ) : null}
                  {isDirty ? (
                    <div className="text-[11px] text-amber-700 flex flex-wrap items-center gap-2 mt-1 wrap-break-word">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 uppercase tracking-wide">Modified</span>
                      <span className="whitespace-normal wrap-break-word">Touched: {diffs.join(", ")}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    className={
                      "text-xs px-2 py-1 rounded border " +
                      (isActive
                        ? isDirty
                          ? "border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100"
                          : "border-blue-500 text-blue-600 bg-blue-50 cursor-default"
                        : "border-slate-300 text-slate-700 bg-white hover:bg-slate-50")
                    }
                    disabled={isActive && !isDirty}
                    onClick={() => (isDirty && onReapply ? onReapply(p) : onApply(p))}
                  >
                    {isActive ? (isDirty ? "Reapply" : "Active") : "Apply"}
                  </button>
                  {isActive && onResetActive ? (
                    <button
                      className="text-[11px] text-slate-600 underline"
                      type="button"
                      onClick={() => onResetActive(p)}
                    >
                      Reset preset
                    </button>
                  ) : null}
                </div>
              </div>

              {/* key details */}
              <ul className="mt-1 text-[11px] text-slate-700 space-y-1 whitespace-normal wrap-break-word leading-snug">
                <li>
                  <span className="text-slate-500">Price ladder:</span>{" "}
                  {(["good", "better", "best"] as Array<keyof Prices>).map((t, i) => {
                    const val = p.prices[t];
                    return (
                      <span key={t}>
                        {money(val)}
                        {i < 2 ? " → " : ""}
                      </span>
                    );
                  })}
                </li>
                <li>
                  <span className="text-slate-500">Costs:</span>{" "}
                  {(["good", "better", "best"] as Array<keyof Prices>).map((t, i) => {
                    const val = p.costs[t];
                    return (
                      <span key={t}>
                        {money(val)}
                        {i < 2 ? " → " : ""}
                      </span>
                    );
                  })}
                </li>
                <li>
                  <span className="text-slate-500">Refs:</span>{" "}
                  {(["good", "better", "best"] as Array<keyof Prices>).map((t, i) => {
                    const val = p.refPrices[t];
                    return (
                      <span key={t}>
                        {money(val)}
                        {i < 2 ? " → " : ""}
                      </span>
                    );
                  })}
                </li>
                {featureSummary(p) ? (
                  <li><span className="text-slate-500">Features:</span> {featureSummary(p)}</li>
                ) : null}
                <li><span className="text-slate-500">Leakages:</span> {leakSummary(p)}</li>
                {optimizerSummary(p) ? (
                  <li><span className="text-slate-500">Optimizer:</span> {optimizerSummary(p)}</li>
                ) : null}
                {rangeSummary(p) ? (
                  <li><span className="text-slate-500">Ranges:</span> {rangeSummary(p)}</li>
                ) : null}
                {channelSummary(p) ? (
                  <li><span className="text-slate-500">Channels:</span> {channelSummary(p)}</li>
                ) : null}
                {sensitivitySummary(p) ? (
                  <li><span className="text-slate-500">Sensitivity:</span> {sensitivitySummary(p)}</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
