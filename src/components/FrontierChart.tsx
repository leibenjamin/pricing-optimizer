import { useEffect, useRef } from "react";
import {
  init,
  use as echartsUse,
  type ECharts,
  type ComposeOption,
} from "echarts/core";
import {
  LineChart,
  ScatterChart,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  type GridComponentOption,
  type TitleComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echartsUse([
  LineChart,
  ScatterChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TitleComponentOption
  | TooltipComponentOption
>;

export interface FrontierPoint {
  bestPrice: number;
  profit: number;
}

type ExportEvent = CustomEvent<{ id: string; type: "png" | "csv" }>;

export default function FrontierChartReal({
  points,
  optimum,
  chartId,
}: {
  points: FrontierPoint[];
  optimum: FrontierPoint | null;
  chartId?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  // Init once
  useEffect(() => {
    if (!divRef.current) return;
    chartRef.current = init(divRef.current, undefined, { renderer: "canvas" });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update option when data changes
  useEffect(() => {
    if (!chartRef.current) return;
    const xs = points.map((p) => p.bestPrice);
    const ys = points.map((p) => p.profit);

    const option: ECOption = {
      animation: false,
      title: {
        text: "Profit vs Best Price (Good/Better fixed)",
        left: "center",
        top: 8,
      },
      grid: { left: 60, right: 20, top: 70, bottom: 40 }, // ↑ more top padding
      xAxis: {
        type: "value",
        name: "Best price",
        nameLocation: "middle",
        nameGap: 28,
      },
      yAxis: {
        type: "value",
        name: "Profit (N=1000)",
        nameLocation: "middle",
        nameGap: 42, // ↑ room for y-axis name
        axisLabel: { formatter: (v: number) => v.toLocaleString() },
      },
      tooltip: { trigger: "axis" },
      series: [
        { type: "line", smooth: true, data: xs.map((x, i) => [x, ys[i]]) },
        ...(optimum
          ? [
              {
                type: "scatter",
                data: [[optimum.bestPrice, optimum.profit]],
                symbolSize: 12,
                itemStyle: { borderWidth: 1 },
                emphasis: { focus: "series" },
              } as ScatterSeriesOption,
            ]
          : []),
      ],
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();
  }, [points, optimum]);

  // Listen for export events from ActionCluster
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
        a.download = "profit_frontier.png";
        a.click();
      } else if (e.detail.type === "csv") {
        const rows = [["best_price", "profit"], ...points.map(p => [p.bestPrice, p.profit])];
        const csv = rows.map(r => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "profit_frontier.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    window.addEventListener("export:frontier", onExport as EventListener);
    return () => window.removeEventListener("export:frontier", onExport as EventListener);
  }, [chartId, points]);


  return (
    <div className="w-full">
      {/* tiny toolbar */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600">
          Profit Frontier
        </div>
        <button
          className="text-[11px] border rounded px-2 py-1 bg-white hover:bg-gray-50"
          aria-label="Export frontier as PNG"
          onClick={() => {
            const inst = chartRef.current;
            if (!inst) return;
            const url = inst.getDataURL({
              type: "png",
              pixelRatio: 2,
              backgroundColor: "#ffffff",
            });
            const a = document.createElement("a");
            a.href = url;
            a.download = "profit_frontier.png";
            a.click();
          }}
        >
          PNG
        </button>
      </div>

      {/* chart root */}
      <div className="h-64 w-full" ref={divRef} />
    </div>
  );

}
