// src/lib/optQuick.ts
import { choiceShares } from "./choice";
import { computePocketPrice, type Leakages } from "./waterfall";

export type Prices = { good: number; better: number; best: number };
export type Costs = Prices;

export type Constraints = {
  gapGB: number;  // min Better - Good
  gapBB: number;  // min Best - Better
  marginFloor: { good: number; better: number; best: number }; // on list or pocket, per flag
  usePocketForFloors?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function profitList(N: number, prices: Prices, costs: Costs, features: any, segments: any, refs: Prices) {
  const probs = choiceShares(prices, features, segments, refs);
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
}

export function profitPocket(
  N: number, prices: Prices, costs: Costs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any, segments: any, refs: Prices, leak: Leakages
) {
  const probs = choiceShares(prices, features, segments, refs);
  const take = {
    good: Math.round(N * probs.good),
    better: Math.round(N * probs.better),
    best: Math.round(N * probs.best),
  };
  const pG = computePocketPrice(prices.good,   "good",   leak).pocket;
  const pB = computePocketPrice(prices.better, "better", leak).pocket;
  const pH = computePocketPrice(prices.best,   "best",   leak).pocket;
  return (
    take.good   * (pG - costs.good) +
    take.better * (pB - costs.better) +
    take.best   * (pH - costs.best)
  );
}

function passesFloors(
  prices: Prices, costs: Costs, leak: Leakages,
  floors: Constraints["marginFloor"], usePocket: boolean
) {
  const PG = usePocket ? computePocketPrice(prices.good,   "good",   leak).pocket   : prices.good;
  const PB = usePocket ? computePocketPrice(prices.better, "better", leak).pocket   : prices.better;
  const PH = usePocket ? computePocketPrice(prices.best,   "best",   leak).pocket   : prices.best;

  const mG = (PG - costs.good)   / Math.max(PG, 1e-6);
  const mB = (PB - costs.better) / Math.max(PB, 1e-6);
  const mH = (PH - costs.best)   / Math.max(PH, 1e-6);

  return mG >= floors.good && mB >= floors.better && mH >= floors.best;
}

/** Brute grid search with gaps & margin floors. Returns best prices + profit. */
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
  C: Constraints,
  usePocketForProfit: boolean
) {
  let best: Prices | null = null;
  let bestProfit = -Infinity;

  for (let g = ranges.good[0]; g <= ranges.good[1]; g += ranges.step) {
    for (let b = Math.max(g + C.gapGB, ranges.better[0]); b <= ranges.better[1]; b += ranges.step) {
      for (let h = Math.max(b + C.gapBB, ranges.best[0]); h <= ranges.best[1]; h += ranges.step) {
        const prices = { good: g, better: b, best: h };
        if (!passesFloors(prices, costs, leak, C.marginFloor, !!C.usePocketForFloors)) continue;

        const p = usePocketForProfit
          ? profitPocket(N, prices, costs, features, segments, refs, leak)
          : profitList(N, prices, costs, features, segments, refs);

        if (p > bestProfit) {
          bestProfit = p;
          best = prices;
        }
      }
    }
  }
  return { best, profit: bestProfit };
}
