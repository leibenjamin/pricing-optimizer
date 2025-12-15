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
    good: s.N * probs.good,
    better: s.N * probs.better,
    best: s.N * probs.best,
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
    good: s.N * probs.good,
    better: s.N * probs.better,
    best: s.N * probs.best,
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
  rawDeltaLow?: number;
  rawDeltaHigh?: number;
};

export type TornadoOpts = {
  usePocket?: boolean;  // default false (list). true => pocket
  priceBump?: number;   // delta$ on ladder
  priceBumps?: Partial<Record<Tier, number>>;
  costBump?: number;    // delta$ on unit cost
  pctSmall?: number;    // delta %pt. for FX/refunds (0.02 = 2%pt.) — will be floored below
  payPct?: number;      // delta %pt. for processor %
  payFixed?: number;    // delta$ for processor fixed
  refBump?: number;     // delta$ shift in ref price
  segTilt?: number;     // delta share tilt between first two segments
};

export type TornadoMetric = "profit" | "revenue";

function evalRevenueList(s: Scenario): number {
  const probs = choiceShares(s.prices, s.features, s.segments, s.refPrices);
  const take = {
    good: s.N * probs.good,
    better: s.N * probs.better,
    best: s.N * probs.best,
  };
  return (
    take.good * s.prices.good +
    take.better * s.prices.better +
    take.best * s.prices.best
  );
}

function evalRevenuePocket(s: Scenario): number {
  const probs = choiceShares(s.prices, s.features, s.segments, s.refPrices);
  const take = {
    good: s.N * probs.good,
    better: s.N * probs.better,
    best: s.N * probs.best,
  };
  const pG = computePocketPrice(s.prices.good,   "good",   s.leak).pocket;
  const pB = computePocketPrice(s.prices.better, "better", s.leak).pocket;
  const pH = computePocketPrice(s.prices.best,   "best",   s.leak).pocket;
  return (
    take.good   * pG +
    take.better * pB +
    take.best   * pH
  );
}

function tornadoMetric(kind: TornadoMetric, s0: Scenario, o: TornadoOpts = {}): TornadoRow[] {
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
  const pctSmallFloor = Math.max(0.0025, pctSmall); // floor to 0.25%pt. to ensure visibility
  const payPctAdj = Math.max(0.001, payPct);
  const payFixedAdj = Math.max(0.01, payFixed);

  const evalMetric =
    kind === "profit"
      ? (usePocket ? evalProfitPocket : evalProfitList)
      : (usePocket ? evalRevenuePocket : evalRevenueList);

  const bumpFor = (tier: Tier) => {
    const raw = priceBumps?.[tier];
    const fallback = Math.max(0.01, priceBump);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return fallback;
  };

  const base = evalMetric(s0);

  const rows: TornadoRow[] = [];
  function vary(mutator: (s: Scenario, sign: -1|1) => void, name: string) {
    const sLow: Scenario = structuredClone(s0);
    const sHigh: Scenario = structuredClone(s0);
    mutator(sLow, -1);
    mutator(sHigh,  1);
    const low  = evalMetric(sLow);
    const high = evalMetric(sHigh);
    rows.push({
      name,
      base,
      low,
      high,
      deltaLow: low - base,
      deltaHigh: high - base,
    });
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

  // Processor / FX / Refunds (relevant when usePocket = true, but we still show list-mode results for "what-if")
  vary((s, sign) => { s.leak.paymentPct   = clamp01(s.leak.paymentPct   + sign * payPctAdj);   }, "Payment %");
  vary((s, sign) => { s.leak.paymentFixed = Math.max(0, s.leak.paymentFixed + sign * payFixedAdj); }, "Payment $");
  vary((s, sign) => { s.leak.fxPct        = clamp01(s.leak.fxPct        + sign * pctSmallFloor); }, "FX %");
  vary((s, sign) => { s.leak.refundsPct   = clamp01(s.leak.refundsPct   + sign * pctSmallFloor); }, "Refunds %");

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

  // Add a tiny floor so downstream visuals don't collapse to zero-width bars when spans are tiny.
  const minVisible = 0.25;
  return rows.map((r) => {
    const adjLow = Math.abs(r.deltaLow) < minVisible ? (r.deltaLow === 0 ? r.deltaLow : Math.sign(r.deltaLow) * minVisible) : r.deltaLow;
    const adjHigh = Math.abs(r.deltaHigh) < minVisible ? (r.deltaHigh === 0 ? r.deltaHigh : Math.sign(r.deltaHigh) * minVisible) : r.deltaHigh;
    return { ...r, rawDeltaLow: r.deltaLow, rawDeltaHigh: r.deltaHigh, deltaLow: adjLow, deltaHigh: adjHigh };
  });
}

export function tornadoProfit(s0: Scenario, o: TornadoOpts = {}): TornadoRow[] {
  return tornadoMetric("profit", s0, o);
}

export function tornadoRevenue(s0: Scenario, o: TornadoOpts = {}): TornadoRow[] {
  return tornadoMetric("revenue", s0, o);
}



