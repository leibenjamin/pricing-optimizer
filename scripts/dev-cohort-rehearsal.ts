// scripts/dev-cohort-rehearsal.ts
/**
 * Dev-only cohort rehearsal sanity script.
 * Mirrors App.tsx flows for presets (segment scaling, guardrail relaxation, optimizer keep-baseline)
 * and prints cohort summaries + optional CSVs for chart comparison.
 *
 * Run:
 *   npx tsx scripts/dev-cohort-rehearsal.ts
 *   npx tsx scripts/dev-cohort-rehearsal.ts --preset saas
 *   npx tsx scripts/dev-cohort-rehearsal.ts --months 12 --retention 94 --csv
 *   npx tsx scripts/dev-cohort-rehearsal.ts --price-churn-on --price-churn-per10 4
 */
import fs from "fs";
import path from "path";
import { PRESETS } from "../src/lib/presets";
import { gridSearch, type Constraints, type SearchRanges } from "../src/lib/optimize";
import { kpisFromSnapshot } from "../src/lib/snapshots";
import { buildCohortViewModel } from "../src/lib/viewModels";
import { choiceShares } from "../src/lib/choice";
import { computePocketPrice, type Leakages } from "../src/lib/waterfall";
import {
  defaultSegments,
  normalizeWeights,
  scaleSegmentsPrice,
  type Features,
  type Prices,
  type Segment,
} from "../src/lib/segments";

const N = 1000; // keep aligned with App.tsx

const DEFAULTS = {
  features: {
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  } satisfies Features,
  optConstraints: {
    gapGB: 2,
    gapBB: 3,
    marginFloor: { good: 0.25, better: 0.25, best: 0.25 },
    charm: false,
    usePocketProfit: false,
    usePocketMargins: false,
    maxNoneShare: 0.9,
    minTakeRate: 0.02,
  } satisfies Constraints,
  optRanges: {
    good: [5, 30] as [number, number],
    better: [10, 45] as [number, number],
    best: [15, 60] as [number, number],
    step: 1,
  } satisfies SearchRanges,
};

const RETENTION_DEFAULT = 92;
const DEFAULT_MONTHS = 12;

type FeasResult = { ok: boolean; reasons: string[] };

// Mirrors App.tsx checkFeasible (skips margin floors when requested).
function checkFeasible(
  ladder: Prices,
  constraints: Constraints,
  ctx: {
    costs: Prices;
    features: Features;
    segments: Segment[];
    refPrices: Prices;
    leak: Leakages;
    skipMarginCheck?: boolean;
  }
): FeasResult {
  const probs = choiceShares(ladder, ctx.features, ctx.segments, ctx.refPrices);
  const maxNone = constraints.maxNoneShare ?? 0.9;
  const minTake = constraints.minTakeRate ?? 0.02;

  const usePocketMargins = !!(constraints.usePocketMargins ?? constraints.usePocketProfit);
  const effG = usePocketMargins ? computePocketPrice(ladder.good, "good", ctx.leak).pocket : ladder.good;
  const effB = usePocketMargins ? computePocketPrice(ladder.better, "better", ctx.leak).pocket : ladder.better;
  const effH = usePocketMargins ? computePocketPrice(ladder.best, "best", ctx.leak).pocket : ladder.best;
  const mG = (effG - ctx.costs.good) / Math.max(effG, 1e-6);
  const mB = (effB - ctx.costs.better) / Math.max(effB, 1e-6);
  const mH = (effH - ctx.costs.best) / Math.max(effH, 1e-6);

  const reasons: string[] = [];
  if (!ctx.skipMarginCheck) {
    if (mG < constraints.marginFloor.good) reasons.push("Good margin below floor");
    if (mB < constraints.marginFloor.better) reasons.push("Better margin below floor");
    if (mH < constraints.marginFloor.best) reasons.push("Best margin below floor");
  }
  if (ladder.better < ladder.good + constraints.gapGB) reasons.push("Gap G/B below floor");
  if (ladder.best < ladder.better + constraints.gapBB) reasons.push("Gap B/Best below floor");
  if (probs.none > maxNone) reasons.push("None share above guardrail");
  if (probs.good + probs.better + probs.best < minTake) reasons.push("Take rate below guardrail");

  return { ok: reasons.length === 0, reasons };
}

