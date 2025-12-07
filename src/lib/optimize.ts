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
  maxNoneShare?: number;
  minTakeRate?: number;
};

export type GridDiagnostics = {
  coarseStep: number;
  refinementStep: number;
  tested: number;
  coarsened: boolean;
  skippedGuardrails: number;
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

type EvalOpts = {
  costs: Prices;
  feats: Features;
  segs: Segment[];
  refPrices: Prices | undefined;
  N: number;
  C: Constraints;
  leak?: Leakages;
};

function evalLadder(prices: Prices, opts: EvalOpts): number | null {
  const { costs, feats, segs, refPrices, N, C, leak } = opts;
  const maxNone = C.maxNoneShare ?? 0.9;
  const minTake = C.minTakeRate ?? 0.02;

  const effGood = C.usePocketMargins && leak ? computePocketPrice(prices.good, "good", leak).pocket : prices.good;
  const effBetter = C.usePocketMargins && leak ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
  const effBest = C.usePocketMargins && leak ? computePocketPrice(prices.best, "best", leak).pocket : prices.best;

  const mg = (effGood - costs.good) / Math.max(1e-6, effGood);
  const mb = (effBetter - costs.better) / Math.max(1e-6, effBetter);
  const mB = (effBest - costs.best) / Math.max(1e-6, effBest);
  if (mg < C.marginFloor.good || mb < C.marginFloor.better || mB < C.marginFloor.best) return null;

  const probs = choiceShares(prices, feats, segs, refPrices);
  if (probs.none > maxNone) return null;
  const takeRate = probs.good + probs.better + probs.best;
  if (takeRate < minTake) return null;

  const q = {
    good: N * probs.good,
    better: N * probs.better,
    best: N * probs.best,
  };

  const priceGood = C.usePocketProfit && leak ? computePocketPrice(prices.good, "good", leak).pocket : prices.good;
  const priceBetter = C.usePocketProfit && leak ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
  const priceBest = C.usePocketProfit && leak ? computePocketPrice(prices.best, "best", leak).pocket : prices.best;

  return (
    q.good * (priceGood - costs.good) +
    q.better * (priceBetter - costs.better) +
    q.best * (priceBest - costs.best)
  );
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
): { prices: Ladder; profit: number; diagnostics: GridDiagnostics } {
  let step = ranges.step;
  const spanCounts = (range: [number, number], s: number) => Math.max(1, Math.floor((range[1] - range[0]) / Math.max(s, 1e-6)) + 1);
  const maxCombos = 500_000;
  let combos =
    spanCounts(ranges.good, step) *
    spanCounts(ranges.better, step) *
    spanCounts(ranges.best, step);
  let coarsened = false;
  while (combos > maxCombos) {
    step *= 2;
    coarsened = true;
    combos =
      spanCounts(ranges.good, step) *
      spanCounts(ranges.better, step) *
      spanCounts(ranges.best, step);
  }

  const evalOpts: EvalOpts = { costs, feats, segs, refPrices, N, C, leak };
  let best = {
    prices: { good: ranges.good[0], better: ranges.better[0], best: ranges.best[0] },
    profit: -Infinity,
  };
  const top: Array<{ prices: Prices; profit: number }> = [];
  let tested = 0;
  let skippedGuardrails = 0;

  // Stage 1: coarse grid
  for (let pg = ranges.good[0]; pg <= ranges.good[1]; pg += step) {
    const pGood = snap(pg, C.charm);

    for (let pb = Math.max(pGood + C.gapGB, ranges.better[0]); pb <= ranges.better[1]; pb += step) {
      const pBetter = snap(pb, C.charm);
      if (pBetter < pGood + C.gapGB) continue;

      for (let pB = Math.max(pBetter + C.gapBB, ranges.best[0]); pB <= ranges.best[1]; pB += step) {
        const pBest = snap(pB, C.charm);
        if (pBest < pBetter + C.gapBB) continue;

        const p: Prices = { good: pGood, better: pBetter, best: pBest };
        const profit = evalLadder(p, evalOpts);
        tested += 1;
        if (profit == null) {
          skippedGuardrails += 1;
          continue;
        }
        if (profit > best.profit) best = { prices: p, profit };
        top.push({ prices: p, profit });
      }
    }
  }

  top.sort((a, b) => b.profit - a.profit);
  const keep = top.slice(0, 20);

  // Stage 2: refinement around the best coarse ladders
  const refStep = Math.max(step / 2, 0.25);
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  for (const cand of keep) {
    for (const dg of [-refStep, 0, refStep]) {
      for (const db of [-refStep, 0, refStep]) {
        for (const dB of [-refStep, 0, refStep]) {
          const g = clamp(cand.prices.good + dg, ranges.good[0], ranges.good[1]);
          const b = clamp(cand.prices.better + db, ranges.better[0], ranges.better[1]);
          const B = clamp(cand.prices.best + dB, ranges.best[0], ranges.best[1]);
          if (b < g + C.gapGB || B < b + C.gapBB) continue;
          const p: Prices = { good: snap(g, C.charm), better: snap(b, C.charm), best: snap(B, C.charm) };
          const profit = evalLadder(p, evalOpts);
          tested += 1;
          if (profit == null) {
            skippedGuardrails += 1;
            continue;
          }
          if (profit > best.profit) best = { prices: p, profit };
        }
      }
    }
  }

  return {
    prices: best.prices,
    profit: best.profit,
    diagnostics: { coarseStep: step, refinementStep: refStep, tested, coarsened, skippedGuardrails },
  };
}
