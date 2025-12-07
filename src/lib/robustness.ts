// src/lib/robustness.ts
import { gridSearch, type Constraints, type SearchRanges } from "./optimize";
import type { Features, Prices, Segment } from "./segments";
import { scaleSegmentsPrice } from "./segments";
import type { Leakages } from "./waterfall";
import { choiceShares } from "./choice";
import { computePocketPrice } from "./waterfall";

export type UncertaintyScenario = {
  name: string;
  segmentScalePrice: number; // e.g., 1.2 = more price sensitive
  leakDeltaPct?: number; // e.g., 0.1 to worsen fees/refunds by +10%
};

function adjustLeak(leak: Leakages, deltaPct = 0): Leakages {
  const bump = (v: number) => Math.max(0, Math.min(1, v * (1 + deltaPct)));
  return {
    ...leak,
    paymentPct: bump(leak.paymentPct),
    fxPct: bump(leak.fxPct),
    refundsPct: bump(leak.refundsPct),
  };
}

function profitForLadder(
  ladder: Prices,
  opts: {
    costs: Prices;
    features: Features;
    segments: Segment[];
    refPrices?: Prices;
    leak: Leakages;
    N: number;
    usePocketProfit?: boolean;
  }
): number {
  const { costs, features, segments, refPrices, leak, N, usePocketProfit } = opts;
  const probs = choiceShares(ladder, features, segments, refPrices);
  const q = {
    good: N * probs.good,
    better: N * probs.better,
    best: N * probs.best,
  };
  const price = (tier: keyof Prices) =>
    usePocketProfit ? computePocketPrice(ladder[tier], tier, leak).pocket : ladder[tier];
  return (
    q.good * (price("good") - costs.good) +
    q.better * (price("better") - costs.better) +
    q.best * (price("best") - costs.best)
  );
}

export type ScenarioResult = {
  name: string;
  bestPrices: Prices;
  bestProfit: number;
  profitAtBase?: number;
  priceDelta?: number;
};

export function runRobustnessScenarios(args: {
  scenarios: UncertaintyScenario[];
  baseRanges: SearchRanges;
  baseConstraints: Constraints;
  baseSegments: Segment[];
  baseFeatures: Features;
  baseRefPrices?: Prices;
  baseCosts: Prices;
  baseLeak: Leakages;
  N: number;
  baseLadder?: Prices;
}): ScenarioResult[] {
  const {
    scenarios,
    baseRanges,
    baseConstraints,
    baseSegments,
    baseFeatures,
    baseRefPrices,
    baseCosts,
    baseLeak,
    N,
    baseLadder,
  } = args;

  return scenarios.map((sc) => {
    const segs = scaleSegmentsPrice(baseSegments, sc.segmentScalePrice);
    const leak = sc.leakDeltaPct ? adjustLeak(baseLeak, sc.leakDeltaPct) : baseLeak;
    const best = gridSearch(baseRanges, baseCosts, baseFeatures, segs, baseRefPrices, N, baseConstraints, leak);
    const profitAtBase = baseLadder
      ? profitForLadder(baseLadder, {
          costs: baseCosts,
          features: baseFeatures,
          segments: segs,
          refPrices: baseRefPrices,
          leak,
          N,
          usePocketProfit: baseConstraints.usePocketProfit,
        })
      : undefined;
    const priceDelta =
      baseLadder != null
        ? (Math.abs(best.prices.good - baseLadder.good) +
            Math.abs(best.prices.better - baseLadder.better) +
            Math.abs(best.prices.best - baseLadder.best)) /
          3
        : undefined;

    return {
      name: sc.name,
      bestPrices: best.prices,
      bestProfit: best.profit,
      profitAtBase,
      priceDelta,
    };
  });
}