function computeScenarioProfit(
  ladder: Prices,
  usePocket: boolean,
  ctx: { costs: Prices; features: Features; segments: Segment[]; refPrices: Prices; leak: Leakages; N: number }
): number {
  const probs = choiceShares(ladder, ctx.features, ctx.segments, ctx.refPrices);
  const qty = {
    good: ctx.N * probs.good,
    better: ctx.N * probs.better,
    best: ctx.N * probs.best,
  };

  if (!usePocket) {
    return (
      qty.good * (ladder.good - ctx.costs.good) +
      qty.better * (ladder.better - ctx.costs.better) +
      qty.best * (ladder.best - ctx.costs.best)
    );
  }

  const pocketGood = computePocketPrice(ladder.good, "good", ctx.leak).pocket;
  const pocketBetter = computePocketPrice(ladder.better, "better", ctx.leak).pocket;
  const pocketBest = computePocketPrice(ladder.best, "best", ctx.leak).pocket;

  return (
    qty.good * (pocketGood - ctx.costs.good) +
    qty.better * (pocketBetter - ctx.costs.better) +
    qty.best * (pocketBest - ctx.costs.best)
  );
}

function clampNumber(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function parseArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const presetFilter = (parseArgValue("--preset") || "").toLowerCase();
const monthsArg = parseArgValue("--months");
const retentionArg = parseArgValue("--retention");
const priceChurnOn = process.argv.includes("--price-churn-on");
const priceChurnPer10Arg = parseArgValue("--price-churn-per10");
const writeCsv = process.argv.includes("--csv");
const outDir = path.join(process.cwd(), "scripts", "out");
if (writeCsv) fs.mkdirSync(outDir, { recursive: true });

const requestedMonths = monthsArg ? Number(monthsArg) : null;
const requestedRetention = retentionArg ? Number(retentionArg) : null;
const churnPer10 = priceChurnPer10Arg ? Number(priceChurnPer10Arg) : 0;
const churnPer10Safe = Number.isFinite(churnPer10) ? Math.min(10, Math.max(0, churnPer10)) : 0;

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${Math.round(n * 1000) / 10}%`;

const presets = presetFilter
  ? PRESETS.filter(
      (p) => p.id.toLowerCase().includes(presetFilter) || p.name.toLowerCase().includes(presetFilter)
    )
  : PRESETS;

if (presetFilter && presets.length === 0) {
  console.error(`No presets matched --preset "${presetFilter}".`);
  process.exit(1);
}

for (const preset of presets) {
  const baseSegments = normalizeWeights(preset.segments ?? defaultSegments);
  const segments = preset.priceScale ? scaleSegmentsPrice(baseSegments, preset.priceScale) : baseSegments;
  const features = preset.features ?? DEFAULTS.features;
  const refPrices = preset.refPrices;
  const leak = preset.leak;
  const costs = preset.costs;

  const baseConstraints: Constraints = {
    ...DEFAULTS.optConstraints,
    ...(preset.optConstraints ?? {}),
    marginFloor: {
      ...DEFAULTS.optConstraints.marginFloor,
      ...(preset.optConstraints?.marginFloor ?? {}),
    },
  };
  const optRanges: SearchRanges = preset.optRanges ?? DEFAULTS.optRanges;

  const feas = checkFeasible(preset.prices, baseConstraints, {
    costs,
    features,
    segments,
    refPrices,
    leak,
    skipMarginCheck: true, // App relaxes non-margin guardrails if baseline fails
  });
  const relaxed = !feas.ok;
  const constraints: Constraints = relaxed
    ? {
        ...baseConstraints,
        gapGB: Math.max(0, baseConstraints.gapGB - 1),
        gapBB: Math.max(0, baseConstraints.gapBB - 2),
        marginFloor: {
          good: Math.min(baseConstraints.marginFloor.good, 0.3),
          better: Math.min(baseConstraints.marginFloor.better, 0.35),
          best: Math.min(baseConstraints.marginFloor.best, 0.4),
        },
        maxNoneShare: Math.max(baseConstraints.maxNoneShare ?? 0, 0.9),
        minTakeRate: Math.min(baseConstraints.minTakeRate ?? 1, 0.02),
      }
    : baseConstraints;

  const retentionPct = clampNumber(
    requestedRetention ?? preset.retentionPct ?? RETENTION_DEFAULT,
    70,
    99.9
  );
  const retentionMonths = clampNumber(
    requestedMonths ?? preset.retentionMonths ?? DEFAULT_MONTHS,
    6,
    24
  );

  const usePocketProfit = !!constraints.usePocketProfit;
  const usePocketMargins = constraints.usePocketMargins ?? usePocketProfit;

  const baselineProfit = computeScenarioProfit(preset.prices, usePocketProfit, {
    costs,
    features,
    segments,
    refPrices,
    leak,
    N,
  });

  const opt = gridSearch(optRanges, costs, features, segments, refPrices, N, constraints, leak);
  const keepBaseline = opt.profit <= baselineProfit;
  const optimizedPrices = keepBaseline ? preset.prices : opt.prices;

  const baselineKpis = kpisFromSnapshot(
    { prices: preset.prices, costs, features, segments, refPrices, leak },
    N,
    usePocketProfit,
    usePocketMargins
  );
  const optimizedKpis = kpisFromSnapshot(
    { prices: optimizedPrices, costs, features, segments, refPrices, leak },
    N,
    usePocketProfit,
    usePocketMargins
  );

  const { scenarios, summaries } = buildCohortViewModel({
    baseline: {
      label: "Baseline",
      kpis: baselineKpis,
      prices: preset.prices,
      leak,
      costs,
    },
    current: {
      label: "Current",
      kpis: baselineKpis,
      prices: preset.prices,
      leak,
      costs,
    },
    optimized: {
      label: "Optimized",
      kpis: optimizedKpis,
      prices: optimizedPrices,
      leak,
      costs,
    },
    retentionMonths,
    retentionPct,
    priceChurn: { enabled: priceChurnOn, churnPer10Pct: churnPer10Safe },
  });

  console.log(`\n=== ${preset.name} (${preset.id}) ===`);
  console.log(
    `Retention ${retentionPct.toFixed(1)}% | Horizon ${retentionMonths}m | Price churn: ${
      priceChurnOn ? `${churnPer10Safe.toFixed(2)}% per +10% price` : "off"
    } | Optimizer kept baseline: ${
      keepBaseline ? "yes" : "no"
    } | Relaxed guardrails: ${relaxed ? "yes" : "no"}`
  );

  for (const summary of summaries) {
    console.log(
      `${summary.label.padEnd(10)} total ${fmtMoney(summary.total)} | month ${retentionMonths}: ${fmtMoney(
        summary.monthEnd
      )} | delta vs baseline: ${
        summary.deltaTotal === null ? "n/a" : fmtMoney(summary.deltaTotal)
      }`
    );
  }

  const scenarioByKey = Object.fromEntries(scenarios.map((s) => [s.key, s]));
  if (scenarioByKey.baseline && scenarioByKey.optimized) {
    const base = scenarioByKey.baseline;
    const optScenario = scenarioByKey.optimized;
    if (priceChurnOn) {
      console.log(
        `Retention used: baseline ${base.retentionPct.toFixed(1)}% | optimized ${optScenario.retentionPct.toFixed(
          1
        )}% (price delta ${Math.round(optScenario.priceDeltaPct * 1000) / 10}%)`
      );
    }
    console.log(
      `Month 1: baseline ${fmtMoney(base.month1)} | optimized ${fmtMoney(optScenario.month1)} (I"=${fmtMoney(
        optScenario.month1 - base.month1
      )})`
    );
    console.log(
      `Month ${retentionMonths}: baseline ${fmtMoney(base.monthEnd)} | optimized ${fmtMoney(
        optScenario.monthEnd
      )} (I"=${fmtMoney(optScenario.monthEnd - base.monthEnd)})`
    );
    console.log(
      `Baseline take-rate: ${fmtPct(base.shares.good + base.shares.better + base.shares.best)} | Optimized take-rate: ${fmtPct(
        optScenario.shares.good + optScenario.shares.better + optScenario.shares.best
      )}`
    );
  }

  if (writeCsv) {
    const rows = [
      ["month", ...scenarios.map((s) => s.label)].join(","),
      ...scenarios[0].points.map((_, idx) => {
        const month = scenarios[0].points[idx].month;
        const values = scenarios.map((s) => s.points[idx]?.margin ?? 0);
        return [month, ...values.map((v) => v.toFixed(6))].join(",");
      }),
    ].join("\n");
    const outPath = path.join(outDir, `cohort-${preset.id}.csv`);
    fs.writeFileSync(outPath, rows, "utf8");
    console.log(`CSV: ${outPath}`);
  }
}
