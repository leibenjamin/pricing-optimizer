import { useEffect, useMemo, useRef, useState } from "react";
import FrontierChartReal from "./components/FrontierChart";
import TakeRateChart from "./components/TakeRateChart";
import { defaultSim } from "./lib/simulate";
import { fitMNL } from "./lib/mnl";
import {
  now,
  formatPriceChange,
  formatCostChange,
  formatToggle,
} from "./lib/logger";
import {
  defaultSegments,
  normalizeWeights,
  type Segment,
} from "./lib/segments";
import { choiceShares } from "./lib/choice";
import { type Constraints, type SearchRanges } from "./lib/optimize";
import { runOptimizeInWorker } from "./lib/optWorker";

import { computePocketPrice, type Leakages, type Tier } from "./lib/waterfall";
import { Waterfall } from "./components/Waterfall";
import { LEAK_PRESETS } from "./lib/waterfallPresets";

import { gridOptimize } from "./lib/optQuick";
import Tornado from "./components/Tornado";
import { tornadoProfit } from "./lib/sensitivity";

import { simulateCohort } from "./lib/simCohort";
import MiniLine from "./components/MiniLine";

import { pocketCoverage } from "./lib/coverage";

import HeatmapMini from "./components/HeatmapMini";
import { feasibilitySliceGB } from "./lib/coverage";

import { PRESETS } from "./lib/presets";

