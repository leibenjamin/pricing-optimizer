import { useEffect, useRef } from "react"
import * as echarts from "echarts"

export interface TakeRateData { none:number; good:number; better:number; best:number }

export default function TakeRateChart({ data }: { data: TakeRateData }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const update = () => {
      chart.setOption({
        xAxis: { type: "category", data: ["None","Good","Better","Best"] },
        yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
        series: [{ type: "bar", data: [data.none,data.good,data.better,data.best].map(x=>Math.round(x*1000)/10) }],
        tooltip: { trigger: "axis", valueFormatter: v => `${v}%` },
        grid: { left: 40, right: 10, top: 20, bottom: 30 },
      })
    }
    update()
    const onResize = () => chart.resize()
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); chart.dispose() }
  }, [data])
  return <div className="h-64 w-full" ref={ref} />
}
