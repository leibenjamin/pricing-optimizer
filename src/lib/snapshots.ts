// src/lib/snapshots.ts
import type { Prices, Features, Segment } from "./segments";
import { choiceShares } from "./choice";
import { computePocketPrice, type Leakages } from "./waterfall";
import { csvFromRows } from "./download";

export type Snapshot = {
  id: string;              // e.g., "S-001"
  name: string;            // short label user can edit later (optional UX later)
  at: string;              // ISO timestamp
  prices: Prices;          // ladder captured
  shares: { none: number; good: number; better: number; best: number };
  // key KPIs at the moment of capture (N is implicit in revenue/profit)
  revenue: number;
  profit: number;
  arpuActive: number;
  grossMarginPct: number;
  // segment summary (first 3 classes, clamp to available)
  segShares: number[];     // [pGood, pBetter, pBest] or by segment? -> use class weights
};

function round2(x: number) { return Math.round(x * 100) / 100; }
function pct(x: number) { return Math.round(x * 10000) / 100; } // 2dp %

/**
 * Capture a snapshot from current UI state.
 * - If usePocketProfit/usePocketMargins are true, we respect pocket where appropriate.
 */
export function makeSnapshot(args: {
  prices: Prices;
  costs: Prices;
  feats: Features;
  segments: Segment[];
  refPrices?: Prices;
  N: number;
  leak: Leakages;
  usePocketProfit?: boolean;
  usePocketMargins?: boolean;
  label?: string;
}): Snapshot {
  const {
    prices, costs, feats, segments, refPrices, N, leak,
    usePocketProfit = false, usePocketMargins = false,
    label = ""
  } = args;

  const shares = choiceShares(prices, feats, segments, refPrices);

  // Quantities (rounded like optimizer)
  const q = {
    good:   Math.round(N * shares.good),
    better: Math.round(N * shares.better),
    best:   Math.round(N * shares.best),
  };

  // Effective price for profit/margins
  const effG = usePocketProfit ? computePocketPrice(prices.good,   "good",   leak).pocket : prices.good;
  const effB = usePocketProfit ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
  const effH = usePocketProfit ? computePocketPrice(prices.best,   "best",   leak).pocket : prices.best;

  const revenue = round2(q.good * effG + q.better * effB + q.best * effH);
  const profit  = round2(q.good * (effG - costs.good) + q.better * (effB - costs.better) + q.best * (effH - costs.best));

  // ARPU (active) = Revenue / (active customers)
  const active = Math.max(1, q.good + q.better + q.best);
  const arpuActive = round2(revenue / active);

  // GM uses pocket/list consistent with usePocketMargins flag
  const mgG = usePocketMargins
    ? (computePocketPrice(prices.good, "good", leak).pocket - costs.good) / Math.max(1e-6, computePocketPrice(prices.good, "good", leak).pocket)
    : (prices.good - costs.good) / Math.max(1e-6, prices.good);
  const mgB = usePocketMargins
    ? (computePocketPrice(prices.better, "better", leak).pocket - costs.better) / Math.max(1e-6, computePocketPrice(prices.better, "better", leak).pocket)
    : (prices.better - costs.better) / Math.max(1e-6, prices.better);
  const mgH = usePocketMargins
    ? (computePocketPrice(prices.best, "best", leak).pocket - costs.best) / Math.max(1e-6, computePocketPrice(prices.best, "best", leak).pocket)
    : (prices.best - costs.best) / Math.max(1e-6, prices.best);
  // crude blend weighted by unit mix (use the same q as above)
  const grossMarginPct = (q.good + q.better + q.best) > 0
    ? pct((q.good*mgG + q.better*mgB + q.best*mgH) / (q.good + q.better + q.best))
    : 0;

  const segShares = segments.slice(0, 3).map(s => s.weight);

  return {
    id: `S-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
    name: label || "Snapshot",
    at: new Date().toISOString(),
    prices,
    shares,
    revenue,
    profit,
    arpuActive,
    grossMarginPct,
    segShares,
  };
}

export function snapshotsToCSV(rows: Snapshot[]): string {
  const header = [
    "id","name","captured_at",
    "price.good","price.better","price.best",
    "share.none","share.good","share.better","share.best",
    "revenue","profit","arpu_active","gross_margin_pct",
    "seg.weight.1","seg.weight.2","seg.weight.3"
  ];
  const data = rows.map(s => ([
    s.id, s.name, s.at,
    s.prices.good, s.prices.better, s.prices.best,
    s.shares.none, s.shares.good, s.shares.better, s.shares.best,
    s.revenue, s.profit, s.arpuActive, s.grossMarginPct,
    s.segShares[0] ?? "", s.segShares[1] ?? "", s.segShares[2] ?? ""
  ] as (string | number)[]));
  return csvFromRows([header, ...data]);
}
