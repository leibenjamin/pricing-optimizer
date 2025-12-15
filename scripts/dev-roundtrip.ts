// scripts/dev-roundtrip.ts
import { devValidatePresetRoundTrips, buildPayloadFromScenario } from "../src/lib/share.ts";
import { PRESETS } from "../src/lib/presets.ts";
import type { ScenarioUncertainty } from "../src/lib/domain";

// Build payloads from presets with safe fallbacks; mirrors scripts/roundtrip.
const defaults = PRESETS[0];
const baseFallback = {
  prices: defaults.prices,
  costs: defaults.costs,
  refPrices: defaults.refPrices,
  features: defaults.features!,
  leak: defaults.leak,
  segments: defaults.segments!,
  optRanges: defaults.optRanges!,
  optConstraints: defaults.optConstraints!,
  priceRange: defaults.priceRange ? { map: defaults.priceRange, source: defaults.priceRangeSource ?? "shared" } : null,
  channelMix: defaults.channelMix ?? [],
  uncertainty: defaults.uncertainty ?? null,
  retentionPct: defaults.retentionPct ?? 94,
  retentionMonths: defaults.retentionMonths ?? 12,
  kpiFloorAdj: defaults.kpiFloorAdj ?? 0,
  tornadoDefaults: defaults.tornado ?? {},
  optimizerKind: "grid-inline" as const,
};

const presetPayloads = PRESETS.map((p, idx) => ({
  id: p.id ?? `preset-${idx}`,
  name: p.name,
  payload: buildPayloadFromScenario(p, baseFallback),
}));

// Create a user-edited uncertainty variant based on the first preset.
const editedUnc: ScenarioUncertainty = {
  priceScaleDelta: 0.2,
  leakDeltaPct: 0.05,
  source: "user",
};
const editedPayload = buildPayloadFromScenario(
  { ...PRESETS[0], uncertainty: editedUnc },
  baseFallback
);

const result = devValidatePresetRoundTrips({ presets: presetPayloads, edited: editedPayload });

if (!result.ok) {
  console.error("Round-trip issues detected:\n" + JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
console.log("Round-trip validation passed for presets and edited uncertainty.");
