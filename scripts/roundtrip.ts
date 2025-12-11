/* eslint-disable no-console */
// Lightweight round-trip validation script for presets and defaults.
import { PRESETS } from "../src/lib/presets";
import { defaultSegments, type Features, type Prices } from "../src/lib/segments";
import { LEAK_PRESETS } from "../src/lib/waterfallPresets";
import { buildPayloadFromScenario, runRoundTripSuite } from "../src/lib/share";

const defaultFeatures: Features = {
  featA: { good: 1, better: 1, best: 1 },
  featB: { good: 0, better: 1, best: 1 },
};
const defaultPrices: Prices = { good: 9, better: 15, best: 25 };
const defaultCosts: Prices = { good: 3, better: 5, best: 8 };
const defaultLeak = LEAK_PRESETS[Object.keys(LEAK_PRESETS)[0]];
const defaultRanges = { good: [5, 25] as [number, number], better: [10, 35] as [number, number], best: [15, 50] as [number, number], step: 1 };
const defaultConstraints = {
  gapGB: 1,
  gapBB: 1,
  marginFloor: { good: 0.2, better: 0.2, best: 0.2 },
  charm: false,
  usePocketProfit: false,
  usePocketMargins: false,
};

function payloadFromPreset(p: (typeof PRESETS)[number]) {
  return buildPayloadFromScenario(p, {
    prices: defaultPrices,
    costs: defaultCosts,
    refPrices: p.refPrices ?? p.prices ?? defaultPrices,
    features: p.features ?? defaultFeatures,
    leak: p.leak ?? defaultLeak,
    segments: p.segments ?? defaultSegments,
    priceRange: p.priceRange ? { map: p.priceRange, source: p.priceRangeSource ?? "shared" } : null,
    optRanges: p.optRanges ?? defaultRanges,
    optConstraints: p.optConstraints ?? defaultConstraints,
    channelMix: p.channelMix ?? [],
    uncertainty: p.uncertainty ?? null,
    retentionPct: p.retentionPct ?? 0,
    retentionMonths: p.retentionMonths ?? 12,
    kpiFloorAdj: p.kpiFloorAdj ?? 0,
    tornadoDefaults: {
      usePocket: true,
      priceBump: 0,
      pctBump: 0,
      rangeMode: "data",
      metric: "profit",
      valueMode: "absolute",
    },
    optimizerKind: "grid-inline",
  });
}

async function main() {
  const limit = Number(process.env.PRESET_LIMIT ?? 5);
  const items = PRESETS.slice(0, Number.isFinite(limit) ? limit : 5).map((p, idx) => ({
    label: p.id ?? p.name ?? `preset-${idx}`,
    payload: payloadFromPreset(p),
  }));
  const suite = runRoundTripSuite(items);
  if (suite.ok) {
    console.log(`✅ Round-trip check passed for ${items.length} scenarios.`);
    return;
  }
  console.error("❌ Round-trip issues detected:");
  suite.issues.forEach((issue) => {
    console.error(`- ${issue.label}: ${issue.issues.join("; ")}`);
  });
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Round-trip script failed:", err);
  process.exitCode = 1;
});
