// src/lib/coverage.ts
import { computePocketPrice, type Leakages } from "./waterfall";

export type Prices = { good: number; better: number; best: number };
export type Ranges = {
  good: [number, number];
  better: [number, number];
  best: [number, number];
  step: number;
};

export type Floors = { good: number; better: number; best: number };

export type Gaps = { gapGB: number; gapBB: number };

export function pocketCoverage(
  ranges: Ranges,
  costs: Prices,
  floors: Floors,
  gaps: Gaps,
  leak: Leakages
): { coverage: number; tested: number } {
  let ok = 0;
  let tested = 0;
  const step = Math.max(0.5, ranges.step); // safety

  for (let g = ranges.good[0]; g <= ranges.good[1]; g += step) {
    const bStart = Math.max(g + (gaps.gapGB ?? 0), ranges.better[0]);
    for (let b = bStart; b <= ranges.better[1]; b += step) {
      const hStart = Math.max(b + (gaps.gapBB ?? 0), ranges.best[0]);
      for (let h = hStart; h <= ranges.best[1]; h += step) {
        // pocket price at each tier
        const pG = computePocketPrice(g, "good", leak).pocket;
        const pB = computePocketPrice(b, "better", leak).pocket;
        const pH = computePocketPrice(h, "best", leak).pocket;

        // pocket margins (as % of pocket price)
        const mG = (pG - costs.good) / Math.max(pG, 1e-6);
        const mB = (pB - costs.better) / Math.max(pB, 1e-6);
        const mH = (pH - costs.best) / Math.max(pH, 1e-6);

        tested++;
        if (mG >= floors.good && mB >= floors.better && mH >= floors.best) ok++;
      }
    }
  }
  return { coverage: tested ? ok / tested : 0, tested };
}
