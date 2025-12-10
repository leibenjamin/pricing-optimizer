import { useMemo, Suspense } from "react";
import type { Dispatch, SetStateAction } from "react";
import { computePocketPrice, type Leakages, type Tier } from "../lib/waterfall";
import { LEAK_PRESETS, blendLeakPresets } from "../lib/waterfallPresets";
import type { Prices } from "../lib/segments";
import ActionCluster from "./ActionCluster";
import InfoTip from "./InfoTip";
import { Section } from "./Section";
import ErrorBoundary from "./ErrorBoundary";
import Waterfall from "./Waterfall";

type ChannelMixRow = { preset: string; w: number };

type WaterfallSectionProps = {
  leak: Leakages;
  setLeak: Dispatch<SetStateAction<Leakages>>;
  waterTier: Tier;
  setWaterTier: Dispatch<SetStateAction<Tier>>;
  presetSel: string;
  setPresetSel: Dispatch<SetStateAction<string>>;
  channelBlendApplied: boolean;
  setChannelBlendApplied: Dispatch<SetStateAction<boolean>>;
  channelMix: ChannelMixRow[];
  setChannelMix: Dispatch<SetStateAction<ChannelMixRow[]>>;
  prices: Prices;
};

const WATERFALL_LEGEND = [
  { key: "list", label: "List", color: "#0ea5e9", infoId: "waterfall.step.list", aria: "What is the list price starting point?" },
  { key: "promo", label: "Promo", color: "#f97316", infoId: "waterfall.step.promo", aria: "How do promo discounts work?" },
  { key: "volume", label: "Volume", color: "#fb923c", infoId: "waterfall.step.volume", aria: "What is the volume discount step?" },
  { key: "paymentPct", label: "Payment %", color: "#facc15", infoId: "waterfall.step.paymentPct", aria: "Why is there a payment % fee?" },
  { key: "paymentFixed", label: "Payment $", color: "#fde047", infoId: "waterfall.step.paymentFixed", aria: "Why is there a payment $ fee?" },
  { key: "fx", label: "FX", color: "#38bdf8", infoId: "waterfall.step.fx", aria: "What does the FX step represent?" },
  { key: "refunds", label: "Refunds", color: "#f87171", infoId: "waterfall.step.refunds", aria: "How are refunds handled?" },
  { key: "pocket", label: "Pocket", color: "#22c55e", infoId: "waterfall.step.pocket", aria: "What is pocket price?" },
] as const;

