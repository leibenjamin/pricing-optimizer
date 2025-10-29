// src/lib/optimize.ts
import type { Prices, Features, Segment } from "./segments"
import { choiceShares } from "./choice"

export type Ladder = Prices

export type Constraints = {
  // minimum gaps between tiers (absolute $)
  gapGB: number   // better >= good + gapGB
  gapBB: number   // best   >= better + gapBB
  // margin floors (0..1)
  marginFloor: { good: number; better: number; best: number }
  // optional charm-price snapping
  charm: boolean
}

export type SearchRanges = {
  good:   [number, number]
  better: [number, number]
  best:   [number, number]
  step: number         // $ step size
}

// Apply “.99” endings (and only if it lowers left digit, optional)
function charm99(p: number) {
  const floored = Math.floor(p)
  if (p - floored < 0.5) return Math.max(0.99, floored - 1 + 0.99)
  return floored + 0.99
}

function snap(p: number, charm: boolean) {
  return charm ? charm99(p) : p
}

export function gridSearch(
  ranges: SearchRanges,
  costs: Prices,
  feats: Features,
  segs: Segment[],
  refPrices: Prices | undefined,
  N: number,
  C: Constraints
): { prices: Ladder; profit: number } {
  let best = { prices: { good: ranges.good[0], better: ranges.better[0], best: ranges.best[0] }, profit: -Infinity }

  for (let pg = ranges.good[0]; pg <= ranges.good[1]; pg += ranges.step) {
    // snap if charm
    pg = snap(pg, C.charm)

    for (let pb = Math.max(pg + C.gapGB, ranges.better[0]); pb <= ranges.better[1]; pb += ranges.step) {
      pb = snap(pb, C.charm)
      // enforce gaps
      if (pb < pg + C.gapGB) continue

      for (let pB = Math.max(pb + C.gapBB, ranges.best[0]); pB <= ranges.best[1]; pB += ranges.step) {
        const pBest = snap(pB, C.charm)
        if (pBest < pb + C.gapBB) continue

        const p: Prices = { good: pg, better: pb, best: pBest }

        // margin floors
        const mg = (p.good   - costs.good)   / Math.max(1e-6, p.good)
        const mb = (p.better - costs.better) / Math.max(1e-6, p.better)
        const mB = (p.best   - costs.best)   / Math.max(1e-6, p.best)
        if (mg < C.marginFloor.good || mb < C.marginFloor.better || mB < C.marginFloor.best) continue

        const shares = choiceShares(p, feats, segs, refPrices)
        const profit =
          N * ( shares.good   * (p.good   - costs.good)
              + shares.better * (p.better - costs.better)
              + shares.best   * (p.best   - costs.best) )

        if (profit > best.profit) best = { prices: p, profit }
      }
    }
  }
  return best
}
