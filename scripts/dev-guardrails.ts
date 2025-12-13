/**
 * Dev-only check: ensure presets pin without triggering guardrail relaxation,
 * while still reporting when strict floors/gaps would fail.
 *
 * Run with:
 *   npx tsx scripts/dev-guardrails.ts
 */
import { PRESETS } from "../src/lib/presets";
import { choiceShares } from "../src/lib/choice";
import { computePocketPrice, type Leakages } from "../src/lib/waterfall";
import type { Prices, Features, Segment } from "../src/lib/segments";
import type { Constraints } from "../src/lib/optimize";

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

let hardFail = false;

for (const preset of PRESETS) {
  const constraints = preset.optConstraints as Constraints;
  const fallbackFeatures: Features = {
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  };
  const ctx = {
    costs: preset.costs,
    features: preset.features ?? fallbackFeatures,
    segments: preset.segments ?? [],
    refPrices: preset.refPrices,
    leak: preset.leak,
  };

  const relaxed = checkFeasible(preset.prices, constraints, { ...ctx, skipMarginCheck: true });
  const strict = checkFeasible(preset.prices, constraints, ctx);

  if (!relaxed.ok) {
    hardFail = true;
    console.error(`❌ ${preset.name}: fails even relaxed check -> ${relaxed.reasons.join("; ")}`);
    continue;
  }

  if (!strict.ok) {
    console.warn(`⚠️  ${preset.name}: passes relaxed pin, but strict guardrails would fail -> ${strict.reasons.join("; ")}`);
  } else {
    console.log(`✅ ${preset.name}: passes guardrails (strict)`);
  }
}

if (hardFail) {
  process.exitCode = 1;
}
