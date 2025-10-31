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

const SHORT: Record<string, string> = {
  Promo: "Promo",
  volume: "Vol",
  "Payment $": "Pay $",
  "FX %": "FX",
  "Refunds %": "Refunds",
  Pocket: "Pocket",
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

export function Waterfall({
  title,
  subtitle,
  listPrice,
  steps,
  variant = "full", // "full" | "mini"
  onDownloadLabel = "PNG",
}: {
  title: string;
  subtitle?: string;
  listPrice: number;
  steps: WaterStep[];
  variant?: "full" | "mini";
  onDownloadLabel?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const isMini = variant === "mini";

  useEffect(() => {
    const localIsMini = variant === "mini";

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
    const changeData = changes.map((v, idx) => {
      if (!localIsMini) return v;
      // Explicit label shape (structural typing)
      const lbl =
        idx === changes.length - 1
          ? { show: true, position: "top" as const, fontSize: 9 }
          : { show: false };
      return { value: v, label: lbl };
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
        left: localIsMini ? "center" : "center",
        top: localIsMini ? 4 : 6,
        textStyle: { fontSize: localIsMini ? 12 : 14, fontWeight: 700 },
        subtextStyle: { fontSize: 12, color: "#6b7280" },
      },
      grid: localIsMini
        ? { left: 24, right: 20, top: 22, bottom: 10, containLabel: true }
        : { left: 56, right: 28, top: 44, bottom: 40, containLabel: true },
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
          ? { show: false } // hide category labels in mini
          : {
            fontSize: 12,
            interval: 0,
            margin: 8,
            hideOverlap: true,
          },
      },
      yAxis: {
        type: "value",
        axisLabel: { show: !localIsMini, formatter: (v: number) => `$${v}` },
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
          barWidth: localIsMini ? 10 : 22,    // narrower bars in minis
          barCategoryGap: localIsMini ? "60%" : "40%",
          label: {
            show: !localIsMini,               // minis use per-point labels above
            position: localIsMini ? "inside" : "top",
            fontSize: localIsMini ? 9 : 11,
            padding: localIsMini ? 0 : [2, 3, 2, 3],
            backgroundColor: "rgba(255,255,255,0.8)",
            borderRadius: localIsMini ? 0 : 3,
            formatter: (p) => {
              // in mini: only label the final bar (Pocket)
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
  }, [title, subtitle, listPrice, steps, variant]);

  return (
    <div className={`relative w-full ${isMini ? "h-56" : "h-80 md:h-72"} overflow-hidden`}>
      {!isMini && (
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
      )}
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}
