// src/lib/sensitivity.ts
import { choiceShares } from "./choice";
import type { Segment } from "./segments";
import type { Leakages } from "./waterfall";

// Helper: clamp to [0,1]
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Scenario = {
  N: number;
  prices: { good: number; better: number; best: number };
  costs: { good: number; better: number; best: number };
  features: {
    featA: { good: number; better: number; best: number };
    featB: { good: number; better: number; best: number };
  };
  segments: Segment[];
  refPrices: { good: number; better: number; best: number };
  leak: Leakages; // (used by “pocket” variant later if you want)
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

/** One-way sensitivity: vary one field up/down, compute profit delta. */
export type TornadoRow = {
  name: string;
  base: number;
  low: number;   // profit at "low" value of the driver
  high: number;  // profit at "high" value of the driver
  deltaLow: number;
  deltaHigh: number;
};

/**
 * Build a standard set of drivers and ± shocks, then compute up/down profit.
 * - “pct” shocks are absolute (e.g., +0.02 = +2pp).
 * - prices/costs shocks are in dollars.
 * - ref price shocks move all 3 refs together by ±$2 (anchoring).
 * - segment tilt shifts weight from Value to Price-sensitive (and back), then re-normalizes.
 */
export function tornadoProfit(s0: Scenario): TornadoRow[] {
  const base = evalProfitList(s0);

  // Shocks (feel free to tune):
  const priceBump = 5;   // ±$5 on ladder elements
  const costBump  = 2;   // ±$2 on unit cost
  const pctSmall  = 0.02; // ±2pp for promo/volume/refunds/fx
  const payPct    = 0.005; // ±0.5pp on processor %
  const payFixed  = 0.05;  // ±$0.05
  const refBump   = 2;     // ±$2 on all three reference prices
  const segTilt   = 0.10;  // ±10pp tilt between two segments

  const rows: TornadoRow[] = [];

  function vary(mutator: (s: Scenario, sign: -1 | 1) => void, name: string) {
    const sLow: Scenario = structuredClone(s0);
    const sHigh: Scenario = structuredClone(s0);
    mutator(sLow, -1);
    mutator(sHigh, 1);
    const low = evalProfitList(sLow);
    const high = evalProfitList(sHigh);
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
  vary((s, sign) => { s.prices.good   += sign * priceBump; }, "Good price");
  vary((s, sign) => { s.prices.better += sign * priceBump; }, "Better price");
  vary((s, sign) => { s.prices.best   += sign * priceBump; }, "Best price");

  // Costs
  vary((s, sign) => { s.costs.good   = Math.max(0, s.costs.good   + sign * costBump); }, "Good cost");
  vary((s, sign) => { s.costs.better = Math.max(0, s.costs.better + sign * costBump); }, "Better cost");
  vary((s, sign) => { s.costs.best   = Math.max(0, s.costs.best   + sign * costBump); }, "Best cost");

  // Promos/Volume by tier (these affect utility via price perception in your choice model only indirectly through price itself,
  // but many teams still want to see their assumed promo levers—here we model them as “effective discount” on list for choice.)
  // If you’d rather keep them strictly in pocket math, delete these three and use the waterfall-only tornado later.
  vary((s, sign) => { s.refPrices.good   += sign * refBump; }, "Ref price (Good)");
  vary((s, sign) => { s.refPrices.better += sign * refBump; }, "Ref price (Better)");
  vary((s, sign) => { s.refPrices.best   += sign * refBump; }, "Ref price (Best)");

  // Global ref-price anchor shift (moves all)
  vary((s, sign) => {
    s.refPrices.good   += sign * refBump;
    s.refPrices.better += sign * refBump;
    s.refPrices.best   += sign * refBump;
  }, "Refs (all tiers)");

  // Processor %
  vary((s, sign) => { s.leak.paymentPct = clamp01(s.leak.paymentPct + sign * payPct); }, "Payment %");
  // Processor fixed $
  vary((s, sign) => { s.leak.paymentFixed = Math.max(0, s.leak.paymentFixed + sign * payFixed); }, "Payment $");
  // FX
  vary((s, sign) => { s.leak.fxPct = clamp01(s.leak.fxPct + sign * pctSmall); }, "FX %");
  // Refunds
  vary((s, sign) => { s.leak.refundsPct = clamp01(s.leak.refundsPct + sign * pctSmall); }, "Refunds %");

  // Segment tilt: move weight between first two segments (price-sensitive ↔ value-seeker)
  if (s0.segments.length >= 2) {
    vary((s, sign) => {
      const i = 0, j = 1;
      const w = Math.min(segTilt, s.segments[j].weight); // don’t go negative
      s.segments[i].weight = clamp01(s.segments[i].weight + sign * w);
      s.segments[j].weight = clamp01(s.segments[j].weight - sign * w);
      // quick renorm
      const sum = s.segments.reduce((a, b) => a + b.weight, 0) || 1;
      s.segments = s.segments.map((t) => ({ ...t, weight: t.weight / sum }));
    }, "Segment mix tilt");
  }

  // Sort by max absolute swing
  rows.sort((a, b) => Math.max(Math.abs(b.deltaLow), Math.abs(b.deltaHigh)) -
                      Math.max(Math.abs(a.deltaLow), Math.abs(a.deltaHigh)));

  return rows;
}