const WATERFALL_COLOR_MAP: Record<string, string> = WATERFALL_LEGEND.reduce((acc, entry) => {
  acc[entry.label] = entry.color;
  return acc;
}, {} as Record<string, string>);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function WaterfallSection({
  leak,
  setLeak,
  waterTier,
  setWaterTier,
  presetSel,
  setPresetSel,
  channelBlendApplied,
  setChannelBlendApplied,
  channelMix,
  setChannelMix,
  prices,
}: WaterfallSectionProps) {
  const listForWater =
    waterTier === "good"
      ? prices.good
      : waterTier === "better"
      ? prices.better
      : prices.best;

  const water = useMemo(() => computePocketPrice(listForWater, waterTier, leak), [listForWater, waterTier, leak]);

  return (
    <Section
      id="pocket-price-waterfall"
      title={
        <span className="inline-flex items-center gap-2">
          <span>Pocket Price Waterfall</span>
          <InfoTip className="ml-1" align="right" id="chart.waterfall" ariaLabel="How does the pocket price waterfall work?" />
        </span>
      }
      className="print:bg-white print:shadow-none print:h-auto"
      actions={<ActionCluster chart="waterfall" id="waterfall-main" csv />}
    >
      <div
        data-copy-slot="chart.waterfall"
        className="px-3 py-1.5 text-[11px] leading-snug rounded border border-dashed border-slate-300 bg-slate-50/70"
      >
        <div className="font-semibold text-slate-800 text-[11px]">How to use</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Pick a leak preset or blend channels; all tiers inherit it.</li>
          <li>Promo/volume are per-tier; payment/FX/refunds hit every tier.</li>
          <li>Use the main chart for precise pocket math; minis are quick spot checks.</li>
          <li>Channel blend mixes platform fee profiles (e.g., Stripe + App Store). Skip it if you sell through a single channel.</li>
        </ul>
      </div>

      <div className="space-y-4 text-xs">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Step 1 - Source</div>
                <div className="text-sm font-semibold text-slate-800">Leakage preset</div>
              </div>
              <InfoTip className="ml-1" align="right" id="presets.waterfall" ariaLabel="About leak presets" />
            </div>
            <select
              className="h-9 w-full border rounded px-2 bg-white"
              value={presetSel}
              onChange={(e) => {
                const v = e.target.value;
                setPresetSel(v);
                if (LEAK_PRESETS[v]) {
                  setLeak(LEAK_PRESETS[v]);
                  setChannelBlendApplied(false);
                }
              }}
            >
              <option value="" disabled>
                Choose preset...
              </option>
              {Object.keys(LEAK_PRESETS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Step 2 - Focus</div>
                <div className="text-sm font-semibold text-slate-800">Chart shows tier</div>
              </div>
              <div className="inline-flex overflow-hidden rounded border">
                {(["good", "better", "best"] as const).map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-1 capitalize ${waterTier === t ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => setWaterTier(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-gray-600 leading-snug">
              Promo/volume edits apply to the selected tier; payment/FX/refunds apply to every tier.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Step 3 - Tier discounts</div>
                <div className="text-sm font-semibold text-slate-800">Promo & volume (%)</div>
              </div>
              <InfoTip id="waterfall.step.promo" ariaLabel="What are tier discounts?" />
            </div>
            <div className="space-y-1">
              {(["good", "better", "best"] as const).map((t) => (
                <div key={t} className="grid grid-cols-[minmax(72px,1fr)_1fr_1fr] items-center gap-2">
                  <span className="capitalize text-slate-700">{t} tier</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={0.01}
                      className="h-9 w-full border rounded px-2 bg-white"
                      value={leak.promo[t]}
                      onChange={(e) => {
                        setLeak((L) => ({
                          ...L,
                          promo: {
                            ...L.promo,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }));
                        setChannelBlendApplied(false);
                      }}
                    />
                    <span className="text-[10px] text-slate-500">promo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={0.01}
                      className="h-9 w-full border rounded px-2 bg-white"
                      value={leak.volume[t]}
                      onChange={(e) => {
                        setLeak((L) => ({
                          ...L,
                          volume: {
                            ...L.volume,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }));
                        setChannelBlendApplied(false);
                      }}
                    />
                    <span className="text-[10px] text-slate-500">volume</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="w-full md:w-auto border rounded px-3 py-2 bg-white hover:bg-gray-50"
              onClick={() =>
                setLeak((L) => {
                  const t = waterTier;
                  return {
                    ...L,
                    promo: {
                      good: L.promo[t],
                      better: L.promo[t],
                      best: L.promo[t],
                    },
                    volume: {
                      good: L.volume[t],
                      better: L.volume[t],
                      best: L.volume[t],
                    },
                  };
                })
              }
              title="Copy the selected tier's promo/volume to the other tiers"
            >
              Copy this tier to others
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Step 4 - Global leakages</div>
              <div className="text-sm font-semibold text-slate-800">Fees applied to every tier</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                <span>Payment %</span>
                <input
                  type="number"
                  step={0.001}
                  className="h-9 w-full border rounded px-2 bg-white"
                  value={leak.paymentPct}
                  onChange={(e) => {
                    setLeak((L) => ({
                      ...L,
                      paymentPct: clamp01(Number(e.target.value)),
                    }));
                    setChannelBlendApplied(false);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                <span>Payment $</span>
                <input
                  type="number"
                  step={0.01}
                  className="h-9 w-full border rounded px-2 bg-white"
                  value={leak.paymentFixed}
                  onChange={(e) => {
                    setLeak((L) => ({
                      ...L,
                      paymentFixed: Math.max(0, Number(e.target.value)),
                    }));
                    setChannelBlendApplied(false);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                <span>FX %</span>
                <input
                  type="number"
                  step={0.001}
                  className="h-9 w-full border rounded px-2 bg-white"
                  value={leak.fxPct}
                  onChange={(e) => {
                    setLeak((L) => ({
                      ...L,
                      fxPct: clamp01(Number(e.target.value)),
                    }));
                    setChannelBlendApplied(false);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                <span>Refunds %</span>
                <input
                  type="number"
                  step={0.001}
                  className="h-9 w-full border rounded px-2 bg-white"
                  value={leak.refundsPct}
                  onChange={(e) => {
                    setLeak((L) => ({
                      ...L,
                      refundsPct: clamp01(Number(e.target.value)),
                    }));
                    setChannelBlendApplied(false);
                  }}
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Use these for processor fees, FX, and refunds; promo/volume stays per-tier above.
            </p>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-700">Pocket Price Waterfall</div>
              <div className="text-[11px] text-slate-600">Showing {waterTier} tier - list ${listForWater.toFixed(2)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
              {WATERFALL_LEGEND.map((entry) => (
                <span
                  key={entry.key}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1"
                  aria-label={`${entry.label} legend item`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                  <span className="font-semibold text-slate-800">{entry.label}</span>
                  <InfoTip id={entry.infoId} ariaLabel={entry.aria} align="left" className="text-slate-500" />
                </span>
              ))}
            </div>
          </div>
          <Suspense fallback={<div className="text-xs text-gray-500 p-2">Loading waterfall...</div>}>
            <ErrorBoundary title="Waterfall chart failed">
              <Waterfall
                chartId="waterfall-main"
                title="Pocket Price Waterfall"
                subtitle={`${waterTier} - list $${listForWater.toFixed(2)}`}
                listPrice={listForWater}
                steps={water.steps}
                colorMap={WATERFALL_COLOR_MAP}
              />
            </ErrorBoundary>
          </Suspense>

          <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-semibold">Compare all tiers</summary>
            <div className="text-[11px] text-slate-600">
              Small multiples let you sanity-check leakages across Good/Better/Best simultaneously. Use the main chart for precise values; minis are best for quick visual checks.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
              {(["good", "better", "best"] as const).map((t) => {
                const list = t === "good" ? prices.good : t === "better" ? prices.better : prices.best;
                const wf = computePocketPrice(list, t, leak);
                return (
                  <div key={t} className="min-w-0 h-56 overflow-hidden print:h-48">
                    <Suspense fallback={<div className="text-xs text-gray-500 p-2">Loading...</div>}>
                      <ErrorBoundary title="Waterfall mini chart failed">
                        <Waterfall title={t} subtitle={`list $${list.toFixed(2)}`} listPrice={list} steps={wf.steps} variant="mini" colorMap={WATERFALL_COLOR_MAP} />
                      </ErrorBoundary>
                    </Suspense>
                  </div>
                );
              })}
            </div>
          </details>

          <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-semibold">Channel blend (optional)</summary>
            <div className="text-[11px] text-slate-600 mb-1">
              Channel blend mixes multiple fee profiles (e.g., Stripe + App Store) into one leakage set. Use only if revenue runs across multiple channels.
            </div>
            {channelBlendApplied && (
              <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 mb-2">
                Blend applied to leakages
              </div>
            )}
            <div className="text-[11px] text-slate-600 mb-1">
              Each row weights a leak preset; normalize % then blend to see a composite fee/discount profile. JSON/short links keep blends; CSV exports do not.
            </div>
            <div className="mt-2 space-y-2">
              {channelMix.map((row, i) => (
                <div key={i} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-[11px] text-slate-600">Row {i + 1}</span>
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="border rounded px-2 h-8 w-20"
                      value={row.w}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, Number(e.target.value)));
                        setChannelMix((cur) => cur.map((r, j) => (j === i ? { ...r, w: v } : r)));
                      }}
                    />
                    <span>%</span>
                  </div>
                  <select
                    className="border rounded px-2 h-8 w-full"
                    value={row.preset}
                    onChange={(e) => setChannelMix((cur) => cur.map((r, j) => (j === i ? { ...r, preset: e.target.value } : r)))}
                  >
                    {Object.keys(LEAK_PRESETS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>

                  <button className="border rounded px-2 h-8 bg-white hover:bg-gray-50" onClick={() => setChannelMix((cur) => cur.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                  onClick={() => setChannelMix((cur) => [...cur, { preset: Object.keys(LEAK_PRESETS)[0], w: 0 }])}
                >
                  Add row
                </button>
                <div className="inline-flex flex-wrap items-center gap-2">
                  <button
                    className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                    onClick={() =>
                      setChannelMix((cur) => {
                        const sum = cur.reduce((s, r) => s + (isFinite(r.w) ? r.w : 0), 0) || 1;
                        return cur.map((r) => ({
                          ...r,
                          w: Math.round((r.w / sum) * 100),
                        }));
                      })
                    }
                  >
                    Normalize %
                  </button>
                  <button
                    className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                    onClick={() => {
                      const rows = channelMix.map((r) => ({ w: r.w, preset: r.preset }));
                      const blended = blendLeakPresets(rows);
                      setLeak(blended);
                      setChannelBlendApplied(true);
                    }}
                  >
                    Apply blend
                  </button>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-600 mt-2">
              Tip: Use 100% on one row if you only sell through a single channel; keep blends for multi-channel fee realism.
            </div>
          </details>
        </div>
      </div>
    </Section>
  );
}
