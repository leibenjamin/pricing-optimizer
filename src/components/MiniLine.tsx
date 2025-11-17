// src/components/MiniLine.tsx
import { useEffect, useRef } from "react";

export default function MiniLine({
  title,
  x,
  y,
  height = 140,
  chartId,
  exportKind = "cohort",
}: {
  title?: string;
  x: number[]; // 1..N
  y: number[]; // values
  height?: number;
  chartId?: string;
  exportKind?: string;
}) {
  const w = 520; // SVG will scale with CSS width: 100%
  const h = height;
  const pad = 24;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const minY = Math.min(...y, 0);
  const maxY = Math.max(...y, 1e-6);
  const xScale = (i: number) =>
    pad + ((w - 2 * pad) * (i - x[0])) / (x[x.length - 1] - x[0] || 1);
  const yScale = (v: number) =>
    h - pad - ((h - 2 * pad) * (v - minY)) / (maxY - minY || 1);

  const d =
    y.length > 0
      ? y
          .map((v, i) => `${i ? "L" : "M"} ${xScale(x[i])} ${yScale(v)}`)
          .join(" ")
      : "";

  useEffect(() => {
    if (!chartId || !exportKind) return;
    type ExportDetail = { id?: string; type?: "png" | "csv" };
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<ExportDetail>;
      if (ce.detail?.id && ce.detail.id !== chartId) return;
      const type = ce.detail?.type ?? "png";
      if (type === "csv") {
        const rows: (string | number)[][] = [
          ["x", "y"],
          ...x.map((xi, idx) => [xi, y[idx]]),
        ];
        const csv = rows
          .map((row) => row.map((cell) => String(cell)).join(","))
          .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${chartId}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      } else {
        const svg = svgRef.current;
        if (!svg) return;
        const serializer = new XMLSerializer();
        const src = serializer.serializeToString(svg);
        const svgBlob = new Blob([src], {
          type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `${chartId}.png`;
          a.click();
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      }
    };
    const evtName = `export:${exportKind}`;
    window.addEventListener(evtName, handler as EventListener);
    return () => window.removeEventListener(evtName, handler as EventListener);
  }, [chartId, exportKind, x, y, title, w, h]);

  return (
    <div className="w-full">
      {title && <div className="text-xs font-medium mb-1">{title}</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* axes */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />
        {/* zero line if within range */}
        {minY < 0 && maxY > 0 && (
          <line
            x1={pad}
            y1={yScale(0)}
            x2={w - pad}
            y2={yScale(0)}
            stroke="#f3f4f6"
          />
        )}
        {/* line */}
        <path d={d} fill="none" stroke="#2563eb" strokeWidth={2} />
      </svg>
    </div>
  );
}
