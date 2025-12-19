// src/lib/simCohort.ts
import { computePocketPrice, type Leakages } from "./waterfall";
import type { Prices } from "./segments";

export type CohortPoint = { month: number; margin: number };

export function listArpu(prices: Prices, shares: { good: number; better: number; best: number }) {
  const takeRate = shares.good + shares.better + shares.best;
  if (takeRate <= 0) return 0;
  const revenuePerPotential =
    prices.good * shares.good +
    prices.better * shares.better +
    prices.best * shares.best;
  return revenuePerPotential / takeRate;
}

export function adjustRetentionPct(args: {
  baseRetentionPct: number;
  priceDeltaPct: number;
  churnPer10Pct: number;
  minRetentionPct?: number;
  maxRetentionPct?: number;
}) {
  const minRetention = args.minRetentionPct ?? 50;
  const maxRetention = args.maxRetentionPct ?? 99.9;
  const baseRetention = Math.min(maxRetention, Math.max(minRetention, args.baseRetentionPct));
  const churnBase = 100 - baseRetention;
  const churnShift = (args.churnPer10Pct / 10) * (args.priceDeltaPct * 100);
  const churnAdj = Math.min(95, Math.max(0, churnBase + churnShift));
  return Math.min(maxRetention, Math.max(minRetention, 100 - churnAdj));
}

/**
 * Simple 12-month cohort rehearsal.
 * - Uses CURRENT choice shares as weights (good/better/best).
 * - Pocket margin = pocket(list) - cost, per tier.
 * - Cohort starts at size 1.0 and decays by `retention` each month.
 * - Returns absolute margin for that cohort each month (size * per-active margin).
 */
export function simulateCohort(
  prices: Prices,
  probs: { none: number; good: number; better: number; best: number },
  leak: Leakages,
  costs: Prices,
  months = 12,
  retention = 0.92
): CohortPoint[] {
  // margin per ACTIVE customer (weighted by shares)
  const pG = computePocketPrice(prices.good, "good", leak).pocket - costs.good;
  const pB =
    computePocketPrice(prices.better, "better", leak).pocket - costs.better;
  const pH = computePocketPrice(prices.best, "best", leak).pocket - costs.best;

  const perActive =
    probs.good * pG + probs.better * pB + probs.best * pH; // $ per active

  // evolve cohort size
  let size = 1.0;
  const out: CohortPoint[] = [];
  for (let m = 1; m <= months; m++) {
    out.push({ month: m, margin: size * perActive });
    size *= retention;
  }
  return out;
}
