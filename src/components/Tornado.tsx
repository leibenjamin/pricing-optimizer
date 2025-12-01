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
    const labelWidth = isNarrow ? 110 : 160;
    const gridLeft = isNarrow ? 90 : 120;
    const showValueLabels = !isNarrow;

    const option: ECOption = {
      title: { text: title, left: "center", top: 4, textStyle: { fontWeight: 700, fontSize: 14 } },
      grid: { left: gridLeft, right: isNarrow ? 40 : 60, top: 36, bottom: 32, containLabel: true },
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
        axisLabel: { formatter: (v: number) => `$${v}`, fontSize: axisFont },
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      yAxis: {
        type: "category",
        data: cats,
        axisLabel: { fontSize: axisFont, margin: 12, width: labelWidth, overflow: "break" },
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
            formatter: (p) => `$${Math.abs(Number(p.value)).toFixed(0)}`,
            fontSize: axisFont,
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
            formatter: (p) => `$${Math.abs(Number(p.value)).toFixed(0)}`,
            fontSize: axisFont,
          },
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

  return <div ref={ref} className="w-full h-96" />;
}

