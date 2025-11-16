// src/lib/sensitivity.ts
import { choiceShares } from "./choice";
import { computePocketPrice, type Leakages } from "./waterfall";
import type { Segment, Tier } from "./segments";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Scenario = {
  N: number;
  prices: { good: number; better: number; best: number };
  costs: { good: number; better: number; best: number };
  features: { featA: { good:number; better:number; best:number }, featB: { good:number; better:number; best:number } };
  segments: Segment[];
  refPrices: { good:number; better:number; best:number };
  leak: Leakages;
};

export function evalProfitList(s: Scenario): number {
  const probs = choiceShares(s.prices, s.features, s.segments, s.refPrices);
  const take = {
    good: Math.round(s.N * probs.good),
    better: Math.round(s.N * probs.better),
    best: Math.round(s.N * probs.best),
  };
  return (
    take.good * (s.prices.good - s.costs.good) +
    take.better * (s.prices.better - s.costs.better) +
    take.best * (s.prices.best - s.costs.best)
  );
}

export function evalProfitPocket(s: Scenario): number {
  const probs = choiceShares(s.prices, s.features, s.segments, s.refPrices);
  const take = {
    good: Math.round(s.N * probs.good),
    better: Math.round(s.N * probs.better),
    best: Math.round(s.N * probs.best),
  };
  const pG = computePocketPrice(s.prices.good,   "good",   s.leak).pocket;
  const pB = computePocketPrice(s.prices.better, "better", s.leak).pocket;
  const pH = computePocketPrice(s.prices.best,   "best",   s.leak).pocket;
  return (
    take.good   * (pG - s.costs.good)   +
    take.better * (pB - s.costs.better) +
    take.best   * (pH - s.costs.best)
  );
}

export type TornadoRow = {
  name: string;
  base: number;
  low: number;
  high: number;
  deltaLow: number;
  deltaHigh: number;
};

export type TornadoOpts = {
  usePocket?: boolean;  // default false (list). true => pocket
  priceBump?: number;   // delta$ on ladder
  priceBumps?: Partial<Record<Tier, number>>;
  costBump?: number;    // delta$ on unit cost
  pctSmall?: number;    // deltapp for FX/refunds (0.02 = 2pp)
  payPct?: number;      // deltapp for processor %
  payFixed?: number;    // delta$ for processor fixed
  refBump?: number;     // delta$ shift in ref price
  segTilt?: number;     // delta share tilt between first two segments
};

export function tornadoProfit(s0: Scenario, o: TornadoOpts = {}): TornadoRow[] {
  const {
    usePocket = false,
    priceBump = 5,
    priceBumps,
    costBump  = 2,
    pctSmall  = 0.02,
    payPct    = 0.005,
    payFixed  = 0.05,
    refBump   = 2,
    segTilt   = 0.10,
  } = o;

  const evalProfit = usePocket ? evalProfitPocket : evalProfitList;

  const bumpFor = (tier: Tier) => {
    const raw = priceBumps?.[tier];
    const fallback = Math.max(0.01, priceBump);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return fallback;
  };

  const base = evalProfit(s0);

  const rows: TornadoRow[] = [];
  function vary(mutator: (s: Scenario, sign: -1|1) => void, name: string) {
    const sLow: Scenario = structuredClone(s0);
    const sHigh: Scenario = structuredClone(s0);
    mutator(sLow, -1);
    mutator(sHigh,  1);
    const low  = evalProfit(sLow);
    const high = evalProfit(sHigh);
    rows.push({ name, base, low, high, deltaLow: low-base, deltaHigh: high-base });
  }

  // Prices
  vary((s, sign) => { s.prices.good   += sign * bumpFor("good"); }, "Good price");
  vary((s, sign) => { s.prices.better += sign * bumpFor("better"); }, "Better price");
  vary((s, sign) => { s.prices.best   += sign * bumpFor("best"); }, "Best price");

  // Costs
  vary((s, sign) => { s.costs.good   = Math.max(0, s.costs.good   + sign * costBump); }, "Good cost");
  vary((s, sign) => { s.costs.better = Math.max(0, s.costs.better + sign * costBump); }, "Better cost");
  vary((s, sign) => { s.costs.best   = Math.max(0, s.costs.best   + sign * costBump); }, "Best cost");

  // Reference prices (anchoring)
  vary((s, sign) => { s.refPrices.good   += sign * refBump; }, "Ref (Good)");
  vary((s, sign) => { s.refPrices.better += sign * refBump; }, "Ref (Better)");
  vary((s, sign) => { s.refPrices.best   += sign * refBump; }, "Ref (Best)");
  vary((s, sign) => {
    s.refPrices.good   += sign * refBump;
    s.refPrices.better += sign * refBump;
    s.refPrices.best   += sign * refBump;
  }, "Refs (all)");

  // Processor / FX / Refunds (relevant when usePocket = true, but we still show list-mode results for “what-if”)
  vary((s, sign) => { s.leak.paymentPct   = clamp01(s.leak.paymentPct   + sign * payPct);   }, "Payment %");
  vary((s, sign) => { s.leak.paymentFixed = Math.max(0, s.leak.paymentFixed + sign * payFixed); }, "Payment $");
  vary((s, sign) => { s.leak.fxPct        = clamp01(s.leak.fxPct        + sign * pctSmall); }, "FX %");
  vary((s, sign) => { s.leak.refundsPct   = clamp01(s.leak.refundsPct   + sign * pctSmall); }, "Refunds %");

  // Segment tilt (between first two segments)
  if (s0.segments.length >= 2) {
    vary((s, sign) => {
      const i = 0, j = 1;
      const w = Math.min(segTilt, s.segments[j].weight);
      s.segments[i].weight = clamp01(s.segments[i].weight + sign * w);
      s.segments[j].weight = clamp01(s.segments[j].weight - sign * w);
      const sum = s.segments.reduce((a, b) => a + b.weight, 0) || 1;
      s.segments = s.segments.map(t => ({ ...t, weight: t.weight / sum }));
    }, "Segment mix tilt");
  }

  rows.sort((a, b) =>
    Math.max(Math.abs(b.deltaLow), Math.abs(b.deltaHigh)) -
    Math.max(Math.abs(a.deltaLow), Math.abs(a.deltaHigh))
  );
  return rows;
}




