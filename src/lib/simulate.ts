// src/lib/simulate.ts

export type Alt = "none" | "good" | "better" | "best"

export interface AltRow {
  obsId: number
  alt: Alt
  price: number
  featA: number
  featB: number
  chosen: 0 | 1
}

export interface SimParams {
  nObs: number
  basePrices: { good: number; better: number; best: number }
  beta: {
    intercept_good: number
    intercept_better: number
    intercept_best: number
    price: number
    featA: number
    featB: number
    intercept_none: number
  }
  priceNoise?: number
  featProb?: number
  seed?: number
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

export function simulateLong(params: SimParams): AltRow[] {
  const {
    nObs,
    basePrices,
    beta,
    priceNoise = 2,
    featProb = 0.5,
    seed = 42
  } = params

  const rand = rng(seed)
  const rows: AltRow[] = []

  for (let i = 0; i < nObs; i++) {
    const alts: Alt[] = ["none", "good", "better", "best"]
    const prices: Record<Alt, number> = {
      none: 0,
      good: Math.max(1, basePrices.good + (rand() - 0.5) * 2 * priceNoise),
      better: Math.max(1, basePrices.better + (rand() - 0.5) * 2 * priceNoise),
      best: Math.max(1, basePrices.best + (rand() - 0.5) * 2 * priceNoise)
    }
    const featA: Record<Alt, number> = {
      none: 0, good: rand() < featProb ? 1 : 0, better: rand() < featProb ? 1 : 0, best: rand() < featProb ? 1 : 0
    }
    const featB: Record<Alt, number> = {
      none: 0, good: rand() < featProb ? 1 : 0, better: rand() < featProb ? 1 : 0, best: rand() < featProb ? 1 : 0
    }

    // utilities
    const util: Record<Alt, number> = {
      none: beta.intercept_none,
      good: beta.intercept_good + beta.price * prices.good + beta.featA * featA.good + beta.featB * featB.good,
      better: beta.intercept_better + beta.price * prices.better + beta.featA * featA.better + beta.featB * featB.better,
      best: beta.intercept_best + beta.price * prices.best + beta.featA * featA.best + beta.featB * featB.best
    }

    const expVals = alts.map(a => Math.exp(util[a]))
    const denom = expVals.reduce((s, v) => s + v, 0)
    const probs = expVals.map(v => v / denom)

    // draw one choice
    const r = rand()
    let cum = 0, chosen: Alt = "none"
    for (let k = 0; k < alts.length; k++) {
      cum += probs[k]
      if (r <= cum) { chosen = alts[k]; break }
    }

    for (const a of alts) {
      rows.push({
        obsId: i, alt: a,
        price: prices[a], featA: featA[a], featB: featB[a],
        chosen: a === chosen ? 1 : 0
      })
    }
  }
  return rows
}

export function defaultSim(): AltRow[] {
  return simulateLong({
    nObs: 5000,
    basePrices: { good: 9, better: 15, best: 25 },
    beta: {
      intercept_good: 0.8,
      intercept_better: 1.2,
      intercept_best: 1.1,
      price: -0.07,
      featA: 0.35,
      featB: 0.25,
      intercept_none: 0
    },
    priceNoise: 1.5,
    featProb: 0.6,
    seed: 123
  })
}
