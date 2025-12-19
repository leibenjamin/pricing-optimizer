// scripts/csv-roundtrip.ts
// Quick CSV round-trip check: export payload to CSV and parse it back to ensure fields survive.
import { PRESETS } from "../src/lib/presets";
import { defaultSegments, type Features, type Prices } from "../src/lib/segments";
import { LEAK_PRESETS } from "../src/lib/waterfallPresets";
import { buildScenarioCsv, buildPayloadFromScenario } from "../src/lib/share";
import { importScenarioCSV } from "../src/lib/csv";

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
    coverageUsePocket: p.optConstraints?.usePocketMargins ?? defaultConstraints.usePocketMargins,
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

function checkParsed(label: string, csv: string, source: ReturnType<typeof payloadFromPreset>) {
  const parsed = importScenarioCSV(csv);
  const issues: string[] = [];
  if (!parsed.prices) issues.push("prices missing");
  if (!parsed.costs) issues.push("costs missing");
  if (!parsed.leak) issues.push("leak missing");
  if (!parsed.segments || parsed.segments.length === 0) issues.push("segments missing");
  // Optional fields: if they existed in the source, ensure we parsed something for them.
  if (source.channelMix?.length && !(parsed.channelMix && parsed.channelMix.length)) {
    issues.push("channelMix missing");
  }
  if (source.analysis?.optConstraints && !parsed.optConstraints) {
    issues.push("constraints missing");
  }
  if (source.analysis?.optRanges && !parsed.optRanges) {
    issues.push("ranges missing");
  }
  if (source.analysis?.priceRange && !parsed.priceRange) {
    issues.push("priceRange missing");
  }
  if (source.uncertainty && !parsed.uncertainty) {
    issues.push("uncertainty missing");
  }
  if (source.analysis?.optimizerKind && !parsed.optimizerKind) {
    issues.push("optimizerKind missing");
  }
  if (issues.length) {
    console.error(`❌ CSV round-trip ${label}: ${issues.join("; ")}`);
    return false;
  }
  return true;
}

async function main() {
  const limit = Number(process.env.PRESET_LIMIT ?? 5);
  const presets = PRESETS.slice(0, Number.isFinite(limit) ? limit : 5);
  let allOk = true;
  presets.forEach((p, idx) => {
    const label = p.id ?? p.name ?? `preset-${idx}`;
    const payload = payloadFromPreset(p);
    const csv = buildScenarioCsv(payload);
    const ok = checkParsed(label, csv, payload);
    if (!ok) allOk = false;
  });
  if (allOk) {
    console.log(`✅ CSV round-trip passed for ${presets.length} presets`);
  } else {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("CSV round-trip script failed:", err);
  process.exitCode = 1;
});
