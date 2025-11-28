// src/lib/optQuick.ts
import { choiceShares } from "./choice";
import { computePocketPrice, type Leakages } from "./waterfall";

export type Prices = { good: number; better: number; best: number };
export type Costs = Prices;

export type Constraints = {
  gapGB: number;
  gapBB: number;
  marginFloor: { good: number; better: number; best: number };
  usePocketMargins?: boolean;
  usePocketProfit?: boolean;
  charm?: boolean;
  maxNoneShare?: number;
  minTakeRate?: number;
};

function charm99(p: number) {
  const floored = Math.floor(p);
  if (p - floored < 0.5) return Math.max(0.99, floored - 1 + 0.99);
  return floored + 0.99;
}
const snap = (p: number, charm?: boolean) => (charm ? charm99(p) : p);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function evalLadder(
  prices: Prices,
  costs: Costs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segments: any,
  refs: Prices,
  leak: Leakages,
  C: Constraints,
  N: number
): number | null {
  const maxNone = C.maxNoneShare ?? 0.9;
  const minTake = C.minTakeRate ?? 0.02;
  const effG = C.usePocketMargins ? computePocketPrice(prices.good, "good", leak).pocket : prices.good;
  const effB = C.usePocketMargins ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
  const effH = C.usePocketMargins ? computePocketPrice(prices.best, "best", leak).pocket : prices.best;

  const mG = (effG - costs.good) / Math.max(effG, 1e-6);
  const mB = (effB - costs.better) / Math.max(effB, 1e-6);
  const mH = (effH - costs.best) / Math.max(effH, 1e-6);
  if (mG < C.marginFloor.good || mB < C.marginFloor.better || mH < C.marginFloor.best) return null;

  const probs = choiceShares(prices, features, segments, refs);
  if (probs.none > maxNone) return null;
  const take = probs.good + probs.better + probs.best;
  if (take < minTake) return null;

  const pG = C.usePocketProfit ? computePocketPrice(prices.good, "good", leak).pocket : prices.good;
  const pB = C.usePocketProfit ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
  const pH = C.usePocketProfit ? computePocketPrice(prices.best, "best", leak).pocket : prices.best;

  const q = {
    good: Math.round(probs.good * N),
    better: Math.round(probs.better * N),
    best: Math.round(probs.best * N),
  };

  return q.good * (pG - costs.good) + q.better * (pB - costs.better) + q.best * (pH - costs.best);
}

/** Brute grid search with gaps, margin floors, guardrails, charm endings. */
export function gridOptimize(
  N: number,
  ranges: { good: [number, number]; better: [number, number]; best: [number, number]; step: number },
  costs: Costs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segments: any,
  refs: Prices,
  leak: Leakages,
  C: Constraints
) {
  const maxCombos = 300_000;
  let step = ranges.step;
  const count = (r: [number, number], s: number) => Math.max(1, Math.floor((r[1] - r[0]) / Math.max(s, 1e-6)) + 1);
  let combos = count(ranges.good, step) * count(ranges.better, step) * count(ranges.best, step);
  while (combos > maxCombos) {
    step *= 2;
    combos = count(ranges.good, step) * count(ranges.better, step) * count(ranges.best, step);
  }

  let best: Prices | null = null;
  let bestProfit = -Infinity;
  let tested = 0;
  let skippedGuardrails = 0;

  for (let g = ranges.good[0]; g <= ranges.good[1]; g += step) {
    const pGood = snap(g, C.charm);
    for (let b = Math.max(pGood + C.gapGB, ranges.better[0]); b <= ranges.better[1]; b += step) {
      const pBetter = snap(b, C.charm);
      if (pBetter < pGood + C.gapGB) continue;
      for (let h = Math.max(pBetter + C.gapBB, ranges.best[0]); h <= ranges.best[1]; h += step) {
        const pBest = snap(h, C.charm);
        if (pBest < pBetter + C.gapBB) continue;
        const prices = { good: pGood, better: pBetter, best: pBest };
        const p = evalLadder(prices, costs, features, segments, refs, leak, C, N);
        tested += 1;
        if (p == null) {
          skippedGuardrails += 1;
          continue;
        }
        const profit = p;
        if (profit > bestProfit) {
          bestProfit = profit;
          best = prices;
        }
      }
    }
  }

  // Small refinement around best ladder
  if (best) {
    const refStep = Math.max(step / 2, 0.25);
    for (const dg of [-refStep, 0, refStep]) {
      for (const db of [-refStep, 0, refStep]) {
        for (const dh of [-refStep, 0, refStep]) {
          const g = clamp(best.good + dg, ranges.good[0], ranges.good[1]);
          const b = clamp(best.better + db, ranges.better[0], ranges.better[1]);
          const h = clamp(best.best + dh, ranges.best[0], ranges.best[1]);
          if (b < g + C.gapGB || h < b + C.gapBB) continue;
          const prices = { good: snap(g, C.charm), better: snap(b, C.charm), best: snap(h, C.charm) };
          const p = evalLadder(prices, costs, features, segments, refs, leak, C, N);
          tested += 1;
          if (p == null) {
            skippedGuardrails += 1;
            continue;
          }
          const profit = p;
          if (profit > bestProfit) {
            bestProfit = profit;
            best = prices;
          }
        }
      }
    }
  }

  return { best, profit: bestProfit, diagnostics: { tested, skippedGuardrails, step } };
}
