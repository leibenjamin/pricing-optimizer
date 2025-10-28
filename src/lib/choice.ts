// src/lib/choice.ts
import type { Prices, Features, Segment } from "./segments"

export type Shares = { none: number; good: number; better: number; best: number }

// numerically stable softmax over array of utilities
function softmax(us: number[]): number[] {
  const m = Math.max(...us)
  const exps = us.map(u => Math.exp(u - m))
  const s = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / s)
}

// One segment’s MNL shares given prices & features
function segmentShares(prices: Prices, feats: Features, s: Segment): Shares {
  const U_none   = s.betaNone
  const U_good   = s.betaPrice * prices.good   + s.betaFeatA * feats.featA.good   + s.betaFeatB * feats.featB.good
  const U_better = s.betaPrice * prices.better + s.betaFeatA * feats.featA.better + s.betaFeatB * feats.featB.better
  const U_best   = s.betaPrice * prices.best   + s.betaFeatA * feats.featA.best   + s.betaFeatB * feats.featB.best

  const [pNone, pGood, pBetter, pBest] = softmax([U_none, U_good, U_better, U_best])
  return { none: pNone, good: pGood, better: pBetter, best: pBest }
}

// Mix segments by weight to get overall shares
export function choiceShares(prices: Prices, feats: Features, segments: Segment[]): Shares {
  const mixInit = { none: 0, good: 0, better: 0, best: 0 }
  const total = segments.reduce((acc, seg) => {
    const sh = segmentShares(prices, feats, seg)
    return {
      none:   acc.none   + seg.weight * sh.none,
      good:   acc.good   + seg.weight * sh.good,
      better: acc.better + seg.weight * sh.better,
      best:   acc.best   + seg.weight * sh.best,
    }
  }, mixInit)
  // tiny numeric guard
  const sum = total.none + total.good + total.better + total.best
  return sum > 0 ? {
    none: total.none / sum,
    good: total.good / sum,
    better: total.better / sum,
    best: total.best / sum,
  } : { none: 1, good: 0, better: 0, best: 0 }
}
