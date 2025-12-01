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

type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

export default function FrontierChartReal({
  points,
  optimum,
  chartId,
  overlay,
  markers,
  xLabel = "Price",
}: {
  points: FrontierPoint[];
  optimum: FrontierPoint | null;
  chartId?: string;
  overlay?: FrontierOverlay;
  markers?: FrontierMarker[];
  xLabel?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

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
    const topPad = isNarrow ? 20 : 32;
    const rightPad = isNarrow ? 18 : 32;
    const bottomPad = isNarrow ? 36 : 48;

    const option: ECOption = {
      animation: false,
      grid: {
        left: isNarrow ? 44 : 64,
        right: rightPad,
        top: topPad,
        bottom: bottomPad,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        name: xLabel,
        nameTextStyle: { fontSize: axisFont },      // axis name font
        axisLabel: { fontSize: axisFont },          // tick label font
      },
      yAxis: {
        type: "value",
        name: "Profit (N=1000)",
        nameTextStyle: { fontSize: axisFont },
        axisLabel: { fontSize: axisFont },
      },
      series: [
        {
          type: "line",
          smooth: true,
          data: points.map((p) => ({
            value: [p.price, p.profit],
            shares: p.shares,
            reason: p.reason,
          })),
          // If you want to show data labels on the line, enable this:
          label: {
            show: false,               // set to true if wanting labels
            position: "top",
            fontSize: labelFont,
          },
        } as LineSeriesOption,
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
                symbolSize: 12,
                itemStyle: { borderWidth: 1 },
                emphasis: { focus: "series" },
                // If you want to label the optimum dot:
                label: {
                  show: true,
                  formatter: (p: CallbackDataParams) => {
                    // ECharts can pass a number, object, or tuple; guard and format only tuples
                    const v = p?.value as number[] | undefined;
                    if (Array.isArray(v) && v.length >= 2) {
                      const [price, prof] = v;
                      return `$${price.toFixed(2)} • ${prof.toFixed(0)}`;
                    }
                    return ""; // fallback (hides text if value isn’t a tuple)
                  },
                  fontSize: labelFont,
                  position: "top",
                },
              } as ScatterSeriesOption,
            ]
          : []),
        ...(markers && markers.length
          ? [
              {
                type: "scatter",
                data: markers.map((m) => [m.price, m.profit, m.label]),
                symbolSize: 10,
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
      },
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();
  }, [points, optimum, vw, markers, overlay?.feasiblePoints, overlay?.infeasiblePoints, xLabel]);

  // Listen for export events from ActionCluster
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
        // Fetch the data URL and funnel through downloadBlob for consistency
        fetch(url)
          .then(r => r.blob())
          .then(b => downloadBlob(b, "profit_frontier.png", "image/png"))
          .catch(() => {
            // Fallback to direct-link click if fetch fails
            const a = document.createElement("a");
            a.href = url;
            a.download = "profit_frontier.png";
            a.click();
          });
      } else if (e.detail.type === "csv") {
        const rows: (string | number)[][] = [
          ["best_price", "profit", "share.none", "share.good", "share.better", "share.best", "reason"],
          ...points.map(p => [
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
      {/* chart root */}
      <div className="h-64 w-full" ref={divRef} role="img" aria-label="Profit frontier chart" />
    </div>
  );

}

function isArrayParams(params: TopLevelFormatterParams): params is CallbackDataParams[] {
  return Array.isArray(params);
}

function formatTooltip(params: TopLevelFormatterParams): string {
  if (!isArrayParams(params) || !params.length) return "";
  const p = params[0];

  const val = Array.isArray(p.value) ? p.value : [];
  const price = val.length >= 1 ? `$${Number(val[0]).toFixed(2)}` : "";
  const profit = val.length >= 2 ? `$${Number(val[1]).toFixed(0)}` : "";

  const datum = p.data as { value?: unknown; shares?: Shares; reason?: string } | undefined;
  const shares = datum?.shares;
  const reason = datum?.reason;

  const lines = [price && profit ? `<b>${price}</b> • Profit ${profit}` : "Point"];
  if (shares) {
    lines.push(
      `Mix: None ${(shares.none * 100).toFixed(1)}% • Good ${(shares.good * 100).toFixed(1)}% • Better ${(shares.better * 100).toFixed(1)}% • Best ${(shares.best * 100).toFixed(1)}%`
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
