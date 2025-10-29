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

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const approx = (n: number) => Math.round(n); // for prices
const fmtPct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl shadow p-4 border border-gray-200 bg-white">
      <h2 className="font-semibold text-lg mb-3">{title}</h2>
      {children}
    </div>
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

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

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
        <div className="col-span-12 md:col-span-3 space-y-4">
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
                    min={1}
                    max={99}
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
                  min={1}
                  max={99}
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
        <div className="col-span-12 md:col-span-6 space-y-4">
          <Section title="Profit Frontier">
            <FrontierChartReal
              points={frontier.points}
              optimum={frontier.optimum}
            />
          </Section>
          <Section title="Take-Rate Bars">
            <TakeRateChart data={probs} />
          </Section>
        </div>

        {/* Right: Journal */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          <Section title="Scenario Journal">
            <ul className="text-xs text-gray-700 space-y-1 max-h-64 overflow-auto pr-1">
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
              <div className="text-xs text-gray-500">
                Frontier shows profit vs Best price with current Good/Better
                fixed.
              </div>
              <div className="text-xs text-gray-600">
                Anchoring on refs{" "}
                {`$${refPrices.good}/$${refPrices.better}/$${refPrices.best}`};
                loss aversion on increases.
              </div>
            </div>
          </Section>

          <Section title="Global Optimizer">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Constraints */}
              <div className="space-y-2">
                <div className="font-semibold">Constraints</div>
                <label className="flex items-center gap-2">
                  <span className="w-28">Gap G→B</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-9 w-24"
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
                    className="border rounded px-2 h-9 w-24"
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
                      className="border rounded px-2 h-9 w-24"
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
                <label className="flex items-center gap-2 pt-1">
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
              </div>

              {/* Ranges */}
              <div className="space-y-2">
                <div className="font-semibold">Ranges ($)</div>
                {(["good", "better", "best"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-14 capitalize">{t}</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-9 w-20"
                      value={optRanges[t][0]}
                      onChange={(e) =>
                        setOptRanges((r) => ({
                          ...r,
                          [t]: [Number(e.target.value), r[t][1]] as [
                            number,
                            number
                          ],
                        }))
                      }
                    />
                    <span>–</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-9 w-20"
                      value={optRanges[t][1]}
                      onChange={(e) =>
                        setOptRanges((r) => ({
                          ...r,
                          [t]: [r[t][0], Number(e.target.value)] as [
                            number,
                            number
                          ],
                        }))
                      }
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="w-14">Step</span>
                  <input
                    type="number"
                    className="border rounded px-2 h-9 w-20"
                    value={optRanges.step}
                    onChange={(e) =>
                      setOptRanges((r) => ({
                        ...r,
                        step: Math.max(0.25, Number(e.target.value)),
                      }))
                    }
                  />
                </div>
              </div>

              {/* Actions / Result */}
              <div className="space-y-2">
                <div className="font-semibold">Actions</div>
                <div className="flex gap-2">
                  <button
                    className="border rounded px-3 h-9 bg-white hover:bg-gray-50"
                    onClick={runOptimizer}
                    disabled={isOptRunning}
                  >
                    {isOptRunning ? "Running…" : "Run"}
                  </button>
                  <button
                    className="border rounded px-3 h-9 bg-white hover:bg-gray-50 disabled:opacity-50"
                    onClick={applyOptimizedPrices}
                    disabled={!optResult || isOptRunning}
                  >
                    Apply
                  </button>
                </div>
                <div className="text-xs text-gray-700">
                  {optError && (
                    <div className="text-red-600 mb-1">Error: {optError}</div>
                  )}
                  {optResult ? (
                    <>
                      <div>
                        Best: ${optResult.prices.good} / $
                        {optResult.prices.better} / ${optResult.prices.best}
                      </div>
                      <div>Profit ≈ ${Math.round(optResult.profit)}</div>
                    </>
                  ) : (
                    <div className="text-gray-500">No result yet</div>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Segments (mix)">
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
          </Section>

          <Section title="Recent short links">
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
          </Section>
        </div>
      </main>
    </div>
  );
}
