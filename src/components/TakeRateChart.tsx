// src/components/TakeRateChart.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import {
  init,
  use as echartsUse,
  type ECharts,
  type ComposeOption,
} from "echarts/core";
import { BarChart, type BarSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type LegendComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CallbackDataParams, TopLevelFormatterParams } from "echarts/types/dist/shared";
import { downloadBlob, csvFromRows } from "../lib/download";
import { TAKE_RATE_COLORS } from "../lib/colors";

// Register only what we need
echartsUse([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

// Build a typed Option from the parts we use
type ECOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

export interface TakeRateData {
  none: number;
  good: number;
  better: number;
  best: number;
}

export type TakeRateScenario = {
  key: string;
  label: string;
  shares: TakeRateData;
  active: number;
  population?: number;
  kind?: "baseline" | "current" | "optimized" | string;
};

type Mode = "mix" | "delta";

const COLORS = TAKE_RATE_COLORS;

const TIER_LABELS: Array<keyof TakeRateData> = ["none", "good", "better", "best"];

function pct(n: number) {
  return Math.round(n * 1000) / 10;
}

export default function TakeRateChart(props: {
  chartId?: string;
  className?: string;
  scenarios: TakeRateScenario[];
  baselineKey?: string;
  mode?: Mode;
}) {
  const {
    chartId = "takerate",
    className,
    scenarios,
    baselineKey,
    mode = "mix",
  } = props;

  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);

  const baseline = useMemo(() => {
    if (!scenarios.length) return null;
    if (baselineKey) return scenarios.find((s) => s.key === baselineKey) ?? scenarios[0];
    return scenarios[0];
  }, [baselineKey, scenarios]);

  const seriesData = useMemo(() => {
    if (!baseline) return null;

    if (mode === "delta") {
      return TIER_LABELS.map((tier) => ({
        name: tier[0].toUpperCase() + tier.slice(1),
        type: "bar" as const,
        itemStyle: {
          color: COLORS[tier],
          borderColor: "rgba(15,23,42,0.18)",
          borderWidth: 0.8,
        },
        data: scenarios.map((s) => {
          const delta = (s.shares[tier] - baseline.shares[tier]) * 100;
          return Math.round(delta * 10) / 10;
        }),
        label: {
          show: false,
        },
      }));
    }

    // default: stacked mix view
      return TIER_LABELS.map((tier) => ({
        name: tier[0].toUpperCase() + tier.slice(1),
        type: "bar" as const,
        stack: "mix",
        itemStyle: {
          color: COLORS[tier],
          borderColor: "rgba(15,23,42,0.18)",
          borderWidth: 0.8,
          opacity: 0.95,
        },
        emphasis: { focus: "series" as const },
        data: scenarios.map((s) => pct(s.shares[tier])),
        label: {
          show: false,
        },
    }));
  }, [baseline, mode, scenarios]);

  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (!divRef.current) return;
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" });
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesData) return;

    const isNarrow = vw < 768;
    const axisFont = isNarrow ? 10 : 12;
    const labelFont = isNarrow ? 10 : 12;
    const topPad = isNarrow ? 22 : 30;
    const bottomPad = isNarrow ? 32 : 40;

    const option: ECOption = {
      animation: false,
      legend: {
        top: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: axisFont },
        data: TIER_LABELS.map((tier) => tier[0].toUpperCase() + tier.slice(1)),
      },
      xAxis: {
        type: "category",
        data: scenarios.map((s) => s.label),
        axisLabel: { fontSize: axisFont, hideOverlap: true, margin: 12, rotate: 12 },
        axisPointer: { type: "shadow" },
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: mode === "delta" ? "{value} pp" : "{value}%", fontSize: axisFont },
        splitLine: { show: true },
        ...(mode === "mix" ? { min: 0, max: 100 } : {}),
        ...(mode === "delta"
          ? {
              name: "Delta vs baseline (pp)",
              nameGap: 12,
              axisLine: { onZero: true },
            }
          : {}),
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: TopLevelFormatterParams) => formatTooltip(params, {
          baselineLabel: baseline?.label ?? "baseline",
          scenarios,
          mode,
        }),
      },
      grid: { left: 46, right: 14, top: topPad, bottom: bottomPad, containLabel: true },
      series: seriesData,
      label: { fontSize: labelFont },
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();
  }, [baseline?.label, mode, scenarios, seriesData, vw]);

  // Unified export listener: PNG via ECharts, CSV via our data
  useEffect(() => {
    type ExportDetail = { id?: string; type?: "png" | "csv" };
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<ExportDetail>;
      if (ce.detail?.id && ce.detail.id !== chartId) return;

      const type = ce.detail?.type ?? "png";

      if (type === "png") {
        if (!chartRef.current) return;
        const url = chartRef.current.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        const a = document.createElement("a");
        a.href = url;
        a.download = `take_rate_${chartId}.png`;
        a.click();
        return;
      }

      // CSV: include scenario label, active, shares, and deltas vs baseline (if available)
      const header: (string | number)[] = [
        "scenario",
        "active",
        "share.none_pct",
        "share.good_pct",
        "share.better_pct",
        "share.best_pct",
      ];
      if (baseline) {
        header.push("delta.none_pp", "delta.good_pp", "delta.better_pp", "delta.best_pp");
      }

      const rows: (string | number)[][] = [
        header,
        ...scenarios.map((s) => {
          const base = baseline ?? s;
          return [
            s.label,
            s.active,
            (s.shares.none * 100).toFixed(2),
            (s.shares.good * 100).toFixed(2),
            (s.shares.better * 100).toFixed(2),
            (s.shares.best * 100).toFixed(2),
            ...(baseline
              ? [
                  ((s.shares.none - base.shares.none) * 100).toFixed(2),
                  ((s.shares.good - base.shares.good) * 100).toFixed(2),
                  ((s.shares.better - base.shares.better) * 100).toFixed(2),
                  ((s.shares.best - base.shares.best) * 100).toFixed(2),
                ]
              : []),
          ];
        }),
      ];

      const csv = csvFromRows(rows);
      downloadBlob(csv, `take_rate_${chartId}.csv`, "text/csv;charset=utf-8");
    };

    window.addEventListener("export:takerate", handler as EventListener);
    return () => window.removeEventListener("export:takerate", handler as EventListener);
  }, [baseline, chartId, scenarios]);

  if (!scenarios.length) {
    return (
      <div className={`w-full ${className ?? ""}`}>
        <div className="text-xs text-gray-600 mb-1">Take-rate by tier</div>
        <div className="h-64 w-full flex items-center justify-center text-sm text-gray-500 border rounded">
          No scenarios to plot yet.
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className ?? ""}`}>
      <div className="text-xs text-gray-600 mb-1">
        {mode === "delta" ? "Delta vs baseline (pp)" : "Take-rate by tier"}
      </div>

      {/* chart root */}
      <div className="h-64 w-full" ref={divRef} />
    </div>
  );
}

function isArrayParams(
  params: TopLevelFormatterParams
): params is CallbackDataParams[] {
  return Array.isArray(params);
}

function formatTooltip(
  params: TopLevelFormatterParams,
  ctx: {
    baselineLabel: string;
    scenarios: TakeRateScenario[];
    mode: Mode;
  }
): string {
  if (!isArrayParams(params) || !params.length) return "";
  const sample = params[0];
  const idx = sample.dataIndex;
  const scenario = ctx.scenarios[idx];
  if (!scenario) return "";

  if (ctx.mode === "delta") {
    const lines = [`<b>${scenario.label}</b> (vs ${ctx.baselineLabel})`];
    params.forEach((row) => {
      const val = typeof row.value === "number" ? row.value : Number(row.value);
      const v = Number.isFinite(val) ? val : 0;
      lines.push(`${row.marker ?? ""} ${row.seriesName}: ${v >= 0 ? "+" : ""}${v.toFixed(1)} pp`);
    });
    return lines.join("<br/>");
  }

  const lines = [`<b>${scenario.label}</b>`, `Active: ${scenario.active.toLocaleString()}`];
  params.forEach((row) => {
    const val = typeof row.value === "number" ? row.value : Number(row.value);
    const v = Number.isFinite(val) ? val : 0;
    lines.push(`${row.marker ?? ""} ${row.seriesName}: ${v.toFixed(1)}%`);
  });
  return lines.join("<br/>");
}














