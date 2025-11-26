import { useEffect, useRef } from "react";
import type { FeasCell } from "../lib/coverage";

type HeatmapMiniProps = {
  cells: FeasCell[];
  gTicks: number[];
  bTicks: number[];
  title?: string;
  height?: number;
  chartId?: string;
  exportKind?: string;
};

export default function HeatmapMini({
  cells,
  gTicks,
  bTicks,
  title = "Feasible region (Good vs Better)",
  height = 220,
  chartId,
  exportKind = "coverage",
}: HeatmapMiniProps) {
  const W = 440;
  const H = height;
  const padL = 40;
  const padB = 30;
  const padT = 22;
  const padR = 12;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xScale = (g: number) => {
    const g0 = gTicks[0];
    const g1 = gTicks[gTicks.length - 1] ?? g0 + 1;
    const span = g1 - g0 || 1;
    return padL + ((g - g0) / span) * plotW;
  };

  const yScale = (b: number) => {
    const b0 = bTicks[0];
    const b1 = bTicks[bTicks.length - 1] ?? b0 + 1;
    const span = b1 - b0 || 1;
    return padT + (1 - (b - b0) / span) * plotH;
  };

  const cw = gTicks.length > 1 ? xScale(gTicks[1]) - xScale(gTicks[0]) : 16;
  const ch = bTicks.length > 1 ? yScale(bTicks[0]) - yScale(bTicks[1]) : 16;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!chartId || !exportKind) return;

    type ExportDetail = { id?: string; type?: "png" | "csv" };
    const handler = (ev: Event) => {
      const { detail } = ev as CustomEvent<ExportDetail>;
      if (!detail) return;
      if (detail.id && detail.id !== chartId) return;

      const type = detail.type ?? "png";
      if (type === "csv") {
        const rows = [
          ["good_price", "better_price", "feasible"],
          ...cells.map((c) => [c.g, c.b, c.ok ? 1 : 0]),
        ];
        const csv = rows.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${chartId}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        return;
      }

      const svg = svgRef.current;
      if (!svg) return;
      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([serialized], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = svg.viewBox.baseVal.width;
        canvas.height = svg.viewBox.baseVal.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => {
          if (!png) return;
          const dl = document.createElement("a");
          dl.href = URL.createObjectURL(png);
          dl.download = `${chartId}.png`;
          dl.click();
          setTimeout(() => URL.revokeObjectURL(dl.href), 500);
        }, "image/png");
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    };

    const evt = `export:${exportKind}`;
    window.addEventListener(evt, handler as EventListener);
    return () => window.removeEventListener(evt, handler as EventListener);
  }, [chartId, exportKind, cells]);

  return (
    <div className="w-full relative">
      <div className="text-xs font-medium mb-1">{title}</div>
      <svg
        ref={svgRef}
        data-heatmap-mini
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e5e7eb" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#e5e7eb" />
        {gTicks.map((g, i) => (
          <text
            key={`gx${i}`}
            x={xScale(g)}
            y={H - padB + 12}
            fontSize={9}
            textAnchor="middle"
            fill="#6b7280"
          >
            {g}
          </text>
        ))}
        {bTicks.map((b, i) => (
          <text
            key={`by${i}`}
            x={padL - 6}
            y={yScale(b) + 3}
            fontSize={9}
            textAnchor="end"
            fill="#6b7280"
          >
            {b}
          </text>
        ))}
        {cells.map((c, i) => {
          const x = xScale(c.g) - cw / 2;
          const y = yScale(c.b) - ch / 2;
          const fill = c.ok ? "#86efac" : "#e5e7eb";
          const stroke = c.ok ? "#22c55e" : "#cbd5e1";
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={cw}
              height={ch}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.5}
            />
          );
        })}
      </svg>
      <div className="text-[11px] text-gray-600 mt-1">
        Green = Good/Better price pairs that clear pocket-margin floors with Best pinned near its lowest feasible point;
        gray = fails a gap or a floor.
      </div>
    </div>
  );
}
