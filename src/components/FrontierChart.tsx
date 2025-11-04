import { useEffect, useRef, useState } from "react";
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
import type { CallbackDataParams } from "echarts/types/dist/shared";

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

  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

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

    const isNarrow = vw < 768;
    const axisFont = isNarrow ? 10 : 12;
    const labelFont = isNarrow ? 10 : 12;
    const topPad = isNarrow ? 10 : 16;
    const rightPad = isNarrow ? 8 : 12;
    const bottomPad = isNarrow ? 24 : 30;

    const option: ECOption = {
      animation: false,
      title: {
        text: "Profit vs Best Price (Good/Better fixed)",
        left: "center",
        top: 8,
        // Title font size scales with viewport width
        textStyle: { fontSize: isNarrow ? 12 : 14 },
      },
      grid: {
        left: 40,
        right: rightPad,
        top: topPad,
        bottom: bottomPad,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        name: "Best price",
        nameTextStyle: { fontSize: axisFont },      // axis name font
        axisLabel: { fontSize: axisFont },          // tick label font
      },
      yAxis: {
        type: "value",
        name: "Profit (N=1000)",
        nameTextStyle: { fontSize: axisFont },
        axisLabel: { fontSize: axisFont },
      },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "line",
          smooth: true,
          data: xs.map((x, i) => [x, ys[i]]),
          // If you want to show data labels on the line, enable this:
          label: {
            show: false,               // set to true if wanting labels
            position: "top",
            fontSize: labelFont,
          },
        } as LineSeriesOption,
        ...(optimum
          ? [
              {
                type: "scatter",
                data: [[optimum.bestPrice, optimum.profit]],
                symbolSize: 12,
                itemStyle: { borderWidth: 1 },
                emphasis: { focus: "series" },
                // If you want to label the optimum dot:
                label: {
                  show: true,
                  formatter: (p: CallbackDataParams) => {
                    // ECharts can pass a number, object, or tuple; guard and format only tuples
                    const v = p?.value as number[] | undefined;
                    if (Array.isArray(v) && v.length >= 2) {
                      const [price, prof] = v;
                      return `$${price.toFixed(2)} • ${prof.toFixed(0)}`;
                    }
                    return ""; // fallback (hides text if value isn’t a tuple)
                  },
                  fontSize: labelFont,
                  position: "top",
                },
              } as ScatterSeriesOption,
            ]
          : []),
      ],
    };

    chartRef.current.setOption(option, true);
    chartRef.current.resize();
  }, [points, optimum, vw]);

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
      {/* chart root */}
      <div className="h-64 w-full" ref={divRef} role="img" aria-label="Profit frontier chart" />
    </div>
  );

}
