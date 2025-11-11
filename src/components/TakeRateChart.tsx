import { useEffect, useRef, useState } from "react"
import {
  init,
  use as echartsUse,
  type ECharts,
  type ComposeOption,
} from "echarts/core"
import { BarChart, type BarSeriesOption } from "echarts/charts"
import {
  GridComponent,
  TooltipComponent,
  type GridComponentOption,
  type TooltipComponentOption,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { downloadBlob, csvFromRows } from "../lib/download";

// Register only what we need
echartsUse([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

// Build a typed Option from the parts we use
type ECOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption
>

export interface TakeRateData {
  none: number
  good: number
  better: number
  best: number
}

export default function TakeRateChart(props: {
  chartId?: string;
  className?: string;
  data: TakeRateData;
  [key: string]: unknown;
}) {
  const { chartId = "takerate", className, data } = props;
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);

  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (!divRef.current) return
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" })
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
     if (!chartRef.current) return;

    const isNarrow = vw < 768;
    const axisFont = isNarrow ? 10 : 12;
    const labelFont = isNarrow ? 10 : 12;
    const topPad = isNarrow ? 14 : 20;
    const bottomPad = isNarrow ? 24 : 30;

    const pct = (x: number) => Math.round(x * 1000) / 10; // 1 decimal %

    const option: ECOption = {
      animation: false,
      xAxis: { type: "category", data: ["None", "Good", "Better", "Best"], axisLabel: { fontSize: axisFont } },
      yAxis: { type: "value", axisLabel: { formatter: "{value}%", fontSize: axisFont } },
      series: [
        {
          type: "bar",
          data: [data.none, data.good, data.better, data.best].map((v: number) => pct(v)),
          label: { show: false, fontSize: labelFont },
        },
      ],
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 10, top: topPad, bottom: bottomPad, containLabel: true },
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();
  }, [data.none, data.good, data.better, data.best, vw]);

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
        // Trigger a download from the data URL
        const a = document.createElement("a");
        a.href = url;
        a.download = `take_rate_${chartId}.png`;
        a.click();
        return;
      }

      // CSV branch — use the typed TakeRateData
      const rows: (string | number)[][] = [
        ["tier", "take_rate_pct"],
        ["None",   (data.none   * 100).toFixed(2)],
        ["Good",   (data.good   * 100).toFixed(2)],
        ["Better", (data.better * 100).toFixed(2)],
        ["Best",   (data.best   * 100).toFixed(2)],
      ];
      const csv = csvFromRows(rows);
      downloadBlob(csv, `take_rate_${chartId}.csv`, "text/csv;charset=utf-8");
    };

    window.addEventListener("export:takerate", handler as EventListener);
    return () => window.removeEventListener("export:takerate", handler as EventListener);
  // depend on primitives to satisfy exhaustive-deps without object identity noise
  }, [chartId, data.none, data.good, data.better, data.best]);

  return (
    <div className={`w-full ${className ?? ""}`}>
      {/* tiny toolbar */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600">Take-rate by tier</div>
        <button
          className="text-[11px] border rounded px-2 py-1 bg-white hover:bg-gray-50"
          aria-label="Download take-rate CSV"
          onClick={() => {
            const rows: (string | number)[][] = [
              ["tier", "take_rate_pct"],
              ["None",   (data.none   * 100).toFixed(2)],
              ["Good",   (data.good   * 100).toFixed(2)],
              ["Better", (data.better * 100).toFixed(2)],
              ["Best",   (data.best   * 100).toFixed(2)],
            ];
            const csv = csvFromRows(rows);
            downloadBlob(csv, "take_rate.csv", "text/csv;charset=utf-8");
          }}
        >
          CSV
        </button>
      </div>

      {/* chart root */}
      <div className="h-64 w-full" ref={divRef} />
    </div>
  );

}
