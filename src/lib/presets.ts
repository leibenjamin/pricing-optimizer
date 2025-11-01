// src/lib/presets.ts
import type { Leakages } from "./waterfall";

export type Preset = {
  id: string;
  name: string;
  prices:   { good: number; better: number; best: number };
  costs:    { good: number; better: number; best: number };
  refPrices:{ good: number; better: number; best: number };
  leak: Leakages;               // <-- use the same shape as the app
  note?: string;
};

// helper to make tier-equal promo/volume quickly
const sameTier = (v: number) => ({ good: v, better: v, best: v });

export const PRESETS: Preset[] = [
  {
    id: "saas-monthly",
    name: "SaaS (Monthly, Stripe)",
    prices:   { good: 10, better: 20, best: 40 },
    costs:    { good: 3,  better: 5,  best: 8  },
    refPrices:{ good: 12, better: 24, best: 45 },
    leak: {
      promo: sameTier(0.05),
      volume: sameTier(0.00),
      paymentPct: 0.029,
      paymentFixed: 0.30,
      fxPct: 0.00,
      refundsPct: 0.02,
    },
    note: "Stripe 2.9% + $0.30; light promos; low refunds.",
  },
  {
    id: "mobile-app",
    name: "Mobile App (App Store 30%)",
    prices:   { good: 3.99, better: 7.99, best: 14.99 },
    costs:    { good: 0.5,  better: 0.8,  best: 1.2  },
    refPrices:{ good: 3.99, better: 7.99, best: 14.99 },
    leak: {
      promo: sameTier(0.00),
      volume: sameTier(0.00),
      paymentPct: 0.30,
      paymentFixed: 0.00,
      fxPct: 0.00,
      refundsPct: 0.015,
    },
    note: "App Store/Play 30% rev share.",
  },
  {
    id: "shopify-dtc",
    name: "Shopify DTC (Discount & FX)",
    prices:   { good: 25, better: 40, best: 70 },
    costs:    { good: 12, better: 18, best: 32 },
    refPrices:{ good: 29, better: 45, best: 79 },
    leak: {
      promo: sameTier(0.10),
      volume: sameTier(0.05),
      paymentPct: 0.027,
      paymentFixed: 0.30,
      fxPct: 0.02,
      refundsPct: 0.05,
    },
    note: "Frequent promos, cross-border FX, higher refunds.",
  },
  {
    id: "b2b-annual",
    name: "B2B (Annual, Procurement)",
    prices:   { good: 990, better: 2490, best: 4990 },
    costs:    { good: 200, better: 600,  best: 1200 },
    refPrices:{ good: 1200, better: 2800, best: 5200 },
    leak: {
      promo: sameTier(0.00),
      volume: sameTier(0.15),
      paymentPct: 0.015,
      paymentFixed: 0.00,
      fxPct: 0.00,
      refundsPct: 0.00,
    },
    note: "Volume rebates via procurement; low refunds.",
  },
];
