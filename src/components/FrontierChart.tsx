import { useEffect, useRef } from "react"
import * as echarts from "echarts"

export interface FrontierPoint { bestPrice:number; profit:number }

export default function FrontierChartReal({ points, optimum }: { points: FrontierPoint[]; optimum: FrontierPoint|null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const xs = points.map(p=>p.bestPrice)
    const ys = points.map(p=>p.profit)
    chart.setOption({
      title: { text: "Profit vs Best Price (Good/Better fixed)" },
      xAxis: { type: "value", name: "Best price" },
      yAxis: { type: "value", name: "Profit (N=1000)" },
      series: [
        { type: "line", smooth: true, data: xs.map((x,i)=>[x,ys[i]]) },
        ...(optimum ? [{ type:"scatter", data:[[optimum.bestPrice,optimum.profit]], symbolSize:10 }] : [])
      ],
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 12, top: 28, bottom: 36 }
    })
    const onResize = () => chart.resize()
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); chart.dispose() }
  }, [points, optimum])
  return <div className="h-64 w-full" ref={ref} />
}
