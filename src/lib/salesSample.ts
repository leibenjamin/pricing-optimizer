// src/lib/salesSample.ts
import { simulateLong } from "./simulate";
import { csvFromRows } from "./download";

type Tier = "good" | "better" | "best";

type WideRow = {
  user: string;
  timestamp: string;
  choice: "none" | Tier;
  price_good: number;
  price_better: number;
  price_best: number;
  featA_good: number;
  featA_better: number;
  featA_best: number;
  featB_good: number;
  featB_better: number;
  featB_best: number;
  shown_good: 0 | 1;
  shown_better: 0 | 1;
  shown_best: 0 | 1;
};

const header = [
  "user",
  "timestamp",
  "choice",
  "price_good",
  "price_better",
  "price_best",
  "featA_good",
  "featA_better",
  "featA_best",
  "featB_good",
  "featB_better",
  "featB_best",
  "shown_good",
  "shown_better",
  "shown_best",
] as const;

const baseSimParams = {
  basePrices: { good: 9, better: 15, best: 25 },
  beta: {
    intercept_good: 0.8,
    intercept_better: 1.2,
    intercept_best: 1.1,
    price: -0.07,
    featA: 0.35,
    featB: 0.25,
    intercept_none: 0,
  },
  priceNoise: 1.5,
  featProb: 0.6,
};

function seededShown(obsId: number, tier: Tier): 0 | 1 {
  const hash = (obsId * 17 + (tier === "good" ? 3 : tier === "better" ? 7 : 11)) % 9;
  return hash === 0 ? 0 : 1;
}

export function buildSalesSampleCSV(count = 200): string {
  const nObs = Math.min(Math.max(60, count), 2000);
  const simRows = simulateLong({ nObs, seed: 603, ...baseSimParams });
  const perObs = new Map<number, WideRow>();
  const baseTs = Date.now() - nObs * 60 * 60 * 1000;

  const ensure = (obsId: number): WideRow => {
    let row = perObs.get(obsId);
    if (row) return row;
    row = {
      user: `acct-${(obsId % 37) + 1}`,
      timestamp: new Date(baseTs + obsId * 60 * 60 * 1000).toISOString(),
      choice: "none",
      price_good: 0,
      price_better: 0,
      price_best: 0,
      featA_good: 0,
      featA_better: 0,
      featA_best: 0,
      featB_good: 0,
      featB_better: 0,
      featB_best: 0,
      shown_good: 1,
      shown_better: 1,
      shown_best: 1,
    };
    perObs.set(obsId, row);
    return row;
  };

  for (const row of simRows) {
    const entry = ensure(row.obsId);
    if (row.alt === "none") {
      if (row.chosen === 1) {
        entry.choice = "none";
      }
      continue;
    }

    const tier = row.alt as Tier;
    entry[`price_${tier}`] = Number(row.price.toFixed(2));
    entry[`featA_${tier}`] = row.featA;
    entry[`featB_${tier}`] = row.featB;
    entry[`shown_${tier}`] = seededShown(row.obsId, tier);
    if (row.chosen === 1) {
      entry.choice = tier;
    }
  }

  const rows = Array.from(perObs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => header.map((key) => value[key]));

  const headerRow = Array.from(header);
  return csvFromRows([headerRow, ...rows]);
}
