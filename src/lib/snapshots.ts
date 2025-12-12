import { choiceShares } from "./choice";
import type { Constraints, SearchRanges } from "./optimize";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import type { Features, Segment, Prices } from "./segments";
import { computePocketPrice, type Leakages } from "./waterfall";
import type { TornadoValueMode } from "./tornadoView";
import type { TornadoMetric } from "./sensitivity";

export type NormalizedSegment = {
  weight: number;
  beta: { price: number; featA: number; featB: number; refAnchor?: number };
};

export type SnapshotKPIs = {
  profit: number;
  revenue: number;
  arpuActive: number;
  shares: { none: number; good: number; better: number; best: number };
  segShares?: number[];
  prices?: Prices;
  grossMarginPct?: number;
  title?: string;
  subtitle?: string;
};

export type ScenarioSnapshot = {
  prices: Prices;
  costs?: Prices;
  refPrices?: Prices;
  features?: Features;
  leak?: Leakages;
  segments?: NormalizedSegment[] | unknown;
  basis?: { usePocketProfit?: boolean; usePocketMargins?: boolean };
  kpis?: unknown;
  meta?: { label?: string; savedAt?: number; source?: string };
  channelMix?: Array<{ preset: string; w: number }>;
  uncertainty?: unknown;
  analysis?: {
    optConstraints?: Partial<Constraints>;
    optRanges?: SearchRanges;
    tornadoPocket?: boolean;
    tornadoPriceBump?: number;
    tornadoPctBump?: number;
    tornadoRangeMode?: "symmetric" | "data";
    tornadoMetric?: TornadoMetric;
    tornadoValueMode?: TornadoValueMode;
    retentionPct?: number;
    retentionMonths?: number;
    kpiFloorAdj?: number;
    priceRange?: TierRangeMap;
    priceRangeSource?: PriceRangeSource;
    optimizerKind?: "grid-worker" | "grid-inline" | "future";
    channelMix?: Array<{ preset: string; w: number }>;
    uncertainty?: unknown;
  };
};

export type ScenarioImport = ScenarioSnapshot;

const toFinite = (n: unknown): number | null => {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
};

export function normalizeSegmentsForSave(segs: unknown): NormalizedSegment[] {
  if (!Array.isArray(segs)) return [];
  const out: NormalizedSegment[] = [];
  for (const s of segs) {
    if (!s || typeof s !== "object") continue;
    const ss = s as Record<string, unknown>;
    const beta = ss["beta"] as Record<string, unknown> | undefined;
    const weight = toFinite(ss["weight"]);
    const price = beta ? toFinite(beta["price"]) : toFinite(ss["price"]);
    const featA = beta ? toFinite(beta["featA"]) : toFinite(ss["featA"]);
    const featB = beta ? toFinite(beta["featB"]) : toFinite(ss["featB"]);
    const refAnchor = beta ? toFinite(beta["refAnchor"]) : toFinite(ss["refAnchor"]);
    if (
      weight === null ||
      price === null ||
      featA === null ||
      featB === null
    )
      continue;
    out.push({
      weight,
      beta: {
        price,
        featA,
        featB,
        ...(refAnchor !== null ? { refAnchor } : {}),
      },
    });
  }
  return out;
}

export function mapNormalizedToUI(norm: NormalizedSegment[]): Segment[] {
  return norm.map((s, i) => ({
    name: `Segment ${i + 1}`,
    weight: s.weight,
    betaPrice: s.beta.price,
    betaFeatA: s.beta.featA,
    betaFeatB: s.beta.featB,
    betaNone: 0,
    ...(s.beta.refAnchor !== undefined ? { betaRefAnchor: s.beta.refAnchor } : {}),
    alphaAnchor: 0,
    lambdaLoss: 1,
  }));
}

