import { useEffect, useRef } from "react"
import {
  init,
  use as echartsUse,
  type ECharts,
  type ComposeOption,
} from "echarts/core"
import {
  LineChart,
  ScatterChart,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts"
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  type GridComponentOption,
  type TitleComponentOption,
  type TooltipComponentOption,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"

echartsUse([LineChart, ScatterChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer])

type ECOption = ComposeOption<
  LineSeriesOption | ScatterSeriesOption | GridComponentOption | TitleComponentOption | TooltipComponentOption
>

export interface FrontierPoint { bestPrice: number; profit: number }

export default function FrontierChartReal({
  points,
  optimum,
}: {
  points: FrontierPoint[]
  optimum: FrontierPoint | null
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  // Init once
  useEffect(() => {
    if (!divRef.current) return
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" })
    const onResize = () => chartRef.current?.resize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  // Update option when data changes
  useEffect(() => {
    if (!chartRef.current) return
    const xs = points.map(p => p.bestPrice)
    const ys = points.map(p => p.profit)

    const option: ECOption = {
      animation: false,
      title: { text: "Profit vs Best Price (Good/Better fixed)" },
      xAxis: { type: "value", name: "Best price", nameLocation: "end" },
      yAxis: { type: "value", name: "Profit (N=1000)", nameLocation: "end" },
      grid: { left: 48, right: 12, top: 28, bottom: 36 },
      tooltip: { trigger: "axis" },
      series: [
        { type: "line", smooth: true, data: xs.map((x, i) => [x, ys[i]]) },
        ...(optimum
          ? [{
              type: "scatter",
              data: [[optimum.bestPrice, optimum.profit]],
              symbolSize: 12,
              itemStyle: { borderWidth: 1 },
              emphasis: { focus: "series" },
            } as ScatterSeriesOption]
          : []),
      ],
    }

    chartRef.current.setOption(option, true)
    chartRef.current.resize()
  }, [points, optimum])

  return <div className="h-64 w-full" ref={divRef} />
}
