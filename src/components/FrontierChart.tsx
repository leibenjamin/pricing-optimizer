// src/components/FrontierChart.tsx

import { useEffect, useRef, useState } from "react";
import {
  init,
  use as echartsUse,
  type ECharts,
  type ComposeOption,
} from "echarts/core";
import {
  LineChart,
  ScatterChart,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  type GridComponentOption,
  type TitleComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CallbackDataParams, TopLevelFormatterParams } from "echarts/types/dist/shared";
import { downloadBlob, csvFromRows } from "../lib/download";
import type { Shares } from "../lib/choice";

type FrontierDatum = {
  value?: unknown;
  shares?: Shares;
  reason?: string;
};

echartsUse([
  LineChart,
  ScatterChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TitleComponentOption
  | TooltipComponentOption
>;

export interface FrontierPoint {
  price: number;
  profit: number;
  shares?: Shares;
  reason?: string;
}
export interface FrontierOverlay {
  feasiblePoints?: FrontierPoint[];
  infeasiblePoints?: FrontierPoint[];
}

export interface FrontierMarker {
  label: string;
  price: number;
  profit: number;
  kind?: "baseline" | "current" | "optimized" | string;
}

export interface FrontierComparison {
  label: string;
  points: FrontierPoint[];
}

type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

function getDatum(p: CallbackDataParams): FrontierDatum | null {
  const d = p?.data as unknown;
  if (d && typeof d === "object") return d as FrontierDatum;
  return null;
}

const shortLabel = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

export default function FrontierChartReal({
  points,
  optimum,
  chartId,
  overlay,
  markers,
  xLabel = "Price",
  comparison,
}: {
  points: FrontierPoint[];
  optimum: FrontierPoint | null;
  chartId?: string;
  overlay?: FrontierOverlay;
  markers?: FrontierMarker[];
  xLabel?: string;
  comparison?: FrontierComparison;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [hoverMix, setHoverMix] = useState<{
    label: string;
    shares: Shares;
    price: number;
    profit: number;
  } | null>(null);

  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // Init once
  useEffect(() => {
    if (!divRef.current) return;
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update option when data changes
  useEffect(() => {
    if (!chartRef.current) return;
    const isNarrow = vw < 768;
    const axisFont = isNarrow ? 10 : 12;
    const labelFont = isNarrow ? 10 : 12;
    const topPad = isNarrow ? 40 : 54;
    const rightPad = isNarrow ? 30 : 46;
    const bottomPad = isNarrow ? 54 : 68;
    const markerSymbolSize = isNarrow ? 18 : 24;

    const allPrices: number[] = [
      ...points.map((p) => p.price),
      ...(overlay?.feasiblePoints?.map((p) => p.price) ?? []),
      ...(overlay?.infeasiblePoints?.map((p) => p.price) ?? []),
      ...(comparison?.points?.map((p) => p.price) ?? []),
      ...(markers?.map((m) => m.price) ?? []),
    ].filter((v) => Number.isFinite(v));
    const allProfits: number[] = [
      ...points.map((p) => p.profit),
      ...(overlay?.feasiblePoints?.map((p) => p.profit) ?? []),
      ...(overlay?.infeasiblePoints?.map((p) => p.profit) ?? []),
      ...(comparison?.points?.map((p) => p.profit) ?? []),
      ...(markers?.map((m) => m.profit) ?? []),
      ...(optimum ? [optimum.profit] : []),
    ].filter((v) => Number.isFinite(v));
    const minPrice = allPrices.length ? Math.min(...allPrices) : undefined;
    const maxPrice = allPrices.length ? Math.max(...allPrices) : undefined;
    const priceSpan = minPrice != null && maxPrice != null ? Math.max(maxPrice - minPrice, 1) : undefined;
    const padPrice = priceSpan != null ? Math.max(priceSpan * 0.06, 0.5) : undefined;
    const minProfit = allProfits.length ? Math.min(...allProfits) : undefined;
    const maxProfit = allProfits.length ? Math.max(...allProfits) : undefined;
    const profitSpan = minProfit != null && maxProfit != null ? Math.max(maxProfit - minProfit, 1) : undefined;
    const padProfit = profitSpan != null ? Math.max(profitSpan * 0.08, 5) : undefined;

    const markPointData =
      markers?.map((m) => ({
        name: shortLabel(m.label),
        value: m.price,
        coord: [m.price, m.profit],
        label: {
          formatter: (p: CallbackDataParams) => (p.name ? String(p.name) : ""),
          fontSize: labelFont,
          color: "#0f172a",
          padding: [2, 4, 2, 4],
        },
      })) ?? [];

    const markLineData: Array<{ xAxis?: number; yAxis?: number; name: string }> = markers
      ? markers.map((m) => ({ xAxis: m.price, name: shortLabel(m.label) }))
      : [];
    // Add a zero-profit horizontal line for reference when data crosses zero.
    if (minProfit != null && maxProfit != null && minProfit < 0 && maxProfit > 0) {
      markLineData.push({ yAxis: 0, name: "Profit = 0" });
    }

    const option: ECOption = {
      animation: false,
      grid: {
        left: isNarrow ? 52 : 72,
        right: rightPad,
        top: topPad,
        bottom: bottomPad,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        name: xLabel,
        nameTextStyle: { fontSize: axisFont },
        axisLabel: { fontSize: axisFont, hideOverlap: true, margin: 10 },
        boundaryGap: [0.05, 0.08],
        axisLine: { onZero: false },
        ...(minPrice != null && padPrice != null ? { min: minPrice - padPrice } : {}),
        ...(maxPrice != null && padPrice != null ? { max: maxPrice + padPrice } : {}),
      },
      yAxis: {
        type: "value",
        name: "Profit (N=1000)",
        nameTextStyle: { fontSize: axisFont },
        axisLabel: { fontSize: axisFont, hideOverlap: true, margin: 8 },
        axisLine: { onZero: false },
        splitNumber: 6,
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        ...(minProfit != null && padProfit != null ? { min: minProfit - padProfit } : {}),
        ...(maxProfit != null && padProfit != null ? { max: maxProfit + padProfit } : {}),
      },
      series: [
        {
          type: "line",
          name: "Frontier",
          smooth: true,
          data: points.map((p) => ({
            value: [p.price, p.profit],
            shares: p.shares,
            reason: p.reason,
          })),
          symbolSize: 4,
          markLine: markLineData.length
            ? {
                symbol: "none",
                label: { show: true, formatter: (p) => (p.name ? String(p.name) : ""), fontSize: axisFont - 1 },
                lineStyle: { color: "#cbd5e1", type: "dashed" },
                data: markLineData,
              }
            : undefined,
          label: {
            show: false,
            position: "top",
            fontSize: labelFont,
          },
          labelLayout: { moveOverlap: "shiftY" },
          markPoint: markers && markers.length
            ? {
                symbol: "circle",
                symbolSize: markerSymbolSize,
                itemStyle: {
                  color: "#0ea5e9",
                  borderColor: "#0a5d80",
                  borderWidth: 1,
                },
                label: { show: false },
                data: markPointData,
              }
            : undefined,
        } as LineSeriesOption,
        ...(comparison
          ? [
              {
                type: "line",
                smooth: true,
                name: comparison.label,
                lineStyle: { type: "dashed" },
                itemStyle: { color: "#0f172a" },
                data: comparison.points.map((p) => ({
                  value: [p.price, p.profit],
                  shares: p.shares,
                  reason: p.reason,
                })),
                label: { show: false },
                symbolSize: 4,
              } as LineSeriesOption,
            ]
          : []),
        ...(overlay?.feasiblePoints && overlay.feasiblePoints.length
          ? [
              {
                type: "scatter",
                data: overlay.feasiblePoints.map((p) => ({
                  value: [p.price, p.profit],
                  shares: p.shares,
                  reason: p.reason,
                })),
                symbolSize: 6,
                itemStyle: { color: "#10b981" },
                name: "Feasible",
              } as ScatterSeriesOption,
            ]
          : []),
        ...(overlay?.infeasiblePoints && overlay.infeasiblePoints.length
          ? [
              {
                type: "scatter",
                data: overlay.infeasiblePoints.map((p) => ({
                  value: [p.price, p.profit],
                  shares: p.shares,
                  reason: p.reason,
                })),
                symbolSize: 6,
                itemStyle: { color: "#cbd5e1" },
                name: "Infeasible",
              } as ScatterSeriesOption,
            ]
          : []),
        ...(optimum
          ? [
              {
                type: "scatter",
                data: [[optimum.price, optimum.profit]],
                symbolSize: 10,
                itemStyle: { borderWidth: 1 },
                emphasis: { focus: "series" },
                label: {
                  show: true,
                  formatter: (p: CallbackDataParams) => {
                    const v = Array.isArray(p?.value) ? p.value : undefined;
                    if (v && v.length >= 2) {
                      const price = Number(v[0]);
                      const prof = Number(v[1]);
                      if (Number.isFinite(price) && Number.isFinite(prof)) {
                        return `$${price.toFixed(2)} -> ${prof.toFixed(0)}`;
                      }
                    }
                    return "";
                  },
                  fontSize: labelFont - 1,
                  position: "top",
                  distance: 6,
                },
              } as ScatterSeriesOption,
            ]
          : []),
        ...(markers && markers.length
          ? [
              {
                type: "scatter",
                data: markers.map((m) => [m.price, m.profit, shortLabel(m.label)]),
                symbolSize: 8,
                labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
                itemStyle: {
                  color: "#0ea5e9",
                  borderColor: "#0a5d80",
                  borderWidth: 1,
                },
                label: {
                  show: true,
                  formatter: (p: CallbackDataParams) => {
                    const v = p?.value as unknown[];
                    return Array.isArray(v) && v[2] ? String(v[2]) : "";
                  },
                  position: "top",
                  fontSize: labelFont,
                  overflow: "truncate",
                  width: isNarrow ? 80 : 120,
                  distance: 6,
                  color: "#0f172a",
                },
                z: 5,
              } as ScatterSeriesOption,
            ]
          : []),
      ],
      tooltip: {
        trigger: "axis",
        formatter: (params: TopLevelFormatterParams) => formatTooltip(params),
        confine: true,
      },
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();

    const onHover = (p: CallbackDataParams) => {
    const datum = getDatum(p);
    const val = Array.isArray(p.value)
      ? p.value
      : Array.isArray(datum?.value)
      ? (datum?.value as Array<string | number | Date>)
      : null;
    if (!val || val.length < 2) return;
    const shares = datum?.shares;
    if (!shares) return;
    const price = Number(val[0]);
    const profit = Number(val[1]);
    if (!Number.isFinite(price) || !Number.isFinite(profit)) return;
    setHoverMix({
      label: p.seriesName || "",
      shares,
      price,
      profit,
      });
    };
    const onLeave = () => setHoverMix(null);
    chartRef.current.on("mouseover", onHover);
    chartRef.current.on("mouseout", onLeave);
    return () => {
      chartRef.current?.off("mouseover", onHover);
      chartRef.current?.off("mouseout", onLeave);
    };
  }, [points, optimum, vw, markers, overlay?.feasiblePoints, overlay?.infeasiblePoints, xLabel, comparison]);

  useEffect(() => {
    if (!chartId) return;
    const onExport = (ev: Event) => {
      const e = ev as ExportEvent;
      if (!e.detail || e.detail.id !== chartId) return;

      if (e.detail.type === "png") {
        if (!chartRef.current) return;
        const url = chartRef.current.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        fetch(url)
          .then((r) => r.blob())
          .then((b) => downloadBlob(b, "profit_frontier.png", "image/png"))
          .catch(() => {
            const a = document.createElement("a");
            a.href = url;
            a.download = "profit_frontier.png";
            a.click();
          });
      } else if (e.detail.type === "csv") {
        const rows: (string | number)[][] = [
          ["best_price", "profit", "share.none", "share.good", "share.better", "share.best", "reason"],
          ...points.map((p) => [
            p.price,
            p.profit,
            p.shares?.none ?? "",
            p.shares?.good ?? "",
            p.shares?.better ?? "",
            p.shares?.best ?? "",
            p.reason ?? "",
          ]),
        ];
        const csv = csvFromRows(rows);
        downloadBlob(csv, "profit_frontier.csv", "text/csv;charset=utf-8");
      }
    };
    window.addEventListener("export:frontier", onExport as EventListener);
    return () => window.removeEventListener("export:frontier", onExport as EventListener);
  }, [chartId, points]);

  return (
    <div className="w-full">
      <div className="h-64 w-full" ref={divRef} role="img" aria-label="Profit frontier chart" />
      {hoverMix && (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-700">
          <div className="font-semibold text-slate-900">
            {hoverMix.label || "Point"} @ ${hoverMix.price.toFixed(2)} | Profit ${Math.round(hoverMix.profit).toLocaleString()}
          </div>
          <div className="flex flex-wrap gap-2">
            <span>None {(hoverMix.shares.none * 100).toFixed(1)}%</span>
            <span>Good {(hoverMix.shares.good * 100).toFixed(1)}%</span>
            <span>Better {(hoverMix.shares.better * 100).toFixed(1)}%</span>
            <span>Best {(hoverMix.shares.best * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function isArrayParams(params: TopLevelFormatterParams): params is CallbackDataParams[] {
  return Array.isArray(params);
}

function formatTooltip(params: TopLevelFormatterParams): string {
  if (!isArrayParams(params) || !params.length) return "";
  const p = params[0];

  const datum = getDatum(p);
  const val = Array.isArray(p.value)
    ? p.value
    : Array.isArray(datum?.value)
    ? (datum?.value as number[])
    : [];
  const priceNum = val.length >= 1 ? Number(val[0]) : NaN;
  const profitNum = val.length >= 2 ? Number(val[1]) : NaN;
  const price = Number.isFinite(priceNum) ? `$${priceNum.toFixed(2)}` : "";
  const profit = Number.isFinite(profitNum) ? `$${profitNum.toFixed(0)}` : "";

  const shares = datum?.shares;
  const reason = datum?.reason;

  const lines = [price && profit ? `<b>${price}</b> | Profit ${profit}` : "Point"];
  if (shares) {
    lines.push(
      `Mix: None ${(shares.none * 100).toFixed(1)}% | Good ${(shares.good * 100).toFixed(1)}% | Better ${(shares.better * 100).toFixed(1)}% | Best ${(shares.best * 100).toFixed(1)}%`
    );
  }
  if (reason) {
    lines.push(`<span style="color:#b91c1c">Infeasible: ${reason}</span>`);
  }
  if (p.seriesName) {
    lines.push(`<span style="color:#475569">${p.seriesName}</span>`);
  }
  return lines.join("<br/>");
}
