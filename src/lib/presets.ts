// src/lib/presets.ts
import type { Leakages } from "./waterfall";
import type { Features, Prices, Segment } from "./segments";
import type { SearchRanges } from "./optimize";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import { blendLeakPresets } from "./waterfallPresets";

export type Preset = {
  id: string;
  name: string;
  prices: Prices;
  costs: Prices;
  refPrices: Prices;
  leak: Leakages; // <-- use the same shape as the app
  features?: Features;
  segments?: Segment[];
  channelMix?: Array<{ preset: string; w: number }>;
  priceRange?: TierRangeMap;
  priceRangeSource?: PriceRangeSource;
  priceScale?: number; // optional scale applied to segment price sensitivity (betaPrice)
  uncertainty?: { priceScaleDelta?: number; leakDeltaPct?: number };
  optRanges?: SearchRanges;
  optConstraints?: {
    gapGB: number;
    gapBB: number;
    marginFloor: Prices;
    charm?: boolean;
    usePocketMargins?: boolean;
    usePocketProfit?: boolean;
    maxNoneShare?: number;
    minTakeRate?: number;
  };
  tornado?: {
    usePocket?: boolean;
    priceBump?: number;
    pctBump?: number;
    rangeMode?: "symmetric" | "data";
    metric?: "profit" | "revenue";
    valueMode?: "absolute" | "percent";
  };
  retentionPct?: number;
  kpiFloorAdj?: number;
  note?: string;
};

// helper to make tier-equal promo/volume quickly
const sameTier = (v: number) => ({ good: v, better: v, best: v });

