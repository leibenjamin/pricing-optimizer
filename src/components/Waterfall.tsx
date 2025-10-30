// src/components/Waterfall.tsx
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";

// charts
import { BarChart, type BarSeriesOption } from "echarts/charts";

// components
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type TitleComponentOption,
  type DatasetComponentOption,
} from "echarts/components";

// renderer
import { CanvasRenderer } from "echarts/renderers";

// core types
import type { ComposeOption } from "echarts/core";
import type {
  CallbackDataParams,
  LabelFormatterCallback,
} from "echarts/types/dist/shared";

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  CanvasRenderer,
]);

export type WaterStep = { label: string; delta: number };

// Compose a strict option type for this chart
type ECOption = ComposeOption<
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | TitleComponentOption
  | DatasetComponentOption
>;

export function Waterfall({
  title,
  subtitle,
  listPrice,
  steps,
  onDownloadLabel = "PNG",
}: {
  title: string;
  subtitle?: string;
  listPrice: number;
  steps: WaterStep[];
  onDownloadLabel?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(ref.current);

    const categories = ["List", ...steps.map((s) => s.label)];

    // Build cumulative base and change arrays to simulate a waterfall:
    const changes: number[] = [];
    const base: number[] = [];

    let running = listPrice;
    // First column: List (base only)
    base.push(0);
    changes.push(listPrice);

    for (let i = 0; i < steps.length; i++) {
      const d = steps[i].delta;
      if (i === steps.length - 1) {
        // final "Pocket": show as a total bar
        base.push(0);
        changes.push(d);
      } else {
        // intermediate leakage (negative delta)
        base.push(Math.max(0, running + (d < 0 ? d : 0)));
        changes.push(d);
        running += d;
      }
    }

    // Strongly-typed tooltip formatter (no 'any')
    const tipFmt = (params: CallbackDataParams | CallbackDataParams[]) => {
      const item = Array.isArray(params) ? params[1] : params;
      const name = String(item.name ?? "");
      const val = Number(item.value);
      return `${name}: $${val.toFixed(2)}`;
    };

    // Strongly-typed series label formatter
    const labelFmt: LabelFormatterCallback<CallbackDataParams> = (p) => {
      const raw = p.value as unknown;
      let v = 0;
      if (Array.isArray(raw)) v = Number(raw[1] ?? raw[0] ?? 0);
      else if (raw == null) v = 0;
      else if (typeof raw === "object")
        v = Number((raw as { value?: unknown }).value ?? 0);
      else v = Number(raw);
      return `$${v.toFixed(2)}`;
    };

    const option: ECOption = {
      title: {
        text: title,
        subtext: subtitle ?? "",
        left: "center",
        top: 6,
        textStyle: { fontSize: 14, fontWeight: 700 },
        subtextStyle: { fontSize: 12, color: "#6b7280" },
      },
      grid: { left: 56, right: 20, top: 56, bottom: 44 }, // more breathing room
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: tipFmt,
        appendToBody: true,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { rotate: 0, margin: 12 },
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => `$${v}` },
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      series: [
        {
          name: "base",
          type: "bar",
          stack: "total",
          itemStyle: { color: "rgba(0,0,0,0)" },
          emphasis: { itemStyle: { color: "rgba(0,0,0,0)" } },
          data: base,
          tooltip: { show: false },
          silent: true,
          barGap: "-100%",
        },
        {
          name: "change",
          type: "bar",
          stack: "total",
          data: changes,
          barCategoryGap: "40%",
          label: {
            show: true,
            position: "top",
            fontSize: 10,
            padding: [2, 3, 2, 3],
            backgroundColor: "rgba(255,255,255,0.8)",
            borderRadius: 3,
            formatter: labelFmt,
          },
          // hide overlapping labels & allow ECharts to nudge them
          labelLayout: { hideOverlap: true },
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
  }, [title, subtitle, listPrice, steps]);

  return (
    <div className="relative w-full h-80 md:h-72">
      <button
        className="absolute right-2 top-2 text-[10px] border rounded px-2 py-1 bg-white/70"
        onClick={() => {
          if (!chartRef.current) return;
          const url = chartRef.current.getDataURL({
            type: "png",
            pixelRatio: 2,
            backgroundColor: "#ffffff",
          });
          const a = document.createElement("a");
          a.href = url;
          a.download = "waterfall.png";
          a.click();
        }}
      >
        {onDownloadLabel}
      </button>
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}
