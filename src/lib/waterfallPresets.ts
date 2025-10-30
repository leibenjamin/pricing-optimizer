// src/lib/waterfallPresets.ts
import type { Leakages } from "./waterfall";
export const LEAK_PRESETS: Record<string, Leakages> = {
  "Stripe (cards)": {
    promo:{good:0.05,better:0.05,best:0.05},
    volume:{good:0.03,better:0.03,best:0.03},
    paymentPct:0.029,paymentFixed:0.10,fxPct:0.01,refundsPct:0.02
  },
  "App Store (est.)": {
    promo:{good:0.05,better:0.05,best:0.05},
    volume:{good:0.03,better:0.03,best:0.03},
    paymentPct:0.15,paymentFixed:0,fxPct:0.00,refundsPct:0.02
  },
  "Shopify (Basic+Stripe)": {
    promo:{good:0.05,better:0.05,best:0.05},
    volume:{good:0.03,better:0.03,best:0.03},
    paymentPct:0.029,paymentFixed:0.30,fxPct:0.012,refundsPct:0.02
  },
};