export const PRESETS: Preset[] = [
  {
    id: "saas-team",
    name: "SaaS Team Seats (Stripe + trials)",
    prices: { good: 12, better: 24, best: 52 },
    costs: { good: 4, better: 7, best: 12 },
    refPrices: { good: 13, better: 26, best: 55 }, // anchor near current ladder but not identical
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    priceScale: 0.7, // moderate sensitivity so modest moves can win share
    uncertainty: { priceScaleDelta: 0.12, leakDeltaPct: 0.02 },
    segments: [
      { name: "Budget self-serve", weight: 0.45, betaPrice: -0.34, betaFeatA: 0.45, betaFeatB: 0.30, betaNone: 0.22, alphaAnchor: 0.16, lambdaLoss: 1.55 },
      { name: "Growth teams", weight: 0.35, betaPrice: -0.25, betaFeatA: 0.65, betaFeatB: 0.65, betaNone: 0.08, alphaAnchor: 0.16, lambdaLoss: 1.45 },
      { name: "Proof-of-concept", weight: 0.20, betaPrice: -0.2, betaFeatA: 0.85, betaFeatB: 0.90, betaNone: -0.15, alphaAnchor: 0.14, lambdaLoss: 1.35 },
    ],
    leak: {
      promo: { good: 0.08, better: 0.05, best: 0.03 },
      volume: { good: 0.00, better: 0.02, best: 0.04 },
      paymentPct: 0.029,
      paymentFixed: 0.30,
      fxPct: 0.00,
      refundsPct: 0.03,
    },
    priceRange: {
      good: { min: 10.5, max: 14 },
      better: { min: 21, max: 32 },
      best: { min: 46, max: 66 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [10.5, 13.5], better: [21, 30], best: [46, 62], step: 0.5 },
    optConstraints: {
      gapGB: 3,
      gapBB: 9,
      marginFloor: { good: 0.26, better: 0.34, best: 0.42 },
      charm: true,
      usePocketMargins: true,
      usePocketProfit: true,
      maxNoneShare: 0.85,
      minTakeRate: 0.05,
    },
    tornado: { usePocket: true, priceBump: 12, pctBump: 3, rangeMode: "data" },
    retentionPct: 94,
    kpiFloorAdj: 1,
    note: "Self-serve SaaS with trials; optimizer runs on pocket profit with gap floors and charm pricing.",
  },
  {
    id: "mobile-app",
    name: "Mobile app (App Store + web upsell)",
    prices: { good: 3.99, better: 7.99, best: 15.99 },
    costs: { good: 0.45, better: 0.8, best: 1.3 },
    refPrices: { good: 4.49, better: 8.49, best: 17.49 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    priceScale: 0.4,
    segments: [
      { name: "Casual users", weight: 0.50, betaPrice: -0.48, betaFeatA: 0.25, betaFeatB: 0.15, betaNone: 0.70, alphaAnchor: 0.22, lambdaLoss: 1.8 },
      { name: "Hobbyist", weight: 0.30, betaPrice: -0.36, betaFeatA: 0.55, betaFeatB: 0.55, betaNone: 0.20, alphaAnchor: 0.26, lambdaLoss: 1.6 },
      { name: "Prosumer", weight: 0.20, betaPrice: -0.30, betaFeatA: 0.85, betaFeatB: 0.75, betaNone: -0.10, alphaAnchor: 0.30, lambdaLoss: 1.55 },
    ],
    channelMix: [
      { preset: "App Store (est.)", w: 65 },
      { preset: "Stripe (cards)", w: 35 },
    ],
    leak: (() => {
      const blended = blendLeakPresets([
        { preset: "App Store (est.)", w: 65 },
        { preset: "Stripe (cards)", w: 35 },
      ]);
      return {
        ...blended,
        promo: { good: 0.0, better: 0.02, best: 0.04 },
        volume: sameTier(0.0),
        refundsPct: 0.018,
      };
    })(),
    priceRange: {
      good: { min: 3.0, max: 6.0 },
      better: { min: 6.0, max: 12.5 },
      best: { min: 11.5, max: 21.0 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [3.49, 5.99], better: [6.49, 12.49], best: [11.49, 20.99], step: 0.5 },
    optConstraints: {
      gapGB: 1.25,
      gapBB: 3.25,
      marginFloor: { good: 0.28, better: 0.34, best: 0.40 },
      charm: true,
      usePocketMargins: true,
      usePocketProfit: true,
      maxNoneShare: 0.85,
      minTakeRate: 0.05,
    },
    tornado: { usePocket: true, priceBump: 18, pctBump: 1.5, rangeMode: "data" },
    retentionPct: 96,
    kpiFloorAdj: -2,
    note: "App Store heavy with a web upsell. Uses pocket profit, tight gaps, and a wide sensitivity span to show platform fee impact.",
  },
  {
    id: "shopify-dtc",
    name: "Shopify DTC (Discount & FX)",
    prices: { good: 28, better: 52, best: 98 },
    costs: { good: 12, better: 22, best: 40 },
    refPrices: { good: 28, better: 54, best: 110 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    priceScale: 0.55,
    uncertainty: { priceScaleDelta: 0.12, leakDeltaPct: 0.03 },
    segments: [
      { name: "Bargain hunters", weight: 0.40, betaPrice: -0.34, betaFeatA: 0.35, betaFeatB: 0.18, betaNone: 0.20, alphaAnchor: 0.10, lambdaLoss: 1.35 },
      { name: "Omni shopper", weight: 0.35, betaPrice: -0.22, betaFeatA: 0.55, betaFeatB: 0.50, betaNone: 0.08, alphaAnchor: 0.10, lambdaLoss: 1.32 },
      { name: "Premium gifter", weight: 0.25, betaPrice: -0.17, betaFeatA: 0.85, betaFeatB: 0.75, betaNone: -0.10, alphaAnchor: 0.08, lambdaLoss: 1.28 },
    ],
    channelMix: [
      { preset: "Shopify (Basic+Stripe)", w: 60 },
      { preset: "Stripe (cards)", w: 40 },
    ],
    leak: (() => {
      const blended = blendLeakPresets([
        { preset: "Shopify (Basic+Stripe)", w: 60 },
        { preset: "Stripe (cards)", w: 40 },
      ]);
      return {
        ...blended,
        promo: { good: 0.10, better: 0.08, best: 0.06 },
        volume: { good: 0.05, better: 0.04, best: 0.03 },
        fxPct: 0.025,
        refundsPct: 0.04,
      };
    })(),
    priceRange: {
      good: { min: 24, max: 38 },
      better: { min: 46, max: 82 },
      best: { min: 100, max: 140 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [26, 34], better: [50, 74], best: [108, 136], step: 2 },
    optConstraints: {
      gapGB: 4,
      gapBB: 9,
      marginFloor: { good: 0.24, better: 0.30, best: 0.38 },
      charm: false,
      usePocketMargins: true,
      usePocketProfit: true,
      maxNoneShare: 0.85,
      minTakeRate: 0.05,
    },
    tornado: { usePocket: true, priceBump: 15, pctBump: 3.5, rangeMode: "data" },
    retentionPct: 89,
    kpiFloorAdj: 3,
    note: "Cross-border DTC with promos and FX spread; optimizer uses pocket profit with tighter floor sensitivity.",
  },
  {
    id: "b2b-annual",
    name: "B2B (Annual, procurement)",
    prices: { good: 1100, better: 2600, best: 5200 },
    costs: { good: 260, better: 720, best: 1400 },
    refPrices: { good: 1150, better: 2700, best: 5400 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    segments: [
      { name: "Procurement guardrail", weight: 0.45, betaPrice: -0.0016, betaFeatA: 0.60, betaFeatB: 0.50, betaNone: 0.65, alphaAnchor: 0.00055, lambdaLoss: 1.35 },
      { name: "Ops lead", weight: 0.35, betaPrice: -0.0013, betaFeatA: 0.85, betaFeatB: 0.65, betaNone: 0.25, alphaAnchor: 0.0005, lambdaLoss: 1.28 },
      { name: "Exec sponsor", weight: 0.20, betaPrice: -0.001, betaFeatA: 1.05, betaFeatB: 0.95, betaNone: 0.00, alphaAnchor: 0.00045, lambdaLoss: 1.2 },
    ],
    leak: {
      promo: { good: 0.02, better: 0.08, best: 0.12 },
      volume: { good: 0.00, better: 0.10, best: 0.15 },
      paymentPct: 0.02,
      paymentFixed: 0.10,
      fxPct: 0.01,
      refundsPct: 0.01,
    },
    priceRange: {
      good: { min: 1050, max: 1250 },
      better: { min: 2400, max: 3000 },
      best: { min: 5200, max: 6600 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [1100, 1180], better: [2400, 2550], best: [5500, 6500], step: 100 },
    optConstraints: {
      gapGB: 500,
      gapBB: 1300,
      marginFloor: { good: 0.5, better: 0.55, best: 0.6 },
      charm: false,
      usePocketMargins: false,
      usePocketProfit: false,
      maxNoneShare: 0.65,
      minTakeRate: 0.08,
    },
    tornado: { usePocket: true, priceBump: 10, pctBump: 2.5, rangeMode: "data" },
    retentionPct: 95,
    kpiFloorAdj: 0,
    note: "Enterprise annual deals with structured volume rebates; optimizer runs on list profit with wide ranges and large tier gaps. Price sensitivity and anchoring are scaled for $1k-$7k ladders so frontier/tornado stay meaningful.",
  },
  {
    id: "freemium-app",
    name: "Freemium app (Good = free)",
    prices: { good: 0, better: 6.99, best: 12.99 },
    costs: { good: 0.25, better: 0.8, best: 1.2 },
    refPrices: { good: 0, better: 7.99, best: 13.99 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    priceScale: 0.35,
    segments: [
      { name: "Free-first", weight: 0.55, betaPrice: -0.6, betaFeatA: 0.25, betaFeatB: 0.2, betaNone: 0.8, alphaAnchor: 0.2, lambdaLoss: 1.9 },
      { name: "Upgrade curious", weight: 0.30, betaPrice: -0.4, betaFeatA: 0.65, betaFeatB: 0.55, betaNone: 0.2, alphaAnchor: 0.3, lambdaLoss: 1.7 },
      { name: "Power user", weight: 0.15, betaPrice: -0.25, betaFeatA: 0.9, betaFeatB: 0.8, betaNone: -0.05, alphaAnchor: 0.35, lambdaLoss: 1.5 },
    ],
    channelMix: [
      { preset: "App Store (est.)", w: 70 },
      { preset: "Stripe (cards)", w: 30 },
    ],
    leak: (() => {
      const blended = blendLeakPresets([
        { preset: "App Store (est.)", w: 70 },
        { preset: "Stripe (cards)", w: 30 },
      ]);
      return {
        ...blended,
        promo: { good: 0.0, better: 0.02, best: 0.04 },
        volume: sameTier(0.0),
        refundsPct: 0.02,
      };
    })(),
    priceRange: {
      good: { min: 0, max: 0 },
      better: { min: 4.99, max: 10.99 },
      best: { min: 8.99, max: 16.99 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [0, 0], better: [4.49, 11.99], best: [8.49, 18.99], step: 0.5 },
    optConstraints: {
      gapGB: 2,
      gapBB: 4,
      marginFloor: { good: 0.05, better: 0.35, best: 0.4 },
      charm: true,
      usePocketMargins: true,
      usePocketProfit: true,
      maxNoneShare: 0.75,
      minTakeRate: 0.06,
    },
    tornado: { usePocket: true, priceBump: 15, pctBump: 2, rangeMode: "data" },
    retentionPct: 95,
    kpiFloorAdj: -1,
    note: "Freemium with Good locked at $0; optimizer only tunes Better/Best within guardrails to show upgrade economics.",
  },
];
