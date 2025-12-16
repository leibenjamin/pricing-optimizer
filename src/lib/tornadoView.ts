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
  /** Human-readable span used for this driver, e.g. "±$2 cost" or "±2.5%pt. FX". */
  spanLabel?: string;
};

const MIN_VISIBLE = {
  absolute: 0.25,
  percent: 0.1,
} as const;

const clampFloor = (v: number, minMag: number) =>
  Math.abs(v) < minMag && v !== 0 ? Math.sign(v) * minMag : v;

function fmtUSD(n: number) {
  const v = Math.round(n * 100) / 100;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtPctPt(n: number) {
  const pp = (n * 100);
  const v = Math.round(pp * 10) / 10;
  return `${v}%pt.`;
}

function spanLabelFor(name: string, opts: TornadoOpts): string | undefined {
  const priceBump = Math.max(0.01, opts.priceBump ?? 5);
  const costBump = Math.max(0.01, opts.costBump ?? 2);
  const refBump = Math.max(0.01, opts.refBump ?? 2);
  const pctSmall = Math.max(0.0025, opts.pctSmall ?? 0.02);
  const payPct = Math.max(0.001, opts.payPct ?? 0.005);
  const payFixed = Math.max(0.01, opts.payFixed ?? 0.05);
  const segTilt = Math.max(0.001, opts.segTilt ?? 0.1);

  const tierFromName = (prefix: "Good" | "Better" | "Best") => {
    const key = prefix.toLowerCase() as "good" | "better" | "best";
    return opts.priceBumps?.[key] ?? priceBump;
  };

  if (name === "Good price") return `±${fmtUSD(tierFromName("Good"))} price`;
  if (name === "Better price") return `±${fmtUSD(tierFromName("Better"))} price`;
  if (name === "Best price") return `±${fmtUSD(tierFromName("Best"))} price`;

  if (name === "Good cost" || name === "Better cost" || name === "Best cost") return `±${fmtUSD(costBump)} unit cost`;

  if (name.startsWith("Ref")) return `±${fmtUSD(refBump)} reference price`;
  if (name === "Refs (all)") return `±${fmtUSD(refBump)} references`;

  if (name === "Payment %") return `±${fmtPctPt(payPct)} processor %`;
  if (name === "FX %") return `±${fmtPctPt(pctSmall)} FX`;
  if (name === "Refunds %") return `±${fmtPctPt(pctSmall)} refunds`;
  if (name === "Payment $") return `±${fmtUSD(payFixed)} fixed fee`;

  if (name === "Segment mix tilt") return `±${Math.round(segTilt * 100)}% segment weight shift`;

  return undefined;
}

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
      spanLabel: spanLabelFor(r.name, opts),
    };
  });
}

export function tornadoSignalThreshold(mode: TornadoValueMode) {
  return MIN_VISIBLE[mode];
}
