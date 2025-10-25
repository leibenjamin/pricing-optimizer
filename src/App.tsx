import { useEffect, useMemo, useState } from "react"
import FrontierChartReal from "./components/FrontierChart"
import TakeRateChart from "./components/TakeRateChart"
import { defaultSim } from "./lib/simulate"
import { fitMNL, predictProbs, type Scenario } from "./lib/mnl"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl shadow p-4 border border-gray-200 bg-white">
      <h2 className="font-semibold text-lg mb-3">{title}</h2>
      {children}
    </div>
  )
}

export default function App() {
  const [prices, setPrices] = useState({ good: 9, better: 15, best: 25 })
  const [features, setFeatures] = useState({
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  })
  const [costs, setCosts] = useState({ good: 3, better: 5, best: 8 })
  const [beta, setBeta] = useState<[number, number, number, number, number, number] | null>(null)
  const [fitInfo, setFitInfo] = useState<{ logLik: number; iters: number; converged: boolean } | null>(null)

  // Estimate model once from synthetic data
  useEffect(() => {
    const rows = defaultSim()
    const fit = fitMNL(rows, undefined, { maxIters: 200, ridge: 1e-3 })
    setBeta(fit.beta)
    setFitInfo({ logLik: fit.logLik, iters: fit.iters, converged: fit.converged })
  }, [])

  // Demand scale for demo math
  const N = 1000

  const scenario: Scenario = useMemo(
    () => ({
      price: { ...prices },
      featA: { ...features.featA },
      featB: { ...features.featB },
    }),
    [prices, features]
  )

  const probs = useMemo(() => {
    if (!beta) return { none: 0.25, good: 0.25, better: 0.25, best: 0.25 }
    return predictProbs(beta, scenario)
  }, [beta, scenario])

  // Profit frontier: sweep Best price; keep Good/Better fixed
  const frontier = useMemo(() => {
    if (!beta) return { points: [] as { bestPrice: number; profit: number }[], optimum: null as { bestPrice: number; profit: number } | null }
    const points: { bestPrice: number; profit: number }[] = []
    for (let p = 5; p <= 60; p += 1) {
      const probsP = predictProbs(beta, {
        price: { good: prices.good, better: prices.better, best: p },
        featA: features.featA,
        featB: features.featB,
      })
      const take_good = Math.round(N * probsP.good)
      const take_better = Math.round(N * probsP.better)
      const take_best = Math.round(N * probsP.best)
      const profitP =
        take_good * (prices.good - costs.good) +
        take_better * (prices.better - costs.better) +
        take_best * (p - costs.best)
      points.push({ bestPrice: p, profit: profitP })
    }
    if (points.length === 0) return { points, optimum: null }
    const optimum = points.reduce((a, b) => (b.profit > a.profit ? b : a), points[0])
    return { points, optimum }
  }, [
    beta,
    N,
    prices.good,
    prices.better,
    costs.good,
    costs.better,
    costs.best,
    features.featA,
    features.featB,
  ])

  // Expected profit (current slider scenario)
  const take = {
    none: Math.round(N * probs.none),
    good: Math.round(N * probs.good),
    better: Math.round(N * probs.better),
    best: Math.round(N * probs.best),
  }
  const revenue = take.good * prices.good + take.better * prices.better + take.best * prices.best
  const profit =
    take.good * (prices.good - costs.good) +
    take.better * (prices.better - costs.better) +
    take.best * (prices.best - costs.best)

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Good–Better–Best Pricing Optimizer</h1>
          <div className="text-sm text-gray-500">v0.2 • MNL estimated on synthetic data</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-4">
        {/* Left: Scenario Panel */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          <Section title="Scenario Panel">
            <div className="space-y-4">
              {(["good", "better", "best"] as const).map((tier) => (
                <div key={tier} className="space-y-1">
                  <label className="block text-sm font-medium capitalize">
                    {tier} price (${prices[tier]})
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={99}
                    value={prices[tier]}
                    onChange={(e) => setPrices((p) => ({ ...p, [tier]: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              ))}

              <div className="grid grid-cols-3 gap-2">
                {(["good", "better", "best"] as const).map((tier) => (
                  <div key={tier} className="text-xs">
                    <div className="font-semibold capitalize mb-1">{tier} cost</div>
                    <input
                      type="number"
                      value={costs[tier]}
                      onChange={(e) => setCosts((c) => ({ ...c, [tier]: Number(e.target.value || 0) }))}
                      className="w-full border rounded px-2 py-1"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["good", "better", "best"] as const).map((tier) => (
                  <label key={"A-" + tier} className="text-xs flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!features.featA[tier]}
                      onChange={() => setFeatures((f) => ({ ...f, featA: { ...f.featA, [tier]: f.featA[tier] ? 0 : 1 } }))}
                    />
                    FeatA {tier}
                  </label>
                ))}
                {(["good", "better", "best"] as const).map((tier) => (
                  <label key={"B-" + tier} className="text-xs flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!features.featB[tier]}
                      onChange={() => setFeatures((f) => ({ ...f, featB: { ...f.featB, [tier]: f.featB[tier] ? 0 : 1 } }))}
                    />
                    FeatB {tier}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Methods">
            <p className="text-sm text-gray-700">
              MNL: U = β₀(j) + βₚ·price + β_A·featA + β_B·featB; outside option intercept fixed at 0.
              Estimated by MLE on ~15k synthetic obs with ridge regularization.
            </p>
            {fitInfo && (
              <div className="text-xs text-gray-600 mt-2">
                logLik: {Math.round(fitInfo.logLik)} • iters: {fitInfo.iters} • {fitInfo.converged ? "converged" : "not converged"}
              </div>
            )}
          </Section>
        </div>

        {/* Center: Charts */}
        <div className="col-span-12 md:col-span-6 space-y-4">
          <Section title="Profit Frontier">
            <FrontierChartReal points={frontier.points} optimum={frontier.optimum} />
          </Section>
          <Section title="Take-Rate Bars">
            <TakeRateChart data={probs} />
          </Section>
        </div>

        {/* Right: Journal */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          <Section title="Scenario Journal">
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>Prices: {prices.good}/{prices.better}/{prices.best}</li>
              <li>Revenue (N=1000): ${revenue.toLocaleString()}</li>
              <li>Profit (N=1000): ${profit.toLocaleString()}</li>
            </ul>
          </Section>
          <Section title="Callouts">
            <div className="text-sm text-gray-700 space-y-1">
              <div><strong>So what?</strong> Conversion ≈ {Math.round((probs.good + probs.better + probs.best) * 100)}%.</div>
              <div className="text-xs text-gray-500">Frontier shows profit vs Best price with current Good/Better fixed.</div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  )
}
