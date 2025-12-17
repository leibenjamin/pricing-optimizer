// scripts/dev-frontier-shopify.ts
/**
 * Dev-only sanity: reproduce Profit Frontier numbers for the Shopify DTC preset,
 * matching the app's Frontier math (frontier sweeps + optimizer ladder slice).
 *
 * Run:
 *   npx tsx scripts/dev-frontier-shopify.ts
 */
import { PRESETS } from "../src/lib/presets";
import { buildFrontier, deriveFrontierSweep } from "../src/lib/frontier";
import type { Constraints, SearchRanges } from "../src/lib/optimize";
import { gridSearch } from "../src/lib/optimize";
import { kpisFromSnapshot } from "../src/lib/snapshots";
import { normalizeWeights, scaleSegmentsPrice, type Features, type Prices, type Segment, type Tier } from "../src/lib/segments";
import type { Leakages } from "../src/lib/waterfall";

const N = 1_000;
const TIER: Tier = "best";

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmtLadder = (p: Prices) => `${fmtMoney(p.good)}/${fmtMoney(p.better)}/${fmtMoney(p.best)}`;

function bandWithinPct(points: Array<{ price: number; profit: number }>, peakProfit: number, pct: number) {
  const threshold = peakProfit * (1 - pct);
  const near = points.filter((p) => p.profit >= threshold);
  if (!near.length) return null;
  return {
    min: Math.min(...near.map((p) => p.price)),
    max: Math.max(...near.map((p) => p.price)),
    count: near.length,
    threshold,
  };
}

function computeProfit(args: {
  prices: Prices;
  costs: Prices;
  features: Features;
  segments: Segment[];
  refPrices?: Prices;
  leak: Leakages;
  usePocketProfit: boolean;
  usePocketMargins: boolean;
}) {
  return kpisFromSnapshot(
    {
      prices: args.prices,
      costs: args.costs,
      features: args.features,
      segments: args.segments,
      refPrices: args.refPrices,
      leak: args.leak,
    },
    N,
    args.usePocketProfit,
    args.usePocketMargins
  ).profit;
}

type Preset = (typeof PRESETS)[number];
const preset: Preset = (() => {
  const found = PRESETS.find((p) => p.id === "shopify-dtc");
  if (!found) throw new Error("Preset shopify-dtc not found.");
  return found;
})();
const leak: Leakages = (() => {
  if (!preset.leak) throw new Error("shopify-dtc preset is missing leakages.");
  return preset.leak;
})();
const ranges: SearchRanges = (() => {
  if (!preset.optRanges) throw new Error("shopify-dtc preset is missing optRanges.");
  return preset.optRanges as SearchRanges;
})();
const constraintsBase: Constraints = (() => {
  if (!preset.optConstraints) throw new Error("shopify-dtc preset is missing optConstraints.");
  return preset.optConstraints as Constraints;
})();

const baseSegments = normalizeWeights(preset.segments ?? []);
const segments = preset.priceScale ? scaleSegmentsPrice(baseSegments, preset.priceScale) : baseSegments;
const features: Features = preset.features ?? {
  featA: { good: 1, better: 1, best: 1 },
  featB: { good: 0, better: 1, best: 1 },
};

const C0 = constraintsBase;
const constraints: Constraints = {
  ...C0,
  usePocketMargins: !!(C0.usePocketMargins ?? C0.usePocketProfit),
};
const sweep = deriveFrontierSweep({
  tier: TIER,
  prices: preset.prices,
  priceRange: preset.priceRange?.[TIER] ?? null,
  optRange: ranges[TIER] ?? null,
});

function printState(label: string, current: Prices, optPrices: Prices | null) {
  const base = buildFrontier({
    tier: TIER,
    prices: current,
    costs: preset.costs,
    features,
    segments,
    refPrices: preset.refPrices,
    leak,
    constraints,
    sweep,
    N,
    charm: !!constraints.charm,
  });

  const peak = base.optimum;
  if (!peak) throw new Error("Frontier produced no points.");

  const baseProfit = computeProfit({
    prices: current,
    costs: preset.costs,
    features,
    segments,
    refPrices: preset.refPrices,
    leak,
    usePocketProfit: !!constraints.usePocketProfit,
    usePocketMargins: !!constraints.usePocketMargins,
  });

  const band = bandWithinPct(base.feasiblePoints.length ? base.feasiblePoints : base.points, peak.profit, 0.01);

  console.log(`\n=== ${label} ===`);
  console.log(`Sweep ${TIER}: ${fmtMoney(sweep.min)}-${fmtMoney(sweep.max)} (step ${sweep.step})`);
  console.log(`Base ladder: ${fmtLadder(current)}  profit=${fmtInt(baseProfit)}`);
  console.log(`Base peak: ${fmtMoney(peak.price)}  profit=${fmtInt(peak.profit)}  feasible=${base.feasiblePoints.length}`);
  if (band) {
    console.log(
      `Within 1% of peak: ${fmtMoney(band.min)}-${fmtMoney(band.max)} (n=${band.count}, threshold=${fmtInt(band.threshold)})`
    );
  }

  if (optPrices) {
    const optProfit = computeProfit({
      prices: optPrices,
      costs: preset.costs,
      features,
      segments,
      refPrices: preset.refPrices,
      leak,
      usePocketProfit: !!constraints.usePocketProfit,
      usePocketMargins: !!constraints.usePocketMargins,
    });
    const slice = buildFrontier({
      tier: TIER,
      prices: optPrices,
      costs: preset.costs,
      features,
      segments,
      refPrices: preset.refPrices,
      leak,
      constraints,
      sweep,
      N,
      charm: !!constraints.charm,
    });
    const slicePeak = slice.optimum;
    console.log(`Optimized ladder: ${fmtLadder(optPrices)}  profit=${fmtInt(optProfit)}  deltaVsBasePeak=${fmtInt(optProfit - peak.profit)}`);
    if (slicePeak) {
      console.log(`Optimized-slice peak: ${fmtMoney(slicePeak.price)}  profit=${fmtInt(slicePeak.profit)}  feasible=${slice.feasiblePoints.length}`);
    }
  }
}

// State 1: preset baseline/current, no optimizer.
printState("State 1 (preset baseline/current, no optimizer)", preset.prices, null);

// Optimizer run on the preset (what the app would have after Optimize).
const opt = gridSearch(ranges, preset.costs, features, segments, preset.refPrices, N, constraints, leak);

// State 2: preset ladder + optimizer overlay slice.
printState("State 2 (after optimizer run, no other changes)", preset.prices, opt.prices);

// State 3: user-adjusted current ladder after optimizer run.
const adjusted: Prices = { good: 30, better: 50, best: 100 };
printState("State 3 (after optimizer run, then adjust prices 28/52/98 -> 30/50/100)", adjusted, opt.prices);
