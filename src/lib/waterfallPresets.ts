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

// Weighted blend of leakage presets (percent terms weighted linearly; fixed fee weighted avg).
export function blendLeakPresets(rows: { w: number; preset: string }[]): Leakages {
  const safeRows = rows.filter((r) => LEAK_PRESETS[r.preset] && r.w > 0);
  if (safeRows.length === 0) {
    return LEAK_PRESETS[Object.keys(LEAK_PRESETS)[0]];
  }

  const init = JSON.parse(JSON.stringify(LEAK_PRESETS[safeRows[0].preset])) as Leakages;
  const acc = init;
  let total = safeRows[0].w;

  for (let i = 1; i < safeRows.length; i++) {
    const { w, preset } = safeRows[i];
    const L = LEAK_PRESETS[preset];
    total += w;
    (["promo", "volume"] as const).forEach((k) => {
      (["good", "better", "best"] as const).forEach((t) => {
        acc[k][t] = acc[k][t] * ((total - w) / total) + L[k][t] * (w / total);
      });
    });
    acc.paymentPct = acc.paymentPct * ((total - w) / total) + L.paymentPct * (w / total);
    acc.paymentFixed = acc.paymentFixed * ((total - w) / total) + L.paymentFixed * (w / total);
    acc.fxPct = acc.fxPct * ((total - w) / total) + L.fxPct * (w / total);
    acc.refundsPct = acc.refundsPct * ((total - w) / total) + L.refundsPct * (w / total);
  }
  return acc;
}
