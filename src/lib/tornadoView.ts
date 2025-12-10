// src/lib/tornadoView.ts
import {
  tornadoProfit,
  tornadoRevenue,
  type Scenario,
  type TornadoMetric,
  type TornadoOpts,
} from "./sensitivity";
export type { TornadoMetric } from "./sensitivity";

export type TornadoValueMode = "absolute" | "percent";

export type TornadoDisplayRow = {
  name: string;
  base: number;
  deltaLow: number;   // in display units ($ or %)
  deltaHigh: number;  // in display units ($ or %)
  absLow: number;     // raw $ delta (unfloored)
  absHigh: number;    // raw $ delta (unfloored)
};

const MIN_VISIBLE = {
  absolute: 0.25,
  percent: 0.1,
} as const;

const clampFloor = (v: number, minMag: number) =>
  Math.abs(v) < minMag && v !== 0 ? Math.sign(v) * minMag : v;

export function buildTornadoRows(args: {
  metric: TornadoMetric;
  mode: TornadoValueMode;
  scenario: Scenario;
  opts: TornadoOpts;
}): TornadoDisplayRow[] {
  const { metric, mode, scenario, opts } = args;
  const raw =
    metric === "revenue"
      ? tornadoRevenue(scenario, opts)
      : tornadoProfit(scenario, opts);
  if (!raw.length) return [];

  const minMag = MIN_VISIBLE[mode];

  return raw.map((r) => {
    const absLow = r.low - r.base;
    const absHigh = r.high - r.base;
    const denom = mode === "percent" ? Math.max(Math.abs(r.base), 1) : 1;

    const asDisplay = (delta: number) => {
      const rawVal = mode === "percent" ? (delta / denom) * 100 : delta;
      return clampFloor(rawVal, minMag);
    };

    return {
      name: r.name,
      base: r.base,
      deltaLow: asDisplay(absLow),
      deltaHigh: asDisplay(absHigh),
      absLow,
      absHigh,
    };
  });
}

export function tornadoSignalThreshold(mode: TornadoValueMode) {
  return MIN_VISIBLE[mode];
}
