// src/lib/optimize.ts
import type { Prices, Features, Segment } from "./segments";
import { choiceShares } from "./choice";
import { computePocketPrice, type Leakages } from "./waterfall";

export type Ladder = Prices;

export type Constraints = {
  gapGB: number; // better >= good + gapGB
  gapBB: number; // best   >= better + gapBB
  marginFloor: { good: number; better: number; best: number };
  charm: boolean;
  usePocketMargins?: boolean;
  usePocketProfit?: boolean;
};

export type SearchRanges = {
  good: [number, number];
  better: [number, number];
  best: [number, number];
  step: number;
};

// Apply ".99" endings (and only if it lowers left digit, optional)
function charm99(p: number) {
  const floored = Math.floor(p);
  if (p - floored < 0.5) return Math.max(0.99, floored - 1 + 0.99);
  return floored + 0.99;
}

function snap(p: number, charm: boolean) {
  return charm ? charm99(p) : p;
}

export function gridSearch(
  ranges: SearchRanges,
  costs: Prices,
  feats: Features,
  segs: Segment[],
  refPrices: Prices | undefined,
  N: number,
  C: Constraints,
  leak?: Leakages
): { prices: Ladder; profit: number } {
  let best = {
    prices: { good: ranges.good[0], better: ranges.better[0], best: ranges.best[0] },
    profit: -Infinity,
  };

  for (let pg = ranges.good[0]; pg <= ranges.good[1]; pg += ranges.step) {
    const pGood = snap(pg, C.charm);

    for (let pb = Math.max(pGood + C.gapGB, ranges.better[0]); pb <= ranges.better[1]; pb += ranges.step) {
      const pBetter = snap(pb, C.charm);
      if (pBetter < pGood + C.gapGB) continue;

      for (let pB = Math.max(pBetter + C.gapBB, ranges.best[0]); pB <= ranges.best[1]; pB += ranges.step) {
        const pBest = snap(pB, C.charm);
        if (pBest < pBetter + C.gapBB) continue;

        const p: Prices = { good: pGood, better: pBetter, best: pBest };

        // 1) Margin floors — use pocket iff requested
        const effGood = C.usePocketMargins && leak ? computePocketPrice(p.good, "good", leak).pocket : p.good;
        const effBetter = C.usePocketMargins && leak ? computePocketPrice(p.better, "better", leak).pocket : p.better;
        const effBest = C.usePocketMargins && leak ? computePocketPrice(p.best, "best", leak).pocket : p.best;

        const mg = (effGood - costs.good) / Math.max(1e-6, effGood);
        const mb = (effBetter - costs.better) / Math.max(1e-6, effBetter);
        const mB = (effBest - costs.best) / Math.max(1e-6, effBest);
        if (mg < C.marginFloor.good || mb < C.marginFloor.better || mB < C.marginFloor.best) continue;

        // 2) Demand
        const probs = choiceShares(p, feats, segs, refPrices);
        const q = {
          good: Math.round(N * probs.good),
          better: Math.round(N * probs.better),
          best: Math.round(N * probs.best),
        };

        // 3) Profit — use pocket iff requested
        const priceGood = C.usePocketProfit && leak ? computePocketPrice(p.good, "good", leak).pocket : p.good;
        const priceBetter = C.usePocketProfit && leak ? computePocketPrice(p.better, "better", leak).pocket : p.better;
        const priceBest = C.usePocketProfit && leak ? computePocketPrice(p.best, "best", leak).pocket : p.best;

        const profit =
          q.good * (priceGood - costs.good) +
          q.better * (priceBetter - costs.better) +
          q.best * (priceBest - costs.best);

        if (profit > best.profit) best = { prices: p, profit };
      }
    }
  }
  return best;
}
