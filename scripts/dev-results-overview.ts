// scripts/dev-results-overview.ts
/**
 * Dev-only sanity: compute baseline vs optimized KPIs for each preset using the same
 * `gridSearch` + `kpisFromSnapshot` logic as the app, and print a compact Results Overview
 * summary to help spot wiring/copy regressions.
 *
 * Run:
 *   npx tsx scripts/dev-results-overview.ts
 */
import { PRESETS } from "../src/lib/presets";
import type { Constraints, SearchRanges } from "../src/lib/optimize";
import { gridSearch } from "../src/lib/optimize";
import { explainOptimizerResult } from "../src/lib/explain";
import { kpisFromSnapshot } from "../src/lib/snapshots";
import type { Features, Prices, Segment } from "../src/lib/segments";
import type { Leakages } from "../src/lib/waterfall";
import { buildGuardrailSummary } from "../src/lib/viewModels";

const N = 10_000;

const FALLBACK_FEATURES: Features = {
  featA: { good: 1, better: 1, best: 1 },
  featB: { good: 0, better: 1, best: 1 },
};

const ZERO_LEAK: Leakages = {
  promo: { good: 0, better: 0, best: 0 },
  volume: { good: 0, better: 0, best: 0 },
  paymentPct: 0,
  paymentFixed: 0,
  fxPct: 0,
  refundsPct: 0,
};

const fmtLadder = (p: Prices) => `$${p.good.toFixed(2)}/$${p.better.toFixed(2)}/$${p.best.toFixed(2)}`;
const fmtMoney = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(Math.round(n)).toLocaleString()}`;
const fmtPct = (n: number) => `${Math.round(n * 1000) / 10}%`;

let hasMismatch = false;

for (const preset of PRESETS) {
  const constraints = preset.optConstraints as Constraints;
  const ranges = preset.optRanges as SearchRanges;
  const features: Features = preset.features ?? FALLBACK_FEATURES;
  const segments: Segment[] = preset.segments ?? [];
  const leak: Leakages = preset.leak ?? ZERO_LEAK;
  const usePocketProfit = !!constraints.usePocketProfit;
  const usePocketMargins = !!constraints.usePocketMargins;

  const baselineKpis = kpisFromSnapshot(
    {
      prices: preset.prices,
      costs: preset.costs,
      features,
      segments,
      refPrices: preset.refPrices,
      leak,
    },
    N,
    usePocketProfit,
    usePocketMargins
  );

  const opt = gridSearch(ranges, preset.costs, features, segments, preset.refPrices, N, constraints, leak);
  const optimizedKpis = kpisFromSnapshot(
    {
      prices: opt.prices,
      costs: preset.costs,
      features,
      segments,
      refPrices: preset.refPrices,
      leak,
    },
    N,
    usePocketProfit,
    usePocketMargins
  );

  const profitDelta = optimizedKpis.profit - baselineKpis.profit;
  const profitMismatch = Math.abs(opt.profit - optimizedKpis.profit);
  if (profitMismatch > 0.01) {
    hasMismatch = true;
  }

  const guardrails = buildGuardrailSummary({
    activePrices: opt.prices,
    constraints,
    ranges,
    hasOptimizer: true,
  });

  const explainLines = explainOptimizerResult({
    basePrices: preset.prices,
    optimizedPrices: opt.prices,
    costs: preset.costs,
    leak,
    constraints: {
      gapGB: constraints.gapGB,
      gapBB: constraints.gapBB,
      marginFloor: constraints.marginFloor,
      usePocketMargins: constraints.usePocketMargins,
      usePocketProfit: constraints.usePocketProfit,
    },
    profitDelta,
  });

  console.log(`\n=== ${preset.name} ===`);
  console.log(`Basis: ${usePocketProfit ? "pocket profit" : "list profit"} | N=${N.toLocaleString()}`);
  console.log(`Baseline ladder:  ${fmtLadder(preset.prices)} | profit ${fmtMoney(baselineKpis.profit)} | none ${fmtPct(baselineKpis.shares.none)}`);
  console.log(`Optimized ladder: ${fmtLadder(opt.prices)} | profit ${fmtMoney(optimizedKpis.profit)} (${fmtMoney(profitDelta)}) | none ${fmtPct(optimizedKpis.shares.none)}`);
  console.log(`Guardrails: ${guardrails.gapLine} | ${guardrails.floorLine}`);
  console.log(`Diag: tested=${opt.diagnostics.tested.toLocaleString()} coarsened=${opt.diagnostics.coarsened} skipped=${opt.diagnostics.skippedGuardrails.toLocaleString()}`);
  console.log(`Explain: ${explainLines[0] ?? "(no explain)"}`);

  if (profitMismatch > 0.01) {
    console.warn(
      `WARN: profit mismatch: gridSearch=${opt.profit.toFixed(6)} vs KPIs=${optimizedKpis.profit.toFixed(6)} (Δ=${profitMismatch.toFixed(6)})`
    );
  }
}

if (hasMismatch) {
  console.warn("\nWARN: one or more presets had a profit mismatch between gridSearch and KPI reconstruction.");
  process.exitCode = 1;
}