export type SnapshotBuildArgs = {
  prices: Prices;
  costs: Prices;
  features: Features;
  refPrices: Prices;
  leak: Leakages;
  segments: Segment[];
  tornadoPocket: boolean;
  tornadoPriceBump: number;
  tornadoPctBump: number;
  tornadoRangeMode: "symmetric" | "data";
  tornadoMetric: TornadoMetric;
  tornadoValueMode: TornadoValueMode;
  retentionPct: number;
  retentionMonths: number;
  kpiFloorAdj: number;
  priceRange: { map: TierRangeMap; source: PriceRangeSource } | null;
  optRanges: SearchRanges;
  optConstraints: Constraints;
  channelMix?: Array<{ preset: string; w: number }>;
  optimizerKind?: "grid-worker" | "grid-inline" | "future";
  uncertainty?: unknown;
};

export function buildScenarioSnapshot(args: SnapshotBuildArgs): ScenarioSnapshot {
  const segs = normalizeSegmentsForSave(args.segments);
  const channelMix = args.channelMix && args.channelMix.length ? args.channelMix : undefined;
  const uncertainty = args.uncertainty;
  return {
    prices: args.prices,
    costs: args.costs,
    features: args.features,
    refPrices: args.refPrices,
    leak: args.leak,
    ...(segs.length ? { segments: segs } : {}),
    ...(channelMix ? { channelMix } : {}),
    ...(uncertainty ? { uncertainty } : {}),
    analysis: {
      tornadoPocket: args.tornadoPocket,
      tornadoPriceBump: args.tornadoPriceBump,
      tornadoPctBump: args.tornadoPctBump,
      tornadoRangeMode: args.tornadoRangeMode,
      tornadoMetric: args.tornadoMetric,
      tornadoValueMode: args.tornadoValueMode,
      retentionPct: args.retentionPct,
      retentionMonths: args.retentionMonths,
      kpiFloorAdj: args.kpiFloorAdj,
      optRanges: args.optRanges,
      optConstraints: args.optConstraints,
      optimizerKind: args.optimizerKind ?? "grid-worker",
      ...(args.priceRange
        ? {
            priceRange: args.priceRange.map,
            priceRangeSource: args.priceRange.source,
          }
        : {}),
      ...(channelMix ? { channelMix } : {}),
      ...(uncertainty ? { uncertainty } : {}),
    },
  };
}

export const isScenarioImport = (x: unknown): x is ScenarioImport => {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.prices === "object";
};

export function kpisFromSnapshot(
  args: {
    prices: Prices;
    costs: Prices;
    features: Features;
    segments: Segment[];
    refPrices?: Prices;
    leak: Leakages;
  },
  N: number,
  usePocketProfit: boolean,
  usePocketMargins: boolean
): SnapshotKPIs {
  const shares = choiceShares(args.prices, args.features, args.segments, args.refPrices);
  const totalWeight = args.segments.reduce((s, seg) => s + (seg.weight ?? 0), 0);
  const segShares =
    totalWeight > 0
      ? args.segments.map((seg) => (seg.weight ?? 0) / totalWeight)
      : [];
  const units = {
    good: N * shares.good,
    better: N * shares.better,
    best: N * shares.best,
  };

  const listRevenue =
    args.prices.good * units.good +
    args.prices.better * units.better +
    args.prices.best * units.best;

  const pocketPrices = {
    good: computePocketPrice(args.prices.good, "good", args.leak).pocket,
    better: computePocketPrice(args.prices.better, "better", args.leak).pocket,
    best: computePocketPrice(args.prices.best, "best", args.leak).pocket,
  };

  const pocketRevenue =
    pocketPrices.good * units.good +
    pocketPrices.better * units.better +
    pocketPrices.best * units.best;

  const costTotal =
    args.costs.good * (usePocketMargins ? units.good : units.good) +
    args.costs.better * (usePocketMargins ? units.better : units.better) +
    args.costs.best * (usePocketMargins ? units.best : units.best);

  const revenue = usePocketProfit ? pocketRevenue : listRevenue;
  const profit = revenue - costTotal;
  const activeCustomers = N * (1 - shares.none);
  const arpuActive = activeCustomers > 0 ? revenue / activeCustomers : 0;
  const grossMarginPct = revenue > 0 ? (profit / revenue) * 100 : NaN;

  return {
    profit,
    revenue,
    arpuActive,
    shares,
    segShares,
    prices: args.prices,
    grossMarginPct,
  };
}
