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
    refPrices: { good: 15, better: 29, best: 59 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    segments: [
      { name: "Budget self-serve", weight: 0.45, betaPrice: -0.24, betaFeatA: 0.45, betaFeatB: 0.30, betaNone: 0.55, alphaAnchor: 0.20, lambdaLoss: 1.55 },
      { name: "Growth teams", weight: 0.35, betaPrice: -0.16, betaFeatA: 0.65, betaFeatB: 0.65, betaNone: 0.15, alphaAnchor: 0.25, lambdaLoss: 1.35 },
      { name: "Proof-of-concept", weight: 0.20, betaPrice: -0.10, betaFeatA: 0.85, betaFeatB: 0.90, betaNone: -0.05, alphaAnchor: 0.30, lambdaLoss: 1.20 },
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
      good: { min: 10, max: 18 },
      better: { min: 19, max: 39 },
      best: { min: 42, max: 86 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [10, 22], better: [20, 42], best: [40, 88], step: 1 },
    optConstraints: {
      gapGB: 4,
      gapBB: 12,
      marginFloor: { good: 0.45, better: 0.52, best: 0.58 },
      charm: true,
      usePocketMargins: true,
      usePocketProfit: true,
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
    refPrices: { good: 4.99, better: 9.99, best: 18.99 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    segments: [
      { name: "Casual users", weight: 0.50, betaPrice: -0.30, betaFeatA: 0.25, betaFeatB: 0.15, betaNone: 0.70, alphaAnchor: 0.05, lambdaLoss: 1.50 },
      { name: "Hobbyist", weight: 0.30, betaPrice: -0.18, betaFeatA: 0.55, betaFeatB: 0.55, betaNone: 0.20, alphaAnchor: 0.10, lambdaLoss: 1.35 },
      { name: "Prosumer", weight: 0.20, betaPrice: -0.12, betaFeatA: 0.85, betaFeatB: 0.75, betaNone: -0.10, alphaAnchor: 0.20, lambdaLoss: 1.25 },
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
      good: { min: 2.99, max: 5.99 },
      better: { min: 6.49, max: 11.99 },
      best: { min: 11.99, max: 21.99 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [2.49, 6.49], better: [5.49, 11.99], best: [10.99, 21.99], step: 0.5 },
    optConstraints: {
      gapGB: 1.5,
      gapBB: 3.5,
      marginFloor: { good: 0.35, better: 0.40, best: 0.45 },
      charm: true,
      usePocketMargins: true,
      usePocketProfit: true,
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
    refPrices: { good: 32, better: 60, best: 110 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    segments: [
      { name: "Bargain hunters", weight: 0.40, betaPrice: -0.28, betaFeatA: 0.35, betaFeatB: 0.18, betaNone: 0.55, alphaAnchor: 0.12, lambdaLoss: 1.45 },
      { name: "Omni shopper", weight: 0.35, betaPrice: -0.18, betaFeatA: 0.55, betaFeatB: 0.50, betaNone: 0.10, alphaAnchor: 0.20, lambdaLoss: 1.30 },
      { name: "Premium gifter", weight: 0.25, betaPrice: -0.10, betaFeatA: 0.85, betaFeatB: 0.75, betaNone: -0.15, alphaAnchor: 0.18, lambdaLoss: 1.20 },
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
        promo: { good: 0.14, better: 0.10, best: 0.08 },
        volume: { good: 0.06, better: 0.05, best: 0.04 },
        fxPct: 0.025,
        refundsPct: 0.06,
      };
    })(),
    priceRange: {
      good: { min: 22, max: 38 },
      better: { min: 48, max: 82 },
      best: { min: 90, max: 150 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [22, 44], better: [44, 84], best: [84, 150], step: 2 },
    optConstraints: {
      gapGB: 6,
      gapBB: 14,
      marginFloor: { good: 0.36, better: 0.42, best: 0.50 },
      charm: false,
      usePocketMargins: true,
      usePocketProfit: true,
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
    refPrices: { good: 1400, better: 3100, best: 5800 },
    features: {
      featA: { good: 1, better: 1, best: 1 },
      featB: { good: 0, better: 1, best: 1 },
    },
    segments: [
      { name: "Procurement guardrail", weight: 0.45, betaPrice: -0.0006, betaFeatA: 0.60, betaFeatB: 0.50, betaNone: 0.65, alphaAnchor: 0.0003, lambdaLoss: 1.08 },
      { name: "Ops lead", weight: 0.35, betaPrice: -0.00045, betaFeatA: 0.85, betaFeatB: 0.65, betaNone: 0.25, alphaAnchor: 0.00028, lambdaLoss: 1.07 },
      { name: "Exec sponsor", weight: 0.20, betaPrice: -0.0003, betaFeatA: 1.05, betaFeatB: 0.95, betaNone: 0.00, alphaAnchor: 0.00024, lambdaLoss: 1.05 },
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
      good: { min: 1000, max: 1500 },
      better: { min: 2200, max: 3800 },
      best: { min: 4300, max: 7000 },
    },
    priceRangeSource: "shared",
    optRanges: { good: [950, 1500], better: [2100, 3800], best: [4200, 7200], step: 150 },
    optConstraints: {
      gapGB: 500,
      gapBB: 1300,
      marginFloor: { good: 0.55, better: 0.60, best: 0.65 },
      charm: false,
      usePocketMargins: false,
      usePocketProfit: false,
      maxNoneShare: 0.7,
      minTakeRate: 0.08,
    },
    tornado: { usePocket: true, priceBump: 10, pctBump: 2.5, rangeMode: "data" },
    retentionPct: 95,
    kpiFloorAdj: 0,
    note: "Enterprise annual deals with structured volume rebates; optimizer runs on list profit with wide ranges and large tier gaps. Price sensitivity and anchoring are scaled for $1k-$7k ladders so frontier/tornado stay meaningful.",
  },
];
