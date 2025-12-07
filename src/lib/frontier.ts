// src/lib/frontier.ts
import type { Shares } from "./choice";
import { choiceShares } from "./choice";
import type { Constraints } from "./optimize";
import type { Features, Prices, Segment, Tier } from "./segments";
import { computePocketPrice, type Leakages } from "./waterfall";

export type FrontierPoint = {
  price: number;
  profit: number;
  shares: Shares;
  reason?: string;
};

export type FrontierSweep = { min: number; max: number; step: number };

export type FrontierSeries = {
  points: FrontierPoint[];
  feasiblePoints: FrontierPoint[];
  infeasiblePoints: FrontierPoint[];
  optimum: FrontierPoint | null;
  sweep: FrontierSweep;
};

const snapCharm = (p: number, charm: boolean) => {
  if (!charm) return p;
  const floored = Math.floor(p);
  if (p - floored < 0.5) return Math.max(0.99, floored - 1 + 0.99);
  return floored + 0.99;
};

export function buildFrontier(args: {
  tier: Tier;
  prices: Prices;
  costs: Prices;
  features: Features;
  segments: Segment[];
  refPrices?: Prices;
  leak?: Leakages;
  constraints: Constraints;
  sweep: FrontierSweep;
  N: number;
  charm?: boolean;
}): FrontierSeries {
  const { tier, prices, costs, features, segments, refPrices, leak, constraints, sweep, N, charm } = args;
  const usePocketProfit = !!constraints.usePocketProfit;
  const usePocketMargins = !!(constraints.usePocketMargins ?? constraints.usePocketProfit);
  const floors = constraints.marginFloor;
  const maxNone = constraints.maxNoneShare ?? 0.9;
  const minTake = constraints.minTakeRate ?? 0.02;

  const points: FrontierPoint[] = [];
  const feasible: FrontierPoint[] = [];
  const infeasible: FrontierPoint[] = [];

  const step = Math.max(0.001, sweep.step);
  for (let p = sweep.min; p <= sweep.max + step / 2; p += step) {
    const snapped = snapCharm(p, !!charm);
    const ladder = { ...prices, [tier]: snapped } as Prices;
    const probs = choiceShares(ladder, features, segments, refPrices);
    const take = {
      good: N * probs.good,
      better: N * probs.better,
      best: N * probs.best,
    };

    const effGoodProfit = usePocketProfit && leak ? computePocketPrice(ladder.good, "good", leak).pocket : ladder.good;
    const effBetterProfit = usePocketProfit && leak ? computePocketPrice(ladder.better, "better", leak).pocket : ladder.better;
    const effBestProfit = usePocketProfit && leak ? computePocketPrice(ladder.best, "best", leak).pocket : ladder.best;

    const profit =
      take.good * (effGoodProfit - costs.good) +
      take.better * (effBetterProfit - costs.better) +
      take.best * (effBestProfit - costs.best);

    const effGoodFloor = usePocketMargins && leak ? computePocketPrice(ladder.good, "good", leak).pocket : ladder.good;
    const effBetterFloor = usePocketMargins && leak ? computePocketPrice(ladder.better, "better", leak).pocket : ladder.better;
    const effBestFloor = usePocketMargins && leak ? computePocketPrice(ladder.best, "best", leak).pocket : ladder.best;
    const mG = (effGoodFloor - costs.good) / Math.max(effGoodFloor, 1e-6);
    const mB = (effBetterFloor - costs.better) / Math.max(effBetterFloor, 1e-6);
    const mH = (effBestFloor - costs.best) / Math.max(effBestFloor, 1e-6);

    const gapGB = ladder.better - ladder.good - constraints.gapGB;
    const gapBB = ladder.best - ladder.better - constraints.gapBB;

    const reasons: string[] = [];
    if (mG < floors.good) reasons.push("Good margin below floor");
    if (mB < floors.better) reasons.push("Better margin below floor");
    if (mH < floors.best) reasons.push("Best margin below floor");
    if (gapGB < 0) reasons.push("Gap G/B below floor");
    if (gapBB < 0) reasons.push("Gap B/Best below floor");
    if (probs.none > maxNone) reasons.push("None share above guardrail");
    if (probs.good + probs.better + probs.best < minTake) reasons.push("Take rate below guardrail");

    const point: FrontierPoint = {
      price: ladder[tier],
      profit,
      shares: probs,
      reason: reasons.length ? reasons.join("; ") : undefined,
    };

    points.push(point);
    (reasons.length ? infeasible : feasible).push(point);
  }

  const setForPeak = feasible.length ? feasible : points;
  const optimum =
    setForPeak.length === 0 ? null : setForPeak.reduce((a, b) => (b.profit > a.profit ? b : a), setForPeak[0]);

  return { points, feasiblePoints: feasible, infeasiblePoints: infeasible, optimum, sweep };
}

export function deriveFrontierSweep(input: {
  tier: Tier;
  prices: Prices;
  priceRange?: { min: number; max: number } | null;
  optRange?: [number, number] | null;
}): FrontierSweep {
  const basePrice = input.prices[input.tier] || 1;
  const fromRange = input.optRange
    ? { min: input.optRange[0], max: input.optRange[1] }
    : input.priceRange
    ? { min: input.priceRange.min, max: input.priceRange.max }
    : null;
  const min = fromRange?.min ?? Math.max(0.01, basePrice * 0.45);
  let max = fromRange?.max ?? Math.max(min + 1, basePrice * 1.6);

  if (max <= min) {
    max = min + Math.max(1, min * 0.25);
  }

  const span = Math.max(max - min, 1);
  const roughStep = span / 90;
  let step = roughStep;
  if (roughStep > 500) step = 50;
  else if (roughStep > 200) step = 25;
  else if (roughStep > 80) step = 10;
  else if (roughStep > 20) step = 2;
  else if (roughStep > 5) step = 1;
  else step = Math.max(0.25, Math.round(roughStep * 4) / 4);

  return { min, max, step };
}
