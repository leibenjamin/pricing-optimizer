// src/components/PresetPicker.tsx
import InfoTip from "./InfoTip";
import type { Preset } from "../lib/presets";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function leakSummary(p: Preset) {
  const L = p.leak;
  // Show the most “credible” quick tells recruiters expect to see
  // (payments %/fixed, average promo, refunds)
  const avgPromo = (L.promo.good + L.promo.better + L.promo.best) / 3;
  const avgVol   = (L.volume.good + L.volume.better + L.volume.best) / 3;
  return [
    `Pay ${pct(L.paymentPct)}${L.paymentFixed ? ` + $${L.paymentFixed.toFixed(2)}` : ""}`,
    `Promo ~${pct(avgPromo)}`,
    `Volume ~${pct(avgVol)}`,
    `Refunds ${pct(L.refundsPct)}`,
    L.fxPct ? `FX ${pct(L.fxPct)}` : null,
  ].filter(Boolean).join(" · ");
}

export default function PresetPicker({
  presets,
  activeId,
  onApply,
  className = "",
  infoHtml,
}: {
  presets: Preset[];
  activeId?: string | null;
  onApply: (p: Preset) => void;
  className?: string;
  infoHtml?: string; // from explain("presets.scenario")
}) {
  return (
    <section className={className} aria-label="Preset scenarios">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Preset scenarios
        </h3>
        {infoHtml ? <InfoTip html={infoHtml} ariaLabel="About scenario presets" /> : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {presets.map((p) => {
          const isActive = p.id === activeId;
          return (
            <div
              key={p.id}
              className={
                "rounded-lg border p-2 bg-white " +
                (isActive ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-900">{p.name}</div>
                  {p.note ? (
                    <div className="text-[11px] text-slate-600 mt-0.5">{p.note}</div>
                  ) : null}
                </div>
                <button
                  className={
                    "text-[11px] px-2 py-1 rounded border " +
                    (isActive
                      ? "border-blue-500 text-blue-600 bg-blue-50 cursor-default"
                      : "border-slate-300 text-slate-700 bg-white hover:bg-slate-50")
                  }
                  disabled={isActive}
                  onClick={() => onApply(p)}
                >
                  {isActive ? "Active" : "Apply"}
                </button>
              </div>

              {/* mini credibility row */}
              <div className="mt-2 text-[11px] text-slate-700">
                <div className="truncate">
                  <span className="text-slate-500">Price ladder:</span>{" "}
                  {["good","better","best"].map((t, i) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const val = (p.prices as any)[t];
                    return <span key={t}>{money(val)}{i<2?" · ":""}</span>;
                  })}
                </div>
                <div className="truncate">
                  <span className="text-slate-500">Costs:</span>{" "}
                  {["good","better","best"].map((t, i) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const val = (p.costs as any)[t];
                    return <span key={t}>{money(val)}{i<2?" · ":""}</span>;
                  })}
                </div>
                <div className="truncate">
                  <span className="text-slate-500">Leakages:</span>{" "}
                  {leakSummary(p)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
