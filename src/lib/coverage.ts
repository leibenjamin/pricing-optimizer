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
  leak: Leakages,
  usePocket = true
): { coverage: number; tested: number } {
  let ok = 0;
  let tested = 0;
  const step = Math.max(0.5, ranges.step); // safety

  for (let g = ranges.good[0]; g <= ranges.good[1]; g += step) {
    const bStart = Math.max(g + (gaps.gapGB ?? 0), ranges.better[0]);
    for (let b = bStart; b <= ranges.better[1]; b += step) {
      const hStart = Math.max(b + (gaps.gapBB ?? 0), ranges.best[0]);
      for (let h = hStart; h <= ranges.best[1]; h += step) {
        const effG = usePocket ? computePocketPrice(g, "good", leak).pocket : g;
        const effB = usePocket ? computePocketPrice(b, "better", leak).pocket : b;
        const effH = usePocket ? computePocketPrice(h, "best", leak).pocket : h;

        // margins (as % of chosen basis)
        const mG = (effG - costs.good) / Math.max(effG, 1e-6);
        const mB = (effB - costs.better) / Math.max(effB, 1e-6);
        const mH = (effH - costs.best) / Math.max(effH, 1e-6);

        tested++;
        if (mG >= floors.good && mB >= floors.better && mH >= floors.best) ok++;
      }
    }
  }
  return { coverage: tested ? ok / tested : 0, tested };
}

// ---------- 2D feasibility slice (Good × Better) ----------

export type FeasCell = { g: number; b: number; ok: boolean };

export function feasibilitySliceGB(
  ranges: Ranges,
  costs: Prices,
  floors: Floors,
  gaps: Gaps,
  leak: Leakages,
  usePocket = true
): { cells: FeasCell[]; gTicks: number[]; bTicks: number[]; bestUsed: number } {
  const step = Math.max(0.5, ranges.step);
  const gTicks: number[] = [];
  const bTicks: number[] = [];
  for (let g = ranges.good[0]; g <= ranges.good[1] + 1e-9; g += step) gTicks.push(Number(g.toFixed(6)));
  for (let b = ranges.better[0]; b <= ranges.better[1] + 1e-9; b += step) bTicks.push(Number(b.toFixed(6)));

  // Choose a reasonable Best for the slice: the lowest Best that satisfies gapBB and min Best range
  // (clamped to the max Best range)
  const bestUsed = Math.min(
    ranges.best[1],
    Math.max(ranges.best[0], (gaps.gapBB ?? 0) + ranges.better[0])
  );

  const cells: FeasCell[] = [];
  for (const g of gTicks) {
    for (const b of bTicks) {
      // Respect G→B gap
      if (b < g + (gaps.gapGB ?? 0)) {
        cells.push({ g, b, ok: false });
        continue;
      }
      // Respect B→Best gap through chosen bestUsed
      const h = Math.max(bestUsed, b + (gaps.gapBB ?? 0));
      if (h > ranges.best[1]) {
        cells.push({ g, b, ok: false });
        continue;
      }
      // Pocket margin check
      const effG = usePocket ? computePocketPrice(g, "good", leak).pocket : g;
      const effB = usePocket ? computePocketPrice(b, "better", leak).pocket : b;
      const effH = usePocket ? computePocketPrice(h, "best", leak).pocket : h;
      const mG = (effG - costs.good) / Math.max(effG, 1e-6);
      const mB = (effB - costs.better) / Math.max(effB, 1e-6);
      const mH = (effH - costs.best) / Math.max(effH, 1e-6);
      const ok = mG >= floors.good && mB >= floors.better && mH >= floors.best;
      cells.push({ g, b, ok });
    }
  }
  return { cells, gTicks, bTicks, bestUsed };
}
