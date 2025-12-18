// src/components/FrontierChart.tsx

import { useEffect, useRef, useState, useMemo } from "react";
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
import type { ScenarioRun } from "../lib/domain";

type FrontierDatum = {
  value?: unknown;
  shares?: Shares;
  reason?: string;
  lineLabel?: string;
  kind?: string;
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

export interface FrontierViewModel {
  base: {
    points: FrontierPoint[];
    feasiblePoints?: FrontierPoint[];
    infeasiblePoints?: FrontierPoint[];
    optimum: FrontierPoint | null;
  };
  alt?: FrontierComparison;
  markers?: FrontierMarker[];
  xLabel?: string;
  scenarioRun?: ScenarioRun | null;
}

type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

function getDatum(p: CallbackDataParams): FrontierDatum | null {
  const d = p?.data as unknown;
  if (d && typeof d === "object") return d as FrontierDatum;
  return null;
}

const shortLabel = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

export default function FrontierChartReal({
  points,
  optimum,
  chartId,
  overlay,
  markers,
  xLabel = "Price",
  comparison,
  viewModel,
}: {
  points?: FrontierPoint[];
  optimum?: FrontierPoint | null;
  chartId?: string;
  overlay?: FrontierOverlay;
  markers?: FrontierMarker[];
  xLabel?: string;
  comparison?: FrontierComparison;
  viewModel?: FrontierViewModel;
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

  // Prefer view-model inputs if provided (backward compatible)
  const {
    chartPoints,
    chartOptimum,
    chartOverlay,
    comparisonView,
    markersView,
    xLabelView,
  } = useMemo(() => {
    const base = viewModel?.base;
    const alt = viewModel?.alt ?? comparison;
    const mks = viewModel?.markers ?? markers;
    const xl = viewModel?.xLabel ?? xLabel;
    const pts = base?.points ?? points ?? [];
    const opt = base?.optimum ?? optimum ?? null;
    const over: FrontierOverlay | undefined = base
      ? { feasiblePoints: base.feasiblePoints, infeasiblePoints: base.infeasiblePoints }
      : overlay;
    return {
      chartPoints: pts,
      chartOptimum: opt,
      chartOverlay: over,
      comparisonView: alt,
      markersView: mks,
      xLabelView: xl,
    };
  }, [comparison, markers, overlay, optimum, points, viewModel, xLabel]);

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
    const niceExtent = (min: number | undefined, max: number | undefined, ticks = 6) => {
      if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) return null;
      if (min === max) return { min, max, step: 1 };
      const span = Math.max(max - min, 1e-6);
      const raw = span / Math.max(1, ticks);
      const pow = Math.pow(10, Math.floor(Math.log10(raw)));
      const mult = raw / pow;
      const niceMult = mult <= 1 ? 1 : mult <= 2 ? 2 : mult <= 5 ? 5 : 10;
      const step = niceMult * pow;
      const nMin = Math.floor(min / step) * step;
      const nMax = Math.ceil(max / step) * step;
      return { min: nMin, max: nMax, step };
    };

    const isNarrow = vw < 768;
    const axisFont = isNarrow ? 10 : 12;
    const labelFont = isNarrow ? 10 : 12;
    const topPad = isNarrow ? 46 : 60;
    const rightPad = isNarrow ? 70 : 96;
    const bottomPad = isNarrow ? 60 : 76;

    const allPrices: number[] = [
      ...chartPoints.map((p) => p.price),
      ...(chartOverlay?.feasiblePoints?.map((p) => p.price) ?? []),
      ...(chartOverlay?.infeasiblePoints?.map((p) => p.price) ?? []),
      ...(comparisonView?.points?.map((p) => p.price) ?? []),
      ...(markersView?.map((m) => m.price) ?? []),
    ].filter((v) => Number.isFinite(v));
    const allProfits: number[] = [
      ...chartPoints.map((p) => p.profit),
      ...(chartOverlay?.feasiblePoints?.map((p) => p.profit) ?? []),
      ...(chartOverlay?.infeasiblePoints?.map((p) => p.profit) ?? []),
      ...(comparisonView?.points?.map((p) => p.profit) ?? []),
      ...(markersView?.map((m) => m.profit) ?? []),
      ...(chartOptimum ? [chartOptimum.profit] : []),
    ].filter((v) => Number.isFinite(v));
    const minPrice = allPrices.length ? Math.min(...allPrices) : undefined;
    const maxPrice = allPrices.length ? Math.max(...allPrices) : undefined;
    const priceSpan = minPrice != null && maxPrice != null ? Math.max(maxPrice - minPrice, 1) : undefined;
    const padPrice = priceSpan != null ? Math.max(priceSpan * 0.06, 0.5) : undefined;
    const minProfit = allProfits.length ? Math.min(...allProfits) : undefined;
    const maxProfit = allProfits.length ? Math.max(...allProfits) : undefined;
    const profitSpan = minProfit != null && maxProfit != null ? Math.max(maxProfit - minProfit, 1) : undefined;
    const padProfit = profitSpan != null ? Math.max(profitSpan * 0.12, 12) : undefined;

    const priceExtent = niceExtent(
      minPrice != null && padPrice != null ? minPrice - padPrice : undefined,
      maxPrice != null && padPrice != null ? maxPrice + padPrice : undefined
    );
    const profitExtent = niceExtent(
      minProfit != null && padProfit != null ? minProfit - padProfit : undefined,
      maxProfit != null && padProfit != null ? maxProfit + padProfit : undefined
    );
    const priceDecimals = priceExtent ? (priceExtent.step < 1 ? 2 : 0) : 0;

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const peakLabelLayout = (() => {
      // Build a stable list of plotted points we want to avoid covering with the "Peak" label.
      const plotted: Array<{ price: number; profit: number }> = [
        ...chartPoints.map((p) => ({ price: p.price, profit: p.profit })),
        ...(comparisonView?.points?.map((p) => ({ price: p.price, profit: p.profit })) ?? []),
        ...(chartOverlay?.feasiblePoints?.map((p) => ({ price: p.price, profit: p.profit })) ?? []),
        ...(chartOverlay?.infeasiblePoints?.map((p) => ({ price: p.price, profit: p.profit })) ?? []),
        ...(markersView?.map((m) => ({ price: m.price, profit: m.profit })) ?? []),
      ].filter((p) => Number.isFinite(p.price) && Number.isFinite(p.profit));

      // Note: ECharts labelLayout only manages label-vs-label overlap by default. We use a
      // custom layout to avoid covering the curve, markers, and axes (especially on narrow charts).
      return (params: unknown) => {
        const chart = chartRef.current;
        if (!chart || !priceExtent || !profitExtent) return {};

        const p = params as {
          labelRect?: { width: number; height: number };
          rect?: { x: number; y: number; width: number; height: number };
        };
        const labelRect = p?.labelRect;
        const hostRect = p?.rect;
        if (!labelRect || !hostRect) return {};

        const labelW = labelRect.width;
        const labelH = labelRect.height;
        if (!Number.isFinite(labelW) || !Number.isFinite(labelH) || labelW <= 0 || labelH <= 0) return {};

        const px = hostRect.x + hostRect.width / 2;
        const py = hostRect.y + hostRect.height / 2;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return {};

        // Compute the plot-area rectangle in pixels (data-extent corners), then keep a safety margin
        // so we don't sit on top of axis lines/ticks.
        const topLeft = chart.convertToPixel(
          { xAxisIndex: 0, yAxisIndex: 0 },
          [priceExtent.min, profitExtent.max]
        ) as unknown;
        const bottomRight = chart.convertToPixel(
          { xAxisIndex: 0, yAxisIndex: 0 },
          [priceExtent.max, profitExtent.min]
        ) as unknown;
        if (!Array.isArray(topLeft) || !Array.isArray(bottomRight) || topLeft.length < 2 || bottomRight.length < 2) {
          return {};
        }

        const left = Math.min(Number(topLeft[0]), Number(bottomRight[0]));
        const right = Math.max(Number(topLeft[0]), Number(bottomRight[0]));
        const top = Math.min(Number(topLeft[1]), Number(bottomRight[1]));
        const bottom = Math.max(Number(topLeft[1]), Number(bottomRight[1]));
        if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) return {};

        const margin = isNarrow ? 10 : 8;
        const safe = {
          left: left + margin,
          right: right - margin,
          top: top + margin,
          bottom: bottom - margin,
        };

        const pad = isNarrow ? 10 : 12;
        const halfW = labelW / 2;
        const halfH = labelH / 2;

        const candidates = [
          { name: "topRight", x: px + pad, y: py - labelH - pad },
          { name: "topLeft", x: px - labelW - pad, y: py - labelH - pad },
          { name: "bottomRight", x: px + pad, y: py + pad },
          { name: "bottomLeft", x: px - labelW - pad, y: py + pad },
          { name: "right", x: px + pad, y: py - halfH },
          { name: "left", x: px - labelW - pad, y: py - halfH },
          { name: "top", x: px - halfW, y: py - labelH - pad },
          { name: "bottom", x: px - halfW, y: py + pad },
        ];

        // Convert plotted points once; skip points very close to the peak itself so we don't
        // penalize unavoidable overlap around the anchor.
        const peakR2 = Math.pow(isNarrow ? 10 : 12, 2);
        const plottedPx = plotted
          .map((pt) => {
            const out = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pt.price, pt.profit]) as unknown;
            if (!Array.isArray(out) || out.length < 2) return null;
            const x = Number(out[0]);
            const y = Number(out[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            const dx = x - px;
            const dy = y - py;
            if (dx * dx + dy * dy <= peakR2) return null;
            return { x, y };
          })
          .filter(Boolean) as Array<{ x: number; y: number }>;

        const scoreCandidate = (c: { x: number; y: number }) => {
          const box = { x1: c.x, y1: c.y, x2: c.x + labelW, y2: c.y + labelH };

          const outX = Math.max(0, safe.left - box.x1) + Math.max(0, box.x2 - safe.right);
          const outY = Math.max(0, safe.top - box.y1) + Math.max(0, box.y2 - safe.bottom);
          const boundsPenalty = (outX + outY) * 10_000;

          // Count how many plotted points would sit under the label; treat this as "visual occlusion".
          const pointPad = isNarrow ? 6 : 5;
          const occludes = plottedPx.reduce((acc, pt) => {
            const inside =
              pt.x >= box.x1 - pointPad &&
              pt.x <= box.x2 + pointPad &&
              pt.y >= box.y1 - pointPad &&
              pt.y <= box.y2 + pointPad;
            return inside ? acc + 1 : acc;
          }, 0);

          // Prefer keeping the label close to the point for scanability, but not at the cost of occlusion.
          const cx = (box.x1 + box.x2) / 2;
          const cy = (box.y1 + box.y2) / 2;
          const dist = Math.hypot(cx - px, cy - py);

          return boundsPenalty + occludes * 250 + dist * 0.4;
        };

        const best = candidates.reduce<{ x: number; y: number; score: number } | null>((acc, c) => {
          const score = scoreCandidate(c);
          if (!acc || score < acc.score) return { x: c.x, y: c.y, score };
          return acc;
        }, null);

        if (!best) return {};

        const maxX = Math.max(safe.left, safe.right - labelW);
        const maxY = Math.max(safe.top, safe.bottom - labelH);

        return {
          x: clamp(best.x, safe.left, maxX),
          y: clamp(best.y, safe.top, maxY),
        };
      };
    })();

    const inferKinds = (m: FrontierMarker) => {
      const s = `${m.label ?? ""}`.toLowerCase();
      return {
        baseline: s.includes("baseline") || m.kind === "baseline",
        current: s.includes("current") || m.kind === "current",
        optimized: s.includes("optimized") || m.kind === "optimized",
      };
    };

    const markerVisualFor = (m: FrontierMarker) => {
      const k = inferKinds(m);
      const kind = k.optimized ? "optimized" : k.current ? "current" : k.baseline ? "baseline" : "current";
      if (kind === "optimized") {
        return {
          kind,
          symbol: "diamond" as const,
          itemStyle: { color: "#0f172a", borderColor: "#0f172a", borderWidth: 1 },
        };
      }
      if (kind === "baseline") {
        return {
          kind,
          symbol: "circle" as const,
          itemStyle: { color: "#ffffff", borderColor: "#64748b", borderWidth: 2 },
        };
      }
      return {
        kind,
        symbol: "circle" as const,
        itemStyle: { color: "#0ea5e9", borderColor: "#075985", borderWidth: 1 },
      };
    };

    const mergedLineMarkers = (() => {
      if (!markersView?.length) return [];
      const byPrice = new Map<
        string,
        { price: number; kinds: { baseline: boolean; current: boolean; optimized: boolean } }
      >();
      for (const m of markersView) {
        const key = m.price.toFixed(4);
        const k = inferKinds(m);
        const existing = byPrice.get(key);
        if (existing) {
          existing.kinds.baseline ||= k.baseline;
          existing.kinds.current ||= k.current;
          existing.kinds.optimized ||= k.optimized;
        } else {
          byPrice.set(key, { price: m.price, kinds: k });
        }
      }

      const combinedLabel = (k: { baseline: boolean; current: boolean; optimized: boolean }) => {
        if (k.optimized && k.current && k.baseline) return "Optimized & Current & Baseline";
        if (k.current && k.baseline) return "Current & Baseline";
        if (k.optimized && k.current) return "Optimized & Current";
        if (k.optimized && k.baseline) return "Optimized & Baseline";
        if (k.optimized) return "Optimized";
        if (k.current) return "Current";
        if (k.baseline) return "Baseline";
        return "Marker";
      };

      return Array.from(byPrice.values())
        .sort((a, b) => a.price - b.price)
        .map((g, idx) => {
          const label = combinedLabel(g.kinds);
          const n = Math.ceil(idx / 2);
          const dx = idx === 0 ? 0 : (idx % 2 ? 1 : -1) * Math.min(42, 10 * n);
          return {
            xAxis: g.price,
            lineLabel: shortLabel(label),
            labelOffsetX: dx,
          };
        });
    })();

    const markLineData: Array<{
      xAxis?: number;
      yAxis?: number;
      name?: string;
      lineLabel?: string;
      labelOffsetX?: number;
    }> = [...mergedLineMarkers];
    // Add a zero-profit horizontal line for reference when data crosses zero.
    if (minProfit != null && maxProfit != null && minProfit < 0 && maxProfit > 0) {
      markLineData.push({ yAxis: 0, name: "Profit = 0", lineLabel: "Profit = 0" });
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
        name: xLabelView,
        nameTextStyle: { fontSize: axisFont },
        nameGap: isNarrow ? 28 : 36,
        axisLabel: {
          fontSize: axisFont,
          hideOverlap: true,
          margin: 12,
          formatter: (v: number) =>
            priceDecimals > 0 ? v.toFixed(priceDecimals) : Math.round(v).toLocaleString(),
        },
        boundaryGap: [0.07, 0.12],
        axisLine: { onZero: false },
        ...(priceExtent ? { min: priceExtent.min, max: priceExtent.max } : {}),
      },
      yAxis: {
        type: "value",
        name: "Profit (N=1000)",
        nameTextStyle: { fontSize: axisFont },
        axisLabel: {
          fontSize: axisFont,
          hideOverlap: true,
          margin: 8,
          formatter: (v: number) => Math.round(v).toLocaleString(),
        },
        axisLine: { onZero: false },
        splitNumber: 6,
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        ...(profitExtent ? { min: profitExtent.min, max: profitExtent.max } : {}),
      },
      series: [
        {
          type: "line",
          name: "Frontier",
          smooth: true,
          data: chartPoints.map((p) => ({
            value: [p.price, p.profit],
            shares: p.shares,
            reason: p.reason,
          })),
            symbolSize: 4,
            markLine: markLineData.length
              ? {
                  symbol: "none",
                  label: {
                    show: true,
                    formatter: (p: unknown) => {
                      const pp = p as { name?: string; data?: { lineLabel?: string } };
                      if (pp?.data?.lineLabel) return pp.data.lineLabel;
                      if (pp?.name) return String(pp.name).replace(/\s*line$/i, "");
                      return "";
                    },
                    position: "insideEndTop",
                    fontSize: axisFont - 1,
                    padding: [1, 3],
                    backgroundColor: "rgba(255,255,255,0.85)",
                    borderColor: "#cbd5e1",
                    borderWidth: 1,
                  },
                  lineStyle: { color: "#cbd5e1", type: "dashed" },
                  data: markLineData.map((d) => ({
                    ...d,
                    label: d.labelOffsetX ? { offset: [d.labelOffsetX, 0] } : undefined,
                  })),
                }
              : undefined,
          label: {
            show: false,
            position: "top",
            fontSize: labelFont,
          },
            labelLayout: { moveOverlap: "shiftY" },
          } as LineSeriesOption,
        ...(comparisonView
          ? [
              {
                type: "line",
                smooth: true,
                name: comparisonView.label,
                lineStyle: { type: "dashed" },
                itemStyle: { color: "#0f172a" },
                symbolSize: 4,
                data: comparisonView.points.map((p) => ({
                  value: [p.price, p.profit],
                  shares: p.shares,
                  reason: p.reason,
                })),
                label: { show: false },
              } as LineSeriesOption,
            ]
          : []),
        ...(chartOverlay?.feasiblePoints && chartOverlay.feasiblePoints.length
          ? [
              {
                type: "scatter",
                data: chartOverlay.feasiblePoints.map((p) => ({
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
        ...(chartOverlay?.infeasiblePoints && chartOverlay.infeasiblePoints.length
          ? [
              {
                type: "scatter",
                data: chartOverlay.infeasiblePoints.map((p) => ({
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
        ...(chartOptimum
          ? [
              {
                type: "scatter",
                name: "Peak",
                data: [[chartOptimum.price, chartOptimum.profit]],
                symbolSize: 10,
                itemStyle: { borderWidth: 1 },
                emphasis: { focus: "series" },
                labelLayout: peakLabelLayout,
                label: {
                  show: !isNarrow,
                  formatter: (p: CallbackDataParams) => {
                    const v = Array.isArray(p?.value) ? p.value : undefined;
                    if (v && v.length >= 2) {
                      const price = Number(v[0]);
                      const prof = Number(v[1]);
                      if (Number.isFinite(price) && Number.isFinite(prof)) {
                        return `Peak\n$${price.toFixed(2)} → $${Math.round(prof).toLocaleString()}`;
                      }
                    }
                    return "";
                  },
                  fontSize: labelFont - 1,
                  lineHeight: isNarrow ? 12 : 14,
                  color: "#0f172a",
                  backgroundColor: "rgba(255,255,255,0.92)",
                  borderColor: "#cbd5e1",
                  borderWidth: 1,
                  borderRadius: 4,
                  padding: [3, 6],
                  position: "top",
                  distance: isNarrow ? 10 : 12,
                },
                z: 6,
              } as ScatterSeriesOption,
            ]
          : []),
        ...(markersView && markersView.length
          ? [
              {
                type: "scatter",
                name: "Markers",
                data: markersView.map((m) => {
                  const viz = markerVisualFor(m);
                  return {
                    value: [m.price, m.profit],
                    lineLabel: shortLabel(m.label),
                    kind: viz.kind,
                    symbol: viz.symbol,
                    itemStyle: viz.itemStyle,
                  };
                }),
                symbolSize: 9,
                labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
                label: { show: false },
                tooltip: { trigger: "item" },
                z: 5,
              } as ScatterSeriesOption,
            ]
          : []),
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", snap: true },
        triggerOn: "mousemove",
        formatter: (params: TopLevelFormatterParams) => formatTooltip(params),
        confine: true,
      },
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();

    const baseExtent = (() => {
      const xs = chartPoints.map((p) => p.price).filter((v) => Number.isFinite(v));
      return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
    })();

    const pickNearestBasePoint = (x: number) => {
      if (!Number.isFinite(x) || !chartPoints.length) return null;
      if (baseExtent && (x < baseExtent.min - 1e-6 || x > baseExtent.max + 1e-6)) return null;
      let best: FrontierPoint | null = null;
      let bestDist = Infinity;
      for (const p of chartPoints) {
        const d = Math.abs(p.price - x);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      return best;
    };

    const onAxisPointer = (ev: unknown) => {
      const e = ev as { axesInfo?: Array<{ value?: unknown }> };
      const x = Number(e?.axesInfo?.[0]?.value);
      if (!Number.isFinite(x)) return;
      const nearest = pickNearestBasePoint(x);
      if (!nearest?.shares) return;
      setHoverMix({
        label: "Frontier",
        shares: nearest.shares,
        price: nearest.price,
        profit: nearest.profit,
      });
    };
    const onLeave = () => setHoverMix(null);
    chartRef.current.on("updateAxisPointer", onAxisPointer);
    chartRef.current.on("globalout", onLeave);
    return () => {
      chartRef.current?.off("updateAxisPointer", onAxisPointer);
      chartRef.current?.off("globalout", onLeave);
    };
  }, [chartPoints, chartOptimum, vw, markersView, chartOverlay, xLabelView, comparisonView]);

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
	        const xKey = String(xLabelView || "price")
	          .toLowerCase()
	          .replace(/[^a-z0-9]+/g, "_")
	          .replace(/^_+|_+$/g, "");
	        const rows: (string | number)[][] = [
	          [xKey || "price", "profit", "share.none", "share.good", "share.better", "share.best", "reason"],
	          ...chartPoints.map((p) => [
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
	  }, [chartId, chartPoints, xLabelView]);

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

function formatTooltip(params: TopLevelFormatterParams): string {
  const list: CallbackDataParams[] = Array.isArray(params) ? params : params ? [params as CallbackDataParams] : [];
  if (!list.length) return "";

  const firstVal = (() => {
    for (const p of list) {
      const datum = getDatum(p);
      const val = Array.isArray(p.value)
        ? p.value
        : Array.isArray(datum?.value)
        ? (datum?.value as number[])
        : [];
      if (val.length >= 2 && Number.isFinite(Number(val[0])) && Number.isFinite(Number(val[1]))) return val;
    }
    return null;
  })();

  const priceNum = firstVal ? Number(firstVal[0]) : NaN;
  const price = Number.isFinite(priceNum) ? `$${priceNum.toFixed(2)}` : "";
  const lines: string[] = [];
  if (price) lines.push(`<b>${price}</b>`);

  const rows: string[] = [];
  let shares: Shares | undefined;
  let reason: string | undefined;

  for (const p of list) {
    // Avoid duplicate overlays: the line already communicates the curve.
    if (p.seriesName === "Feasible" || p.seriesName === "Infeasible") continue;
    const datum = getDatum(p);
    const val = Array.isArray(p.value)
      ? p.value
      : Array.isArray(datum?.value)
      ? (datum?.value as number[])
      : [];
    const profitNum = val.length >= 2 ? Number(val[1]) : NaN;
    if (!Number.isFinite(profitNum)) continue;

    const label = datum?.lineLabel || p.seriesName || "Point";
    rows.push(`<span style="color:#0f172a"><b>${label}</b></span>: Profit $${profitNum.toFixed(0)}`);

    shares ||= datum?.shares;
    reason ||= datum?.reason;
  }

  if (rows.length) lines.push(...rows);
  if (shares) {
    lines.push(
      `Mix: None ${(shares.none * 100).toFixed(1)}% | Good ${(shares.good * 100).toFixed(1)}% | Better ${(shares.better * 100).toFixed(1)}% | Best ${(shares.best * 100).toFixed(1)}%`
    );
  }
  if (reason) {
    lines.push(`<span style="color:#b91c1c">Infeasible: ${reason}</span>`);
  }

  return lines.join("<br/>");
}
