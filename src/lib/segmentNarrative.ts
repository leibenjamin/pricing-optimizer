// src/lib/segmentNarrative.ts

// Helper to narrate segment behavior away from component files (keeps fast-refresh clean)
import type { Segment } from "./segments";

const clampPct = (x: number) => Math.max(0, Math.min(100, Math.round(x * 100)));

export function describeSegment(seg: Segment): string[] {
  const lines: string[] = [];
  const price = Math.abs(seg.betaPrice);
  if (price >= 0.22) {
    lines.push("Extremely price-sensitive; even small list moves change take-rate.");
  } else if (price >= 0.16) {
    lines.push("Price-aware but will trade up if the bundle feels superior.");
  } else if (price >= 0.10) {
    lines.push("Balances price and value; charm pricing helps more than deep cuts.");
  } else {
    lines.push("Value-first; comfortable paying for differentiated tiers.");
  }

  const featGap = seg.betaFeatA - seg.betaFeatB;
  if (Math.abs(featGap) < 0.05) {
    lines.push("Cares about Feature A + B evenly -- mention both benefits when pitching.");
  } else if (featGap > 0) {
    lines.push("Feature A is the upgrade trigger; highlight that story when nudging them up.");
  } else {
    lines.push("Feature B is the differentiator; bundle services add-ons to win them over.");
  }

  const anchor = seg.alphaAnchor ?? 0;
  const loss = seg.lambdaLoss ?? 1;
  if (anchor > 0.12) {
    lines.push("Anchored on reference prices -- list vs pocket messaging matters.");
  }
  if (loss > 1.35) {
    lines.push("Loss-averse: offer give-back guarantees or promo safety nets.");
  }

  return lines.slice(0, 3);
}

export function segmentWeightPct(seg: Segment) {
  return clampPct(seg.weight);
}
