import { useEffect, useRef } from "react"
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

export default function TakeRateChart({ data }: { data: TakeRateData }) {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" })
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return

    const option: ECOption = {
      animation: false,
      xAxis: { type: "category", data: ["None", "Good", "Better", "Best"] },
      yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
      series: [
        {
          type: "bar",
          data: [data.none, data.good, data.better, data.best].map(
            (x) => Math.round(x * 1000) / 10
          ),
        },
      ],
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 10, top: 20, bottom: 30 },
    }

    chartRef.current.setOption(option, true)
    chartRef.current.resize()
  }, [data])

  return (
    <div className="w-full">
      {/* tiny toolbar */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600">Take-rate by tier</div>
        <button
          className="text-[11px] border rounded px-2 py-1 bg-white hover:bg-gray-50"
          aria-label="Download take-rate CSV"
          onClick={() => {
            const rows = [
              ["tier", "take_rate_pct"],
              ["None",  (data.none   * 100).toFixed(2)],
              ["Good",  (data.good   * 100).toFixed(2)],
              ["Better",(data.better * 100).toFixed(2)],
              ["Best",  (data.best   * 100).toFixed(2)],
            ];
            const csv = rows.map(r => r.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "take_rate.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
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
