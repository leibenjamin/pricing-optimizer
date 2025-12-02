// src/components/Waterfall.tsx
import { useEffect, useRef, useState } from "react";
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

const SHORT: Record<string, string> = {
  Promo: "Promo",
  volume: "Vol",
  "Payment $": "Pay $",
  "FX %": "FX",
  "Refunds %": "Refunds",
  Pocket: "Pocket",
};

const DEFAULT_COLORS: Record<string, string> = {
  List: "#0ea5e9",
  Promo: "#f97316",
  Volume: "#fb923c",
  "Payment %": "#facc15",
  "Payment $": "#fde047",
  FX: "#38bdf8",
  Refunds: "#f87171",
  Pocket: "#22c55e",
};

export type WaterStep = { label: string; delta: number };

// Compose a strict option type for this chart
type ECOption = ComposeOption<
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | TitleComponentOption
  | DatasetComponentOption
>;

export default function Waterfall({
  title,
  subtitle,
  listPrice,
  steps,
  variant = "full",
  chartId,
  colorMap,
}: {
  title: string;
  subtitle?: string;
  listPrice: number;
  steps: WaterStep[];
  variant?: "full" | "mini";
  chartId?: string;
  colorMap?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const isMini = variant === "mini";
  const palette = colorMap ?? DEFAULT_COLORS;

  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    const localIsMini = variant === "mini";

    // viewport-aware sizes
    const isNarrow = vw < 768;
    const axisFont  = localIsMini ? (isNarrow ? 9  : 10) : (isNarrow ? 11 : 12);
    const labelFont = localIsMini ? (isNarrow ? 8  : 9)  : (isNarrow ? 10 : 12);
    const gridTop   = localIsMini ? (isNarrow ? 20 : 26) : (isNarrow ? 44 : 56);
    const gridBot   = localIsMini ? (isNarrow ? 14 : 18) : (isNarrow ? 44 : 56);
    const rightPad  = localIsMini ? (isNarrow ? 26 : 36) : (isNarrow ? 36 : 52);
    const leftPad   = localIsMini ? (isNarrow ? 64 : 82) : (isNarrow ? 86 : 108);
    const barW      = localIsMini ? (isNarrow ? 7  : 9)  : (isNarrow ? 16 : 20);

    if (!ref.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(ref.current);

    const categories = ["List", ...steps.map((s) => SHORT[s.label] ?? s.label)];

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

    // For mini: only the final pocket bar gets a label (on top).
    // For full: keep plain numbers (framework will label all bars above).
    const labelOrder = ["List", ...steps.map((s) => s.label)];
    const colorFor = (label: string) =>
      palette[label] ?? DEFAULT_COLORS[label] ?? "#0f172a";
    const changeData = changes.map((v, idx) => {
      const labelName = labelOrder[idx] ?? "";
      const color = colorFor(labelName);
      if (!localIsMini) {
        return { value: v, itemStyle: { color } };
      }
      const lbl =
        idx === changes.length - 1
          ? { show: true, position: "top" as const, fontSize: Math.max(8, labelFont - 1) }
          : { show: false };
      return { value: v, label: lbl, itemStyle: { color } };
    });

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
      return `$${v.toFixed(localIsMini ? 2 : 2)}`; // keep 2 decimals; can switch to 1 if preferred
    };

    const option: ECOption = {
      title: {
        text: localIsMini ? title : title,
        subtext: localIsMini ? "" : subtitle ?? "",
        left: "center",
        top: localIsMini ? 4 : 6,
        textStyle: {
          fontSize: localIsMini ? (isNarrow ? 11 : 12) : (isNarrow ? 13 : 14),
          fontWeight: 700,
        },
        subtextStyle: { fontSize: isNarrow ? 11 : 12, color: "#6b7280" },
      },
      grid: {
        left: leftPad,
        right: rightPad,
        top: gridTop,
        bottom: gridBot,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: tipFmt,
        appendToBody: true,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: localIsMini
          ? { show: false }
          : {
              fontSize: axisFont,
              interval: 0,
              margin: 12,
              hideOverlap: true,
              overflow: "truncate",
              width: isNarrow ? 100 : 130,
              rotate: 12,
            },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          show: !localIsMini,
          formatter: (v: number) => `$${v}`,
          fontSize: axisFont,
        },
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
          data: changeData,
          barWidth: barW,
          barCategoryGap: localIsMini ? "60%" : "40%",
          label: {
            show: !localIsMini,
            position: localIsMini ? "inside" : "top",
            fontSize: labelFont,
            padding: localIsMini ? 0 : [2, 3, 2, 3],
            backgroundColor: "rgba(255,255,255,0.8)",
            borderRadius: localIsMini ? 0 : 3,
            formatter: (p) => {
              if (localIsMini && p.dataIndex !== changes.length - 1) return "";
              return labelFmt(p);
            },
          },
          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
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
  }, [title, subtitle, listPrice, steps, variant, vw, palette]);

  type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

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
        const a = document.createElement("a");
        a.href = url;
        a.download = "pocket_waterfall.png";
        a.click();
      } else if (e.detail.type === "csv") {
        // Mirror the columns: List, then each leakage delta, then Pocket
        const pocket = steps.length ? steps[steps.length - 1].delta : listPrice;
        const rows: Array<[string, number]> = [["List", listPrice]];
        for (let i = 0; i < steps.length - 1; i++) {
          rows.push([steps[i].label, steps[i].delta]);
        }
        rows.push(["Pocket", pocket]);

        const csv = ["label,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pocket_waterfall.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    window.addEventListener("export:waterfall", onExport as EventListener);
    return () => window.removeEventListener("export:waterfall", onExport as EventListener);
  }, [chartId, listPrice, steps]);

  return (
    <div className={`relative w-full ${isMini ? "h-56" : "h-80 md:h-72"} overflow-hidden`}>
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}
