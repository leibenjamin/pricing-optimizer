// src/components/Tornado.tsx
import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, type BarSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type TitleComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | TitleComponentOption
>;

export type TornadoDatum = {
  name: string;
  base: number;
  deltaLow: number;   // negative or positive
  deltaHigh: number;  // negative or positive
};

export default function Tornado({
  title = "Tornado: Profit sensitivity",
  rows,
  chartId,
}: {
  title?: string;
  rows: TornadoDatum[];
  chartId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(ref.current);

    // Prepare series: left bars (low deltas), right bars (high deltas)
    const cats = rows.map((r) => r.name);
    const left = rows.map((r) => Math.min(0, r.deltaLow));
    const right = rows.map((r) => Math.max(0, r.deltaHigh));
    const isNarrow = vw < 900;
    const axisFont = isNarrow ? 10 : 12;
    const labelWidth = isNarrow ? 150 : 190;
    const labelGap = isNarrow ? 44 : 54; // larger separation between y-labels and bars
    const maxAbsDelta = Math.max(...rows.map((r) => Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh))), 0);
    // Ensure tiny values (cents) still render a sliver
    const spanFloor = isNarrow ? 5 : 10;
    const paddedSpan = Math.max(spanFloor, maxAbsDelta * 1.2 + 5);
    const labelDigits = Math.max(1, Math.abs(Math.round(paddedSpan)).toLocaleString().length);
    // Keep plot wide; modest grid left, rely on y-axis margin for separation
    const gridLeft = isNarrow ? 30 : 50;
    const showValueLabels = !isNarrow;
    const padRight = Math.max(isNarrow ? 50 : 70, (isNarrow ? 8 : 11) * labelDigits + (isNarrow ? 80 : 110));
    const gridBottom = isNarrow ? 56 : 76;

    const option: ECOption = {
      title: { text: title, left: "center", top: 4, textStyle: { fontWeight: 700, fontSize: 14 } },
      grid: { left: gridLeft, right: padRight, top: 36, bottom: gridBottom, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p) => {
          const items = Array.isArray(p) ? p : [p];
          const name = items[0]?.name ?? "";
          const lines = items.map((it) => {
            const v = Number(it.value);
            const side = it.seriesName;
            return `${side}: ${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(0)}`;
          });
          return `<div><b>${name}</b><br/>${lines.join("<br/>")}</div>`;
        },
      },
      xAxis: {
        type: "value",
        min: -paddedSpan,
        max: paddedSpan,
        axisLine: { onZero: false },
        splitNumber: 4,
        axisLabel: {
          formatter: (v: number) => `$${Math.round(v).toLocaleString()}`,
          fontSize: axisFont,
          rotate: -90,
          margin: 14,
          hideOverlap: true,
        },
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      yAxis: {
        type: "category",
        data: cats,
        axisLabel: {
          fontSize: axisFont,
          margin: labelGap,
          width: labelWidth,
          overflow: "truncate",
          formatter: (v: string) => (v.length > 26 ? `${v.slice(0, 25)}...` : v),
        },
      },
      series: [
        {
          name: "Low",
          type: "bar",
          data: left,
          itemStyle: { color: "#93c5fd" }, // light blue
          label: {
            show: showValueLabels,
            position: "left",
            distance: isNarrow ? 8 : 10,
            formatter: (p) => {
              const v = Math.abs(Number(p.value));
              return v >= 1 ? `$${v.toFixed(0)}` : "";
            },
            fontSize: axisFont,
          },
          barMaxWidth: 26,
          markLine: {
            symbol: "none",
            label: { show: true, formatter: "Base profit", fontSize: axisFont },
            lineStyle: { color: "#94a3b8", type: "dashed" },
            data: [{ xAxis: 0 }],
          },
        },
        {
          name: "High",
          type: "bar",
          data: right,
          itemStyle: { color: "#60a5fa" }, // blue
          label: {
            show: showValueLabels,
            position: "right",
            distance: isNarrow ? 8 : 10,
            formatter: (p) => {
              const v = Math.abs(Number(p.value));
              return v >= 1 ? `$${v.toFixed(0)}` : "";
            },
            fontSize: axisFont,
          },
          barMaxWidth: 26,
        },
      ],
      animation: true,
    };

    chartRef.current.setOption(option);
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [rows, title, vw]);

  type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

  useEffect(() => {
    if (!chartId) return;

    const onExport = (ev: Event) => {
      const e = ev as ExportEvent;
      if (e.detail?.id && e.detail.id !== chartId) return;

      if (e.detail.type === "png") {
        const url = chartRef.current?.getDataURL({
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.download = "tornado.png";
        a.click();
      } else if (e.detail.type === "csv") {
        const rowsCsv = [
          ["name", "base", "delta_low", "delta_high"],
          ...rows.map((r) => [r.name, r.base, r.deltaLow, r.deltaHigh]),
        ];
        const csv = rowsCsv.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tornado.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };

    window.addEventListener("export:tornado", onExport as EventListener);
    return () => window.removeEventListener("export:tornado", onExport as EventListener);
  }, [chartId, rows]);

  if (!rows.length) {
    return (
      <div className="w-full h-64 rounded border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
        Run an optimization or adjust ranges to populate tornado sensitivity.
      </div>
    );
  }

  return <div ref={ref} className="w-full min-h-[420px] lg:min-h-[520px]" />;
}