import { explainGaps, topDriver } from "./lib/explain";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const approx = (n: number) => Math.round(n); // for prices
const fmtPct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl shadow p-4 border border-gray-200 bg-white ${className}`}
    >
      <h2 className="font-semibold text-lg mb-3">{title}</h2>
      {/* ensure consistent vertical rhythm inside all sections */}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function App() {
  const [journal, setJournal] = useState<string[]>([]);
  const pushJ = (msg: string) => setJournal((j) => [msg, ...j].slice(0, 200));
  // Draft value for Best while dragging, and the drag start (for the "from" price)

  const [prices, setPrices] = useState({ good: 9, better: 15, best: 25 });

  const [refPrices, setRefPrices] = useState({ good: 9, better: 15, best: 25 });
  // (optional) a quick helper to set refs from current sliders
  const setRefsFromCurrent = () =>
    setRefPrices({
      good: prices.good,
      better: prices.better,
      best: prices.best,
    });

  const [bestDraft, setBestDraft] = useState<number>(prices.best);
  const [bestDragStart, setBestDragStart] = useState<number | null>(null);
  const [features, setFeatures] = useState({
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  });
  const [costs, setCosts] = useState({ good: 3, better: 5, best: 8 });
  const [fitInfo, setFitInfo] = useState<{
    logLik: number;
    iters: number;
    converged: boolean;
  } | null>(null);

  const [channelMix, setChannelMix] = useState([
    { preset: "Stripe (cards)", w: 70 },
    { preset: "App Store (est.)", w: 30 },
  ]);

  // ---- recent IDs helpers ----
  type RecentItem = { id: string; t: number };
  const RECENT_KEY = "po_recent_ids_v1";
  const readRecents = (): RecentItem[] => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      return [];
    }
  };
  const writeRecents = (arr: RecentItem[]) => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 5)));
  };
  const rememberId = (id: string) => {
    const now = Date.now();
    const seen = readRecents().filter((r) => r.id !== id);
    writeRecents([{ id, t: now }, ...seen]);
  };

  // ADD: latent-class segments state
  const [segments, setSegments] = useState<Segment[]>(defaultSegments);

  // Estimate model once from synthetic data
  useEffect(() => {
    const rows = defaultSim();
    // Closer init + more iters + a tiny tolerance for better convergence:
    const fit = fitMNL(
      rows,
      [0.8, 1.2, 1.1, -0.07, 0.35, 0.25], // init near ground-truth
      { maxIters: 400, ridge: 2e-3, tol: 1e-7 }
    );
    setFitInfo({
      logLik: fit.logLik,
      iters: fit.iters,
      converged: fit.converged,
    });
  }, []);

  useEffect(() => {
    setBestDraft(prices.best);
  }, [prices.best]);

  useEffect(() => {
    const sid = new URLSearchParams(location.search).get("s");
    if (!sid) return;
    (async () => {
      try {
        const res = await fetch(`/api/get?s=${encodeURIComponent(sid)}`);
        if (!res.ok) {
          pushJ(`[${now()}] Load failed for id ${sid} (HTTP ${res.status})`);
          return;
        }
        const { scenario } = (await res.json()) as {
          scenario: {
            prices: typeof prices;
            costs: typeof costs;
            features: typeof features;
          };
        };
        setPrices(scenario.prices);
        setCosts(scenario.costs);
        setFeatures(scenario.features);
        rememberId(sid);
        pushJ(`[${now()}] Loaded scenario ${sid}`);
      } catch (e) {
        pushJ(`[${now()}] Load error for id ${sid}: ${(e as Error).message}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimizer inputs
  const [optRanges, setOptRanges] = useState<SearchRanges>({
    good: [5, 30],
    better: [10, 45],
    best: [15, 60],
    step: 1,
  });
  const [optConstraints, setOptConstraints] = useState<Constraints>({
    gapGB: 2,
    gapBB: 3,
    marginFloor: { good: 0.25, better: 0.25, best: 0.25 },
    charm: false,
    usePocketMargins: false,
    usePocketProfit: false,
  });

  // Result of last run
  const [optResult, setOptResult] = useState<{
    prices: { good: number; better: number; best: number };
    profit: number;
  } | null>(null);

  function runOptimizer() {
    // cancel any in-flight run
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsOptRunning(true);
    setOptError(null);
    const runId = ++runIdRef.current;

    const { promise, cancel } = runOptimizeInWorker({
      runId,
      ranges: optRanges,
      costs,
      feats: features,
      segs: segments,
      refPrices,
      N,
      C: optConstraints,
      leak,
    });
    cancelRef.current = cancel;

    promise
      .then((out) => {
        // ignore if a newer run started
        if (runIdRef.current !== runId) return;
        setOptResult({ prices: out.prices, profit: out.profit });
        pushJ(
          `[${now()}] Optimizer ✓ best ladder $${out.prices.good}/$${
            out.prices.better
          }/$${out.prices.best} (profit≈$${Math.round(out.profit)})`
        );
      })
      .catch((e) => {
        if (runIdRef.current !== runId) return;
        setOptError(e instanceof Error ? e.message : String(e));
        pushJ(
          `[${now()}] Optimizer error: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      })
      .finally(() => {
        if (runIdRef.current === runId) {
          setIsOptRunning(false);
          cancelRef.current = null;
        }
      });
  }

  function applyOptimizedPrices() {
    if (!optResult) return;
    setPrices({
      good: optResult.prices.good,
      better: optResult.prices.better,
      best: optResult.prices.best,
    });
  }

  const [isOptRunning, setIsOptRunning] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const cancelRef = useRef<null | (() => void)>(null);

  const [kpiFloorAdj, setKpiFloorAdj] = useState(0); // -10..+10 (pp)


  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  const [leak, setLeak] = useState<Leakages>({
    promo: { good: 0.05, better: 0.05, best: 0.05 }, // 5% promo
    volume: { good: 0.03, better: 0.03, best: 0.03 }, // 3% volume
    paymentPct: 0.029, // 2.9% processor
    paymentFixed: 0.1, // $0.10
    fxPct: 0.01, // 1%
    refundsPct: 0.02, // 2%
  });

  const [waterTier, setWaterTier] = useState<Tier>("good");

  const listForWater =
    waterTier === "good"
      ? prices.good
      : waterTier === "better"
      ? prices.better
      : prices.best;
  const water = useMemo(
    () => computePocketPrice(listForWater, waterTier, leak),
    [listForWater, waterTier, leak]
  );

  // which preset is currently selected in the dropdown (for UI only)
  const [presetSel, setPresetSel] = useState<string>("");

  function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }

  // Weighted blend of leakage presets (percent terms weighted linearly; fixed fee weighted avg)
  function blendLeaks(rows: { w: number; preset: string }[]): Leakages {
    // guard
    const safeRows = rows.filter((r) => LEAK_PRESETS[r.preset] && r.w > 0);
    if (safeRows.length === 0)
      return LEAK_PRESETS[Object.keys(LEAK_PRESETS)[0]];

    // start with a deep copy of the first preset
    const init = JSON.parse(
      JSON.stringify(LEAK_PRESETS[safeRows[0].preset])
    ) as Leakages;
    const acc = init;
    let total = safeRows[0].w;

    for (let i = 1; i < safeRows.length; i++) {
      const { w, preset } = safeRows[i];
      const L = LEAK_PRESETS[preset];
      total += w;
      (["promo", "volume"] as const).forEach((k) => {
        (["good", "better", "best"] as const).forEach((t) => {
          acc[k][t] = acc[k][t] * ((total - w) / total) + L[k][t] * (w / total);
        });
      });
      acc.paymentPct =
        acc.paymentPct * ((total - w) / total) + L.paymentPct * (w / total);
      acc.paymentFixed =
        acc.paymentFixed * ((total - w) / total) + L.paymentFixed * (w / total);
      acc.fxPct = acc.fxPct * ((total - w) / total) + L.fxPct * (w / total);
      acc.refundsPct =
        acc.refundsPct * ((total - w) / total) + L.refundsPct * (w / total);
    }
    return acc;
  }

  // Demand scale for demo math
  const N = 1000;

  const probs = useMemo(() => {
    const p = { good: prices.good, better: prices.better, best: bestDraft };
    return choiceShares(p, features, segments, refPrices);
  }, [prices.good, prices.better, bestDraft, features, segments, refPrices]);

  // Profit frontier: sweep Best price; keep Good/Better fixed (latent-class mix)
  const frontier = useMemo(() => {
    const points: { bestPrice: number; profit: number }[] = [];
    for (let p = 5; p <= 60; p += 1) {
      const pricesP = { good: prices.good, better: prices.better, best: p };
      const probsP = choiceShares(pricesP, features, segments, refPrices);
      const take_good = Math.round(N * probsP.good);
      const take_better = Math.round(N * probsP.better);
      const take_best = Math.round(N * probsP.best);
      const profitP =
        take_good * (prices.good - costs.good) +
        take_better * (prices.better - costs.better) +
        take_best * (p - costs.best);
      points.push({ bestPrice: p, profit: profitP });
    }
    if (points.length === 0)
      return {
        points,
        optimum: null as { bestPrice: number; profit: number } | null,
      };
    const optimum = points.reduce(
      (a, b) => (b.profit > a.profit ? b : a),
      points[0]
    );
    return { points, optimum };
  }, [
    N,
    prices.good,
    prices.better,
    costs.good,
    costs.better,
    costs.best,
    features,
    segments,
    refPrices,
  ]);

  const bestPriceOpt = frontier.optimum?.bestPrice ?? prices.best;
  const bestProfitOpt = frontier.optimum?.profit ?? 0;

  // Expected profit (current slider scenario)
  const take = {
    none: Math.round(N * probs.none),
    good: Math.round(N * probs.good),
    better: Math.round(N * probs.better),
    best: Math.round(N * probs.best),
  };
  const revenue =
    take.good * prices.good +
    take.better * prices.better +
    take.best * prices.best;
  const profit =
    take.good * (prices.good - costs.good) +
    take.better * (prices.better - costs.better) +
    take.best * (prices.best - costs.best);
  const activeCustomers = N - take.none;
  const arpu = activeCustomers > 0 ? revenue / activeCustomers : 0;
  const profitPerCustomer = profit / N;
  const grossMarginPct = revenue > 0 ? profit / revenue : 0;

  // ---- Tornado sensitivity data ----
  const [tornadoPocket, setTornadoPocket] = useState(true);
  const [tornadoPriceBump, setTornadoPriceBump] = useState(5); // $
  const [tornadoPctBump, setTornadoPctBump] = useState(2); // pp

  const scenarioForTornado = useMemo(
    () => ({
      N,
      prices,
      costs,
      features,
      segments,
      refPrices,
      leak,
    }),
    [N, prices, costs, features, segments, refPrices, leak]
  );

  const tornadoRows = useMemo(() => {
    return tornadoProfit(scenarioForTornado, {
      usePocket: tornadoPocket,
      priceBump: tornadoPriceBump,
      costBump: 2,
      pctSmall: tornadoPctBump / 100,
      payPct: tornadoPctBump / 200, // half as aggressive as generic pct
      payFixed: 0.05,
      refBump: 2,
      segTilt: 0.1,
    }).map((r) => ({
      name: r.name,
      base: r.base,
      deltaLow: r.deltaLow,
      deltaHigh: r.deltaHigh,
    }));
  }, [scenarioForTornado, tornadoPocket, tornadoPriceBump, tornadoPctBump]);

  // ---- Optimizer (quick grid) ----
  // A fast, in-component grid optimizer used for compare/tornado visuals.
  // Does NOT replace the Worker-based optimizer you already have.
  const quickOpt = useMemo(() => {
    const ranges = optRanges;
    // Coerce possibly-undefined flags to strict booleans
    const usePocketFloors = optConstraints.usePocketMargins ?? false;
    const usePocketProfit = optConstraints.usePocketProfit ?? false;

    const C = {
      gapGB: optConstraints.gapGB,
      gapBB: optConstraints.gapBB,
      marginFloor: optConstraints.marginFloor,
      usePocketForFloors: usePocketFloors,
    };

    return gridOptimize(
      N,
      ranges,
      costs,
      features,
      segments,
      refPrices,
      leak,
      C,
      /* usePocketForProfit: */ usePocketProfit
    );
  }, [N, optRanges, costs, features, segments, refPrices, leak, optConstraints]);

  // ---- Tornado data (current & optimized) ----
  const tornadoRowsCurrent = useMemo(() => tornadoProfit(
    { N, prices, costs, features, segments, refPrices, leak },
    { usePocket: tornadoPocket, priceBump: tornadoPriceBump, pctSmall: tornadoPctBump/100, payPct: tornadoPctBump/200 }
  ).map(r => ({ name: r.name, base: r.base, deltaLow: r.deltaLow, deltaHigh: r.deltaHigh })), 
  [N, prices, costs, features, segments, refPrices, leak, tornadoPocket, tornadoPriceBump, tornadoPctBump]);

  const tornadoRowsOptim = useMemo(() => {
    if (!quickOpt.best) return [];
    const p = quickOpt.best;
    return tornadoProfit(
      { N, prices: p, costs, features, segments, refPrices, leak },
      { usePocket: tornadoPocket, priceBump: tornadoPriceBump, pctSmall: tornadoPctBump/100, payPct: tornadoPctBump/200 }
    ).map(r => ({ name: r.name, base: r.base, deltaLow: r.deltaLow, deltaHigh: r.deltaHigh }));
  }, [quickOpt, N, costs, features, segments, refPrices, leak, tornadoPocket, tornadoPriceBump, tornadoPctBump]);

  // Cohort retention (percent, per-month). Default 92%.
  const [retentionPct, setRetentionPct] = useState<number>(() => {
    const saved = localStorage.getItem("cohort_retention_pct");
    const v = saved ? Number(saved) : 92;
    return Number.isFinite(v) ? Math.min(99.9, Math.max(70, v)) : 92;
  });
  useEffect(() => {
    localStorage.setItem("cohort_retention_pct", String(retentionPct));
  }, [retentionPct]);

  async function saveScenarioShortLink() {
    // what to persist
    const payload = { prices, costs, features };
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        pushJ(`[${now()}] Save failed: HTTP ${res.status}`);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      const shortUrl = `${location.origin}${location.pathname}?s=${id}`;
      history.replaceState(null, "", `?s=${id}`);
      rememberId(id);

      try {
        await navigator.clipboard.writeText(shortUrl);
      } catch {
        /* empty */
      }
      pushJ(`[${now()}] Saved as ${id} (link copied)`);
    } catch (e) {
      pushJ(`[${now()}] Save error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Good–Better–Best Pricing Optimizer
          </h1>
          <div className="text-sm text-gray-500">
            v0.3 • Latent-class choice model (3 segments)
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-4">
        {/* Left: Scenario Panel */}
        <div className="col-span-12 md:col-span-3 space-y-4 min-w-0">
          <Section title="Scenario Panel">
            <div className="space-y-4">
              {/* GOOD & BETTER: keep current immediate-commit + log-on-change behavior */}
              {(["good", "better"] as const).map((tier) => (
                <div key={tier} className="space-y-1">
                  <label className="block text-sm font-medium capitalize">
                    {tier} price (${prices[tier]})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={prices[tier]}
                    onChange={(e) =>
                      setPrices((p) => {
                        const to = Number(e.target.value);
                        const from = p[tier];
                        if (from !== to)
                          pushJ(formatPriceChange(tier, from, to));
                        return { ...p, [tier]: to };
                      })
                    }
                    className="w-full"
                  />
                </div>
              ))}

              {/* BEST: live-drag on draft, single journal entry on release */}
              <div className="space-y-1">
                <label className="block text-sm font-medium capitalize">
                  best price (${bestDraft})
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={bestDraft}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBestDraft(v); // live UI + charts (because scenario uses bestDraft)
                  }}
                  onPointerDown={() => {
                    setBestDragStart(prices.best); // remember where the drag started
                  }}
                  onPointerUp={() => {
                    // Commit once and log once
                    setPrices((p) => {
                      const from = bestDragStart ?? p.best;
                      const to = bestDraft;
                      if (from !== to)
                        pushJ(formatPriceChange("best", from, to));
                      return { ...p, best: to };
                    });
                    setBestDragStart(null);
                  }}
                  onBlur={() => {
                    // Keyboard/tab-out safety: also commit if focus leaves the slider
                    setPrices((p) => {
                      const from = bestDragStart ?? p.best;
                      const to = bestDraft;
                      if (from !== to)
                        pushJ(formatPriceChange("best", from, to));
                      return { ...p, best: to };
                    });
                    setBestDragStart(null);
                  }}
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(["good", "better", "best"] as const).map((tier) => (
                <div key={tier} className="text-xs">
                  <div className="font-semibold capitalize mb-1">
                    {tier} cost
                  </div>
                  <input
                    type="number"
                    value={costs[tier]}
                    onChange={(e) =>
                      setCosts((c) => {
                        const to = Number(e.target.value || 0);
                        const from = c[tier];
                        if (from !== to)
                          pushJ(formatCostChange(tier, from, to));
                        return { ...c, [tier]: to };
                      })
                    }
                    className="w-full border rounded px-2 py-1"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(["good", "better", "best"] as const).map((tier) => (
                <label
                  key={`A-${tier}`}
                  className="text-xs flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={!!features.featA[tier]}
                    onChange={() =>
                      setFeatures((f) => {
                        const on = !f.featA[tier];
                        pushJ(formatToggle("FeatA", tier, on));
                        return {
                          ...f,
                          featA: { ...f.featA, [tier]: on ? 1 : 0 },
                        };
                      })
                    }
                  />
                  FeatA {tier}
                </label>
              ))}
              {(["good", "better", "best"] as const).map((tier) => (
                <label
                  key={`B-${tier}`}
                  className="text-xs flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={!!features.featB[tier]}
                    onChange={() =>
                      setFeatures((f) => {
                        const on = !f.featB[tier];
                        pushJ(formatToggle("FeatB", tier, on));
                        return {
                          ...f,
                          featB: { ...f.featB, [tier]: on ? 1 : 0 },
                        };
                      })
                    }
                  />
                  FeatB {tier}
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="text-xs border px-2 py-1 rounded"
                onClick={saveScenarioShortLink}
                title="Create a short link (saved in Cloudflare KV)"
              >
                Save short link
              </button>

              <button
                className="text-xs border px-2 py-1 rounded"
                onClick={() => {
                  // optional: copy long URL (fully encoded state) as a fallback/share
                  const q = new URLSearchParams({
                    p: [prices.good, prices.better, prices.best].join(","),
                    c: [costs.good, costs.better, costs.best].join(","),
                    fa: [
                      features.featA.good,
                      features.featA.better,
                      features.featA.best,
                    ].join(","),
                    fb: [
                      features.featB.good,
                      features.featB.better,
                      features.featB.best,
                    ].join(","),
                  });
                  const longUrl = `${location.origin}${
                    location.pathname
                  }?${q.toString()}`;
                  navigator.clipboard.writeText(longUrl).catch(() => {});
                  pushJ(`[${now()}] Copied long URL state`);
                }}
              >
                Copy long URL
              </button>
            </div>
          </Section>

          <Section title="Reference prices">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2 items-center">
              <label className="text-sm">Good</label>
              <input
                type="number"
                className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                value={refPrices.good}
                onChange={(e) =>
                  setRefPrices((p) => ({ ...p, good: Number(e.target.value) }))
                }
              />
              <label className="text-sm">Better</label>
              <input
                type="number"
                className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                value={refPrices.better}
                onChange={(e) =>
                  setRefPrices((p) => ({
                    ...p,
                    better: Number(e.target.value),
                  }))
                }
              />
              <label className="text-sm">Best</label>
              <input
                type="number"
                className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                value={refPrices.best}
                onChange={(e) =>
                  setRefPrices((p) => ({ ...p, best: Number(e.target.value) }))
                }
              />
            </div>

            <div className="mt-3">
              <button
                className="border rounded-md px-3 py-1.5 text-xs bg-white hover:bg-gray-50"
                onClick={setRefsFromCurrent}
              >
                Set from current prices
              </button>
            </div>
          </Section>

          <Section title="Methods">
            <p className="text-sm text-gray-700">
              MNL: U = β₀(j) + βₚ·price + β_A·featA + β_B·featB; outside option
              intercept fixed at 0. Estimated by MLE on ~15k synthetic obs with
              ridge regularization.
            </p>
            {fitInfo && (
              <div className="text-xs text-gray-600 mt-2">
                logLik: {Math.round(fitInfo.logLik)} • iters: {fitInfo.iters} •{" "}
                {fitInfo.converged ? "converged" : "not converged"}
              </div>
            )}
          </Section>
        </div>

        {/* Center: Charts */}
        <div className="col-span-12 md:col-span-6 space-y-4 min-w-0">
          <Section title="Profit Frontier" className="overflow-hidden">
            <div
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "420px",
              }}
            >
              <FrontierChartReal
                points={frontier.points}
                optimum={frontier.optimum}
              />
            </div>
          </Section>

          <Section title="Take-Rate Bars" className="overflow-hidden">
            <div
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "320px",
              }}
            >
              <TakeRateChart data={probs} />
            </div>
          </Section>

          <Section title="Cohort rehearsal (12 months)">
            {(() => {
              const probsNow = choiceShares(prices, features, segments, refPrices);
              const pts = simulateCohort(
                prices,
                probsNow,
                leak,
                costs,
                12,
                retentionPct / 100 // <- slider drives retention
              );

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <label className="font-medium">Monthly retention</label>
                      <input
                        type="range"
                        min={70}
                        max={99.9}
                        step={0.1}
                        value={retentionPct}
                        onChange={(e) => setRetentionPct(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        step={0.1}
                        min={70}
                        max={99.9}
                        value={retentionPct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          setRetentionPct(Math.min(99.9, Math.max(70, v)));
                        }}
                        className="w-16 h-7 border rounded px-2"
                      />
                      <span>%</span>
                      <span className="text-gray-500 ml-2">
                        (churn ≈ {(100 - retentionPct).toFixed(1)}%/mo)
                      </span>
                    </div>

                    <button
                      className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50"
                      onClick={() => {
                        const header = "month,margin\n";
                        const rows = pts
                          .map((p) => `${p.month},${p.margin.toFixed(4)}`)
                          .join("\n");
                        const blob = new Blob([header + rows], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `cohort_margin_12m_ret${retentionPct}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="mt-2">
                    <MiniLine
                      title={`Pocket margin by cohort month (retention ${retentionPct.toFixed(
                        1
                      )}%)`}
                      x={pts.map((p) => p.month)}
                      y={pts.map((p) => p.margin)}
                    />
                  </div>
                </>
              );
            })()}
          </Section>


          <Section title="Tornado — what moves profit?">
            <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tornadoPocket}
                  onChange={(e) => setTornadoPocket(e.target.checked)}
                />
                Compute using <span className="font-medium">pocket</span> margin
              </label>
              <label className="flex items-center gap-1">
                Price bump $
                <input
                  type="number"
                  className="border rounded px-2 h-7 w-16"
                  value={tornadoPriceBump}
                  onChange={(e) =>
                    setTornadoPriceBump(Number(e.target.value) || 0)
                  }
                />
              </label>
              <label className="flex items-center gap-1">
                % bump (FX/Refunds/Payment)
                <input
                  type="number"
                  step="0.5"
                  className="border rounded px-2 h-7 w-16"
                  value={tornadoPctBump}
                  onChange={(e) =>
                    setTornadoPctBump(Number(e.target.value) || 0)
                  }
                />
                <span>pp</span>
              </label>
            </div>

            <div
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "360px",
              }}
            >
              <Tornado rows={tornadoRows} />
            </div>

            <p className="text-[11px] text-gray-600 mt-1">
              One-way sensitivity on current scenario. Bars show change in
              profit when each driver is nudged down (left) or up (right).
              Toggle pocket to account for promos/fees/FX/refunds; adjust bump
              sizes to test robustness.
            </p>
          </Section>

          <Section title="Current vs Optimized">
            {(() => {
              const curProfit = optConstraints.usePocketProfit
                ? // pocket profit using current prices
                  (() => {
                    const probs = choiceShares(
                      prices,
                      features,
                      segments,
                      refPrices
                    );
                    const take = {
                      good: Math.round(N * probs.good),
                      better: Math.round(N * probs.better),
                      best: Math.round(N * probs.best),
                    };
                    const pG = computePocketPrice(
                      prices.good,
                      "good",
                      leak
                    ).pocket;
                    const pB = computePocketPrice(
                      prices.better,
                      "better",
                      leak
                    ).pocket;
                    const pH = computePocketPrice(
                      prices.best,
                      "best",
                      leak
                    ).pocket;
                    return (
                      take.good * (pG - costs.good) +
                      take.better * (pB - costs.better) +
                      take.best * (pH - costs.best)
                    );
                  })()
                : // list profit
                  (() => {
                    const probs = choiceShares(
                      prices,
                      features,
                      segments,
                      refPrices
                    );
                    const take = {
                      good: Math.round(N * probs.good),
                      better: Math.round(N * probs.better),
                      best: Math.round(N * probs.best),
                    };
                    return (
                      take.good * (prices.good - costs.good) +
                      take.better * (prices.better - costs.better) +
                      take.best * (prices.best - costs.best)
                    );
                  })();

              const best = quickOpt.best;
              const bestProfit = quickOpt.profit;

              if (!best)
                return (
                  <div className="text-xs text-gray-600">
                    No feasible ladder in the current ranges & floors.
                  </div>
                );

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded border p-3">
                    <div className="font-semibold mb-1">Current</div>
                    <div>Good: ${prices.good}</div>
                    <div>Better: ${prices.better}</div>
                    <div>Best: ${prices.best}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      Profit: ${Math.round(curProfit).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="font-semibold mb-1">Optimized</div>
                    <div>Good: ${best.good}</div>
                    <div>Better: ${best.better}</div>
                    <div>Best: ${best.best}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      Profit: ${Math.round(bestProfit).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border p-3 flex flex-col gap-2">
                    <div className="font-semibold">Delta</div>
                    <div>
                      Δ Profit:{" "}
                      <span className="font-medium">
                        ${Math.round(bestProfit - curProfit).toLocaleString()}
                      </span>
                    </div>
                    <button
                      className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setPrices(best); // apply ladder
                        pushJ(`Applied optimized ladder: ${best.good}/${best.better}/${best.best}`);
                      }}
                    >
                      Apply optimized ladder
                    </button>
                  </div>
                  <div className="mt-3 text-xs">
                    <div className="font-medium mb-1">Why this recommendation?</div>
                    <ul className="list-disc ml-5 space-y-1">
                      {(() => {
                        const binds = explainGaps(best, { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB });
                        return binds.length ? binds.map((b, i) => <li key={i}>{b}</li>) : <li>No gap constraints binding.</li>;
                      })()}
                      {(() => {
                        const td = topDriver(tornadoRowsOptim);
                        return <li>Largest profit driver near optimum: {td ?? "n/a"}</li>;
                      })()}
                      <li>
                        Floors: pocket margin ≥ {Math.round(optConstraints.marginFloor.good*100)}% / {Math.round(optConstraints.marginFloor.better*100)}% / {Math.round(optConstraints.marginFloor.best*100)}% (G/B/Best).
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </Section>

          <Section title="Sensitivity shift: Current vs Optimized">
            {quickOpt.best ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium mb-1">Current ladder</div>
                  <Tornado rows={tornadoRowsCurrent} />
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Optimized ladder</div>
                  <Tornado rows={tornadoRowsOptim} />
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">No feasible ladder to compare.</div>
            )}
          </Section>

          <Section title="Pocket Price Waterfall">
            <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="w-28 text-xs text-gray-700">
                    Choose preset
                  </label>
                  <select
                    className="border rounded px-2 h-9 w-full md:w-64 bg-white"
                    value={presetSel}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPresetSel(v);
                      if (LEAK_PRESETS[v]) setLeak(LEAK_PRESETS[v]);
                    }}
                  >
                    <option value="" disabled>
                      Choose preset…
                    </option>
                    {Object.keys(LEAK_PRESETS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chart scope + quick help */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Chart shows tier:</span>
                  <div className="inline-flex overflow-hidden rounded border">
                    {(["good", "better", "best"] as const).map((t) => (
                      <button
                        key={t}
                        className={`px-2 py-1 capitalize ${
                          waterTier === t
                            ? "bg-gray-900 text-white"
                            : "bg-white"
                        }`}
                        onClick={() => setWaterTier(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">
                  Tier discounts are per-tier (affect the selected tier’s
                  chart). Global leakages (payment, FX, refunds) apply to all
                  tiers.
                </p>

                <div className="font-semibold mt-2">Tier discounts (%)</div>
                {(["good", "better", "best"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-20 capitalize">{t} promo</span>
                    <input
                      type="number"
                      step={0.01}
                      className="border rounded px-1 py-0.5 w-20"
                      value={leak.promo[t]}
                      onChange={(e) =>
                        setLeak((L) => ({
                          ...L,
                          promo: {
                            ...L.promo,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }))
                      }
                    />
                    <span className="w-20">volume</span>
                    <input
                      type="number"
                      step={0.01}
                      className="border rounded px-1 py-0.5 w-20"
                      value={leak.volume[t]}
                      onChange={(e) =>
                        setLeak((L) => ({
                          ...L,
                          volume: {
                            ...L.volume,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }))
                      }
                    />
                  </div>
                ))}

                {/* Copy helper */}
                <div className="flex gap-2">
                  <button
                    className="border rounded px-2 py-1"
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
                    title="Copy the selected tier’s promo/volume to the other tiers"
                  >
                    Copy this tier → others
                  </button>
                </div>

                {/* Global leakages */}
                <div className="font-semibold mt-2">Global leakages</div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Payment %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.paymentPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        paymentPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Payment $</span>
                  <input
                    type="number"
                    step={0.01}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.paymentFixed}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        paymentFixed: Math.max(0, Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">FX %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.fxPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        fxPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Refunds %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.refundsPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        refundsPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
              </div>

              {/* Chart */}
              <div className="min-w-0">
                <Waterfall
                  title="Pocket Price Waterfall"
                  subtitle={`${waterTier} • list $${listForWater.toFixed(2)}`}
                  listPrice={listForWater}
                  steps={water.steps}
                />
              </div>

              {/* ---- Compare all tiers (small multiples) ---- */}
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-xs font-medium">
                  Compare all tiers
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                  {(["good", "better", "best"] as const).map((t) => {
                    const list =
                      t === "good"
                        ? prices.good
                        : t === "better"
                        ? prices.better
                        : prices.best;
                    const wf = computePocketPrice(list, t, leak);
                    return (
                      <div key={t} className="min-w-0 h-56 overflow-hidden">
                        {" "}
                        {/* added overflow-hidden */}
                        <Waterfall
                          title={t}
                          subtitle={`list $${list.toFixed(2)}`}
                          listPrice={list}
                          steps={wf.steps}
                          variant="mini"
                        />
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* ---- Channel blend (optional) ---- */}
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-xs font-medium">
                  Channel blend (optional)
                </summary>
                <div className="mt-2 text-xs space-y-2">
                  {channelMix.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="w-16">Row {i + 1}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="border rounded px-2 h-8 w-20"
                        value={row.w}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            Math.min(100, Number(e.target.value))
                          );
                          setChannelMix((cur) =>
                            cur.map((r, j) => (j === i ? { ...r, w: v } : r))
                          );
                        }}
                      />
                      <span>%</span>
                      <select
                        className="border rounded px-2 h-8"
                        value={row.preset}
                        onChange={(e) =>
                          setChannelMix((cur) =>
                            cur.map((r, j) =>
                              j === i ? { ...r, preset: e.target.value } : r
                            )
                          )
                        }
                      >
                        {Object.keys(LEAK_PRESETS).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>

                      {/* remove row */}
                      <button
                        className="ml-2 border rounded px-2 h-8 bg-white hover:bg-gray-50"
                        onClick={() =>
                          setChannelMix((cur) => cur.filter((_, j) => j !== i))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* add row */}
                  <button
                    className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                    onClick={() =>
                      setChannelMix((cur) => [
                        ...cur,
                        { preset: Object.keys(LEAK_PRESETS)[0], w: 0 },
                      ])
                    }
                  >
                    Add row
                  </button>

                  {/* normalize & apply */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                      onClick={() =>
                        setChannelMix((cur) => {
                          const sum =
                            cur.reduce(
                              (s, r) => s + (isFinite(r.w) ? r.w : 0),
                              0
                            ) || 1;
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
                      className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                      onClick={() => {
                        const rows = channelMix.map((r) => ({
                          w: r.w,
                          preset: r.preset,
                        }));
                        const blended = blendLeaks(rows);
                        setLeak(blended); // apply to all tiers
                      }}
                    >
                      Blend now → apply to leakages
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </Section>
        </div>

        {/* Right: Journal */}
        <div className="col-span-12 md:col-span-3 space-y-4 min-w-0 md:sticky md:top-4 self-start">
          <Section title="Preset scenarios">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                className="border rounded px-2 h-8"
                onChange={(e) => {
                  const p = PRESETS.find(x => x.id === e.target.value);
                  if (!p) return;
                  setPrices(p.prices);
                  setCosts(p.costs);
                  setRefPrices(p.refPrices);
                  setLeak(p.leak);
                  pushJ?.(`Loaded preset: ${p.name}`);
                }}
                defaultValue=""
              >
                <option value="" disabled>Choose a preset…</option>
                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                className="border rounded px-2 h-8 bg-white hover:bg-gray-50"
                onClick={() => {
                  // quick reset back to your repo defaults (adjust if your defaults changed)
                  setPrices({ good: 10, better: 20, best: 40 });
                  setCosts({ good: 3, better: 5, best: 8 });
                  setRefPrices({ good: 12, better: 24, best: 45 });
                  setLeak({
                    promo: { good: 0.05, better: 0.05, best: 0.05 },
                    volume: { good: 0.00, better: 0.00, best: 0.00 },
                    paymentPct: 0.029,
                    paymentFixed: 0.30,
                    fxPct: 0.00,
                    refundsPct: 0.02,
                  });
                  pushJ?.("Reset to defaults");
                }}
              >
                Reset
              </button>
            </div>
            <p className="text-[11px] text-gray-600 mt-1">
              Applies prices, costs, reference prices, and leakage profile in one click.
            </p>
          </Section>


          <Section title="Scenario Journal">
            <ul className="text-xs text-gray-700 space-y-1 max-h-64 overflow-auto pr-1 wrap-break-word min-w-0">
              {journal.length === 0 ? (
                <li className="text-gray-400">
                  Adjust sliders/toggles to log changes…
                </li>
              ) : (
                journal.map((line, i) => <li key={i}>{line}</li>)
              )}
              <li>
                Revenue (N=1000): <strong>{fmtUSD(revenue)}</strong>
              </li>
              <li>
                Profit (N=1000): <strong>{fmtUSD(profit)}</strong>
              </li>
              <li>
                Active customers:{" "}
                <strong>{activeCustomers.toLocaleString()}</strong>
              </li>
              <li>
                ARPU (active only): <strong>{fmtUSD(arpu)}</strong>
              </li>
              <li>
                Profit / customer (all N):{" "}
                <strong>{fmtUSD(profitPerCustomer)}</strong>
              </li>
              <li>
                Gross margin: <strong>{fmtPct(grossMarginPct)}</strong>
              </li>
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                className="text-xs border px-2 py-1 rounded"
                onClick={() => setJournal([])}
              >
                Clear
              </button>
              <button
                className="text-xs border px-2 py-1 rounded"
                onClick={() => {
                  const blob = new Blob(
                    [journal.slice().reverse().join("\n")],
                    { type: "text/plain" }
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "scenario-journal.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download .txt
              </button>
            </div>
          </Section>

          <Section title="Callouts">
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <strong>So what?</strong> Conversion ≈{" "}
                {Math.round((probs.good + probs.better + probs.best) * 100)}%.
              </div>
              <div className="text-xs text-gray-600">
                Best-price optimum ≈ <strong>${approx(bestPriceOpt)}</strong>{" "}
                (profit ≈ <strong>{fmtUSD(bestProfitOpt)}</strong>). Segments:
                Price-sens / Value / Premium.
              </div>
              {optResult && (
                <div className="mt-1 inline-block text-[11px] px-2 py-1 rounded bg-gray-100 border">
                  Opt best: ${optResult.prices.good}/{optResult.prices.better}/
                  {optResult.prices.best} • π≈${Math.round(optResult.profit)}
                </div>
              )}
              <div className="text-xs text-gray-500">
                Frontier shows profit vs Best price with current Good/Better
                fixed.
              </div>
              <div className="text-xs text-gray-700">
                Pocket price ({waterTier}) ≈ ${water.pocket.toFixed(2)} from
                list ${listForWater.toFixed(2)}
              </div>

              <div className="text-xs text-gray-600">
                Anchoring on refs{" "}
                {`$${refPrices.good}/$${refPrices.better}/$${refPrices.best}`};
                loss aversion on increases.
              </div>
            </div>
          </Section>

          <Section title="Global Optimizer">
            {/* Compact header: inline ranges + actions */}
            <div className="flex flex-col gap-3">
              {/* Header row wraps nicely on small screens */}
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <span className="font-semibold mr-2 basis-full sm:basis-auto">
                  Ranges ($)
                </span>

                {/* Good */}
                <label className="flex items-center gap-1">
                  <span className="w-12">Good</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Good min"
                    value={optRanges.good[0]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        good: [Number(e.target.value), r.good[1]] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                  <span>–</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Good max"
                    value={optRanges.good[1]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        good: [r.good[0], Number(e.target.value)] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                </label>

                {/* Better */}
                <label className="flex items-center gap-1">
                  <span className="w-12">Better</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Better min"
                    value={optRanges.better[0]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        better: [Number(e.target.value), r.better[1]] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                  <span>–</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Better max"
                    value={optRanges.better[1]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        better: [r.better[0], Number(e.target.value)] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                </label>

                {/* Best */}
                <label className="flex items-center gap-1">
                  <span className="w-12">Best</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Best min"
                    value={optRanges.best[0]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        best: [Number(e.target.value), r.best[1]] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                  <span>–</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Best max"
                    value={optRanges.best[1]}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        best: [r.best[0], Number(e.target.value)] as [
                          number,
                          number
                        ],
                      }))
                    }
                  />
                </label>

                {/* Step */}
                <label className="flex items-center gap-1">
                  <span className="w-8">Step</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-8 w-16"
                    aria-label="Step"
                    value={optRanges.step}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        step: Math.max(0.25, Number(e.target.value)),
                      }))
                    }
                  />
                </label>

                {/* Actions */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50"
                    onClick={runOptimizer}
                    disabled={isOptRunning}
                  >
                    {isOptRunning ? "Running…" : "Run"}
                  </button>
                  <button
                    className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50 disabled:opacity-50"
                    onClick={applyOptimizedPrices}
                    disabled={!optResult || isOptRunning}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Result line (one-liner) */}
              <div className="text-xs text-gray-700">
                {optError && (
                  <span className="text-red-600 mr-2">Error: {optError}</span>
                )}
                {optResult ? (
                  <span>
                    Best ladder $${optResult.prices.good}/$$
                    {optResult.prices.better}/$${optResult.prices.best} • Profit
                    ≈ ${Math.round(optResult.profit)}
                  </span>
                ) : (
                  <span className="text-gray-500">No result yet</span>
                )}
              </div>

              {/* Advanced constraints (collapsible) */}
              <details className="rounded border border-gray-200 p-3 bg-gray-50/60">
                <summary className="cursor-pointer select-none text-xs font-medium">
                  Advanced constraints
                </summary>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <span className="w-28">Gap G→B</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-8 w-20"
                      value={optConstraints.gapGB}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          gapGB: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-28">Gap B→Best</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-8 w-20"
                      value={optConstraints.gapBB}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          gapBB: Number(e.target.value),
                        }))
                      }
                    />
                  </label>

                  {(["good", "better", "best"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2">
                      <span className="w-28 capitalize">{t} margin ≥</span>
                      <input
                        type="number"
                        step={0.01}
                        className="border rounded px-2 h-8 w-20"
                        value={optConstraints.marginFloor[t]}
                        onChange={(e) =>
                          setOptConstraints((c) => ({
                            ...c,
                            marginFloor: {
                              ...c.marginFloor,
                              [t]: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                  ))}

                  <label className="flex items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={optConstraints.charm}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          charm: e.target.checked,
                        }))
                      }
                    />
                    <span>Charm endings (.99)</span>
                  </label>

                  <label className="flex items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={optConstraints.usePocketMargins}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          usePocketMargins: e.target.checked,
                        }))
                      }
                    />
                    <span>
                      Use <em>pocket</em> price for margin floors
                    </span>
                  </label>

                  <p className="text-[11px] text-gray-500 sm:col-span-2">
                    When enabled, margins are checked on pocket (after
                    promo/payment/FX/refunds) instead of list.
                  </p>

                  <label className="flex items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={optConstraints.usePocketProfit}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          usePocketProfit: e.target.checked,
                        }))
                      }
                    />
                    <span>Compute profit using pocket price</span>
                  </label>
                </div>
              </details>
            </div>
          </Section>

          <Section title="KPI — Pocket floor coverage">
            {/* Sensitivity control */}
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className="text-gray-600">Floor sensitivity:</span>
              <input
                type="range"
                min={-10}
                max={10}
                value={kpiFloorAdj}
                onChange={(e) => setKpiFloorAdj(Number(e.target.value))}
              />
              <span className="w-10 text-right">{kpiFloorAdj} pp</span>
            </div>

            {(() => {
              // Baseline floors (no adjustment)
              const floors0 = optConstraints.marginFloor;

              // Adjusted floors (slider)
              const adj = (x: number) => Math.max(0, Math.min(0.95, x + kpiFloorAdj / 100));
              const floors1 = {
                good: adj(floors0.good),
                better: adj(floors0.better),
                best: adj(floors0.best),
              };

              // Compute coverage
              const base = pocketCoverage(
                optRanges,
                costs,
                floors0,
                { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
                leak
              );
              const moved = pocketCoverage(
                optRanges,
                costs,
                floors1,
                { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
                leak
              );

              const pct0 = Math.round(base.coverage * 100);
              const pct1 = Math.round(moved.coverage * 100);
              const delta = pct1 - pct0;

              const tone =
                pct1 >= 70
                  ? "text-green-700 bg-green-50 border-green-200"
                  : pct1 >= 40
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-red-700 bg-red-50 border-red-200";

              return (
                <>
                  {/* KPI number + explain line + apply button */}
                  <div className={`rounded border px-4 py-3 inline-flex items-center gap-4 ${tone}`}>
                    <div>
                      <div className="text-2xl font-semibold leading-tight">{pct1}%</div>
                      <div className="text-xs">feasible ladders (pocket floors)</div>
                      <div className="text-[11px] text-gray-600 mt-1">
                        baseline {pct0}% → {pct1}% {delta >= 0 ? `(+${delta}pp)` : `(${delta}pp)`} •{" "}
                        {moved.tested.toLocaleString()} combos • step ${optRanges.step}
                      </div>
                    </div>
                    <button
                      className="text-xs border rounded px-3 py-1 bg-white hover:bg-gray-50"
                      onClick={() => {
                        // Write adjusted floors back to constraints
                        setOptConstraints((prev) => ({
                          ...prev,
                          marginFloor: { ...floors1 },
                        }));
                        // Optional: log to journal if you use pushJ
                        if (typeof pushJ === "function") {
                          pushJ(
                            `Applied floors: good ${(floors1.good*100).toFixed(0)}% • better ${(floors1.better*100).toFixed(0)}% • best ${(floors1.best*100).toFixed(0)}%`
                          );
                        }
                      }}
                    >
                      Apply adjusted floors
                    </button>
                  </div>

                  {/* Mini heatmap (Good × Better slice) */}
                  <div className="mt-3">
                    {(() => {
                      const { cells, gTicks, bTicks, bestUsed } = feasibilitySliceGB(
                        optRanges,
                        costs,
                        floors1,
                        { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
                        leak
                      );
                      return (
                        <>
                          <div className="text-[11px] text-gray-600 mb-1">
                            Slice with Best fixed near lower feasible bound (≈ ${bestUsed}).
                          </div>
                          <HeatmapMini cells={cells} gTicks={gTicks} bTicks={bTicks} />
                        </>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
          </Section>



          <Section title="Segments (mix)">
            <details open className="text-xs">
              <summary className="cursor-pointer select-none font-medium mb-2">
                Adjust segment weights
              </summary>
              <div className="space-y-2 text-xs">
                {segments.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-28">{s.name}</div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={s.weight}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        const next = segments.map((t, j) =>
                          j === i ? { ...t, weight: w } : t
                        );
                        setSegments(normalizeWeights(next));
                      }}
                      className="flex-1"
                      aria-label={`${s.name} weight`}
                    />
                    <div className="w-10 text-right">
                      {Math.round(s.weight * 100)}%
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => setSegments(normalizeWeights(segments))}
                  >
                    Normalize
                  </button>
                </div>
              </div>
            </details>
          </Section>

          <Section title="Recent short links">
            <details className="text-xs">
              <summary className="cursor-pointer select-none font-medium mb-2">
                Show recents
              </summary>

              <ul className="text-xs space-y-1">
                {readRecents().length === 0 ? (
                  <li className="text-gray-500">None yet</li>
                ) : (
                  readRecents().map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <button
                        className="underline"
                        title={new Date(r.t).toLocaleString()}
                        onClick={() => {
                          const url = `${location.origin}${location.pathname}?s=${r.id}`;
                          location.assign(url); // reload page with this id
                        }}
                      >
                        {r.id}
                      </button>
                      <button
                        className="border rounded px-2 py-0.5"
                        onClick={() => {
                          const url = `${location.origin}${location.pathname}?s=${r.id}`;
                          navigator.clipboard.writeText(url).catch(() => {});
                          pushJ(`[${now()}] Copied short link ${r.id}`);
                        }}
                      >
                        Copy
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-2">
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={() => {
                    localStorage.removeItem(RECENT_KEY);
                    pushJ(`[${now()}] Cleared recent short links`);
                    location.reload();
                  }}
                >
                  Clear recents
                </button>
              </div>
            </details>
          </Section>
        </div>
      </main>
    </div>
  );
}
