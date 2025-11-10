// src/lib/choice.ts

import type { Prices, Features, Segment } from "./segments"

export type Shares = { none: number; good: number; better: number; best: number }

// Numerically-stable softmax
function softmax(us: number[]): number[] {
  const m = Math.max(...us)
  const exps = us.map((u) => Math.exp(u - m))
  const s = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / s)
}

/**
 * Mixed multinomial-logit shares across latent segments.
 * - prices: current ladder {good, better, best}
 * - feats: simple binary/continuous features per tier
 * - segments: latent classes with weights and coefficients
 * - refPrices: optional reference prices to apply anchoring + loss aversion
 */
export function choiceShares(
  prices: Prices,
  feats: Features,
  segments: Segment[],
  refPrices?: Prices
): Shares {
  // accumulator for the weighted mix
  let accNone = 0,
    accGood = 0,
    accBetter = 0,
    accBest = 0

  for (const s of segments) {
    // Base utilities per tier
    const U_none = s.betaNone
    let U_good =
      s.betaPrice * prices.good +
      s.betaFeatA * feats.featA.good +
      s.betaFeatB * feats.featB.good
    let U_better =
      s.betaPrice * prices.better +
      s.betaFeatA * feats.featA.better +
      s.betaFeatB * feats.featB.better
    let U_best =
      s.betaPrice * prices.best +
      s.betaFeatA * feats.featA.best +
      s.betaFeatB * feats.featB.best

    // Optional: reference-price anchoring with loss aversion
    if (refPrices && s.alphaAnchor && s.alphaAnchor > 0) {
      const lambda = s.lambdaLoss && s.lambdaLoss > 1 ? s.lambdaLoss : 1
      const adj = (p: number, r: number) => {
        const d = p - r
        // Price increases (d>=0) are penalized by lambda > 1 (losses loom larger)
        return s.alphaAnchor! * (d >= 0 ? lambda * d : d)
      }
      U_good += adj(prices.good, refPrices.good)
      U_better += adj(prices.better, refPrices.better)
      U_best += adj(prices.best, refPrices.best)
    }

    const [pNone, pGood, pBetter, pBest] = softmax([U_none, U_good, U_better, U_best])

    accNone += s.weight * pNone
    accGood += s.weight * pGood
    accBetter += s.weight * pBetter
    accBest += s.weight * pBest
  }

  // Normalize just in case segment weights were off due to rounding
  const sum = accNone + accGood + accBetter + accBest
  if (sum <= 0) return { none: 1, good: 0, better: 0, best: 0 }

  return {
    none: accNone / sum,
    good: accGood / sum,
    better: accBetter / sum,
    best: accBest / sum,
  }
}
