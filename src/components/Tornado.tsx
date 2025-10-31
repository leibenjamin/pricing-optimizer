// src/components/Tornado.tsx
import { useEffect, useRef } from "react";
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
}: {
  title?: string;
  rows: TornadoDatum[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(ref.current);

    // Prepare series: left bars (low deltas), right bars (high deltas)
    const cats = rows.map((r) => r.name);
    const left = rows.map((r) => Math.min(0, r.deltaLow));
    const right = rows.map((r) => Math.max(0, r.deltaHigh));

    const option: ECOption = {
      title: { text: title, left: "center", top: 4, textStyle: { fontWeight: 700, fontSize: 14 } },
      grid: { left: 70, right: 30, top: 32, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p) => {
          const items = Array.isArray(p) ? p : [p];
          const name = items[0]?.name ?? "";
          const lines = items.map((it) => {
            const v = Number(it.value);
            const side = it.seriesName;
            return `${side}: ${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(0)}`;
          });
          return `<div><b>${name}</b><br/>${lines.join("<br/>")}</div>`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => `$${v}` },
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      yAxis: {
        type: "category",
        data: cats,
        axisLabel: { fontSize: 12 },
      },
      series: [
        {
          name: "Low",
          type: "bar",
          data: left,
          itemStyle: { color: "#93c5fd" }, // light blue
          label: {
            show: true,
            position: "left",
            formatter: (p) => `$${Math.abs(Number(p.value)).toFixed(0)}`,
            fontSize: 11,
          },
        },
        {
          name: "High",
          type: "bar",
          data: right,
          itemStyle: { color: "#60a5fa" }, // blue
          label: {
            show: true,
            position: "right",
            formatter: (p) => `$${Math.abs(Number(p.value)).toFixed(0)}`,
            fontSize: 11,
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
  }, [rows, title]);

  return <div ref={ref} className="w-full h-96" />;
}
