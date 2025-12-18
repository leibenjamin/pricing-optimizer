// scripts/dev-coverage.ts
/**
 * Dev-only coverage + heatmap check for presets.
 *
 * Run:
 *   npx tsx scripts/dev-coverage.ts
 *   npx tsx scripts/dev-coverage.ts --csv
 */
import fs from "fs";
import path from "path";
import { PRESETS } from "../src/lib/presets";
import { pocketCoverage, feasibilitySliceGB } from "../src/lib/coverage";
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
import type { Constraints, SearchRanges } from "../src/lib/optimize";

const DEFAULTS = {
  features: {
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  },
  optConstraints: {
    gapGB: 2,
    gapBB: 3,
    marginFloor: { good: 0.25, better: 0.25, best: 0.25 },
    charm: false,
    usePocketProfit: false,
    usePocketMargins: false,
    maxNoneShare: 0.9,
    minTakeRate: 0.02,
  },
  optRanges: {
    good: [5, 30] as [number, number],
    better: [10, 45] as [number, number],
    best: [15, 60] as [number, number],
    step: 1,
  },
};
const KPI_FLOOR_ADJ_DEFAULT = 0;

type FeasResult = { ok: boolean; reasons: string[] };

function checkFeasible(
  ladder: Prices,
  constraints: Constraints,
  ctx: { costs: Prices; features: Features; segments: Segment[]; refPrices: Prices; leak?: Leakages; skipMarginCheck?: boolean }
): FeasResult {
  const probs = choiceShares(ladder, ctx.features, ctx.segments, ctx.refPrices);
  const maxNone = constraints.maxNoneShare ?? 0.9;
  const minTake = constraints.minTakeRate ?? 0.02;

  const usePocketMargins = !!(constraints.usePocketMargins ?? constraints.usePocketProfit);
  const effG = usePocketMargins && ctx.leak ? computePocketPrice(ladder.good, "good", ctx.leak).pocket : ladder.good;
  const effB = usePocketMargins && ctx.leak ? computePocketPrice(ladder.better, "better", ctx.leak).pocket : ladder.better;
  const effH = usePocketMargins && ctx.leak ? computePocketPrice(ladder.best, "best", ctx.leak).pocket : ladder.best;
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

function adjustFloors(floors: Prices, adjPct: number) {
  const bump = (x: number) => Math.max(0, Math.min(0.95, x + adjPct / 100));
  return {
    good: bump(floors.good),
    better: bump(floors.better),
    best: bump(floors.best),
  };
}

const writeCsv = process.argv.includes("--csv");
const outDir = path.join(process.cwd(), "scripts", "out");
if (writeCsv) fs.mkdirSync(outDir, { recursive: true });

for (const preset of PRESETS) {
  const baseSegments = normalizeWeights(preset.segments ?? defaultSegments);
  const segments = preset.priceScale ? scaleSegmentsPrice(baseSegments, preset.priceScale) : baseSegments;
  const features = preset.features ?? DEFAULTS.features;
  const optRanges: SearchRanges = preset.optRanges ?? DEFAULTS.optRanges;
  const constraints: Constraints = {
    ...DEFAULTS.optConstraints,
    ...(preset.optConstraints ?? {}),
    marginFloor: {
      ...DEFAULTS.optConstraints.marginFloor,
      ...(preset.optConstraints?.marginFloor ?? {}),
    },
  };
  const floorAdj = preset.kpiFloorAdj ?? KPI_FLOOR_ADJ_DEFAULT;

  const relaxed = checkFeasible(preset.prices, constraints, {
    costs: preset.costs,
    features,
    segments,
    refPrices: preset.refPrices,
    leak: preset.leak,
    skipMarginCheck: true,
  });
  let mergedConstraints = constraints;
  let relaxedGuardrails = false;
  if (!relaxed.ok) {
    relaxedGuardrails = true;
    mergedConstraints = {
      ...constraints,
      gapGB: Math.max(0, constraints.gapGB - 1),
      gapBB: Math.max(0, constraints.gapBB - 2),
      marginFloor: {
        good: Math.min(constraints.marginFloor.good, 0.3),
        better: Math.min(constraints.marginFloor.better, 0.35),
        best: Math.min(constraints.marginFloor.best, 0.4),
      },
      maxNoneShare: Math.max(constraints.maxNoneShare ?? 0, 0.9),
      minTakeRate: Math.min(constraints.minTakeRate ?? 1, 0.02),
    };
  }

  const coverageUsePocket = mergedConstraints.usePocketMargins ?? true;
  const floors0 = mergedConstraints.marginFloor;
  const floors1 = adjustFloors(floors0, floorAdj);
  const gaps = { gapGB: mergedConstraints.gapGB, gapBB: mergedConstraints.gapBB };

  const base = pocketCoverage(optRanges, preset.costs, floors0, gaps, preset.leak, coverageUsePocket);
  const moved = pocketCoverage(optRanges, preset.costs, floors1, gaps, preset.leak, coverageUsePocket);

  const pct0 = Math.round(base.coverage * 100);
  const pct1 = Math.round(moved.coverage * 100);
  const delta = pct1 - pct0;
  const coverageStep = Math.max(0.5, optRanges.step);

  const { cells, gTicks, bTicks, bestUsed } = feasibilitySliceGB(
    optRanges,
    preset.costs,
    floors1,
    gaps,
    preset.leak,
    coverageUsePocket
  );
  const okCells = cells.filter((c) => c.ok).length;
  const cellCount = cells.length || 1;
  const heatmapPct = Math.round((okCells / cellCount) * 100);

  const basisLabel = coverageUsePocket ? "pocket" : "list";
  const floorsLabel = `${Math.round(floors1.good * 100)}/${Math.round(floors1.better * 100)}/${Math.round(floors1.best * 100)}%`;

  console.log(`\n=== ${preset.name} (${preset.id}) ===`);
  console.log(`Basis: ${basisLabel} | relaxed guardrails: ${relaxedGuardrails ? "yes" : "no"}`);
  console.log(`Ranges: G ${optRanges.good[0]}-${optRanges.good[1]} | B ${optRanges.better[0]}-${optRanges.better[1]} | Best ${optRanges.best[0]}-${optRanges.best[1]} | step ${optRanges.step}`);
  console.log(`Floors (adj ${floorAdj}%pt): ${floorsLabel}`);
  console.log(`Coverage: ${pct0}% -> ${pct1}% (${delta >= 0 ? "+" : ""}${delta}%pt), tested ${moved.tested.toLocaleString()} combos, step ${coverageStep}`);
  console.log(`Heatmap: ${heatmapPct}% ok (${okCells}/${cellCount}), grid ${gTicks.length}x${bTicks.length}, bestUsed ${bestUsed}`);

  if (writeCsv) {
    const csv = [
      ["good_price", "better_price", "feasible"].join(","),
      ...cells.map((c) => [c.g, c.b, c.ok ? 1 : 0].join(",")),
    ].join("\n");
    const outPath = path.join(outDir, `coverage-heatmap-${preset.id}.csv`);
    fs.writeFileSync(outPath, csv, "utf8");
  }
}
