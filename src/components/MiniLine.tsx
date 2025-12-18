// src/components/MiniLine.tsx

import { useEffect, useMemo, useRef } from "react";
import { csvFromRows, downloadBlob } from "../lib/download";

type Series = {
  label: string;
  x: number[];
  y: number[];
  color?: string;
};

const PALETTE = ["#2563eb", "#10b981", "#f97316", "#a855f7"];

export default function MiniLine({
  title,
  x,
  y,
  series,
  height = 140,
  chartId,
  exportKind = "cohort",
}: {
  title?: string;
  x?: number[];
  y?: number[];
  series?: Series[];
  height?: number;
  chartId?: string;
  exportKind?: string;
}) {
  // Normalize into a series array for rendering/export
  const lines: Series[] = useMemo(() => {
    if (series && series.length) {
      return series.map((s, idx) => ({
        ...s,
        color: s.color ?? PALETTE[idx % PALETTE.length],
      }));
    }
    if (x && y) {
      return [{ label: "Series", x, y, color: PALETTE[0] }];
    }
    return [];
  }, [series, x, y]);

  const w = 520; // SVG will scale with CSS width: 100%
  const h = height;
  const pad = 24;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const hasLines = lines.length > 0;

  const xDomain = hasLines
    ? [lines[0].x[0] ?? 0, lines[0].x[lines[0].x.length - 1] ?? 1]
    : [0, 1];
  const yValues = hasLines ? lines.flatMap((s) => s.y) : [0];
  const minY = Math.min(...yValues, 0);
  const maxY = Math.max(...yValues, 1e-6);

  const xScale = (val: number) =>
    pad + ((w - 2 * pad) * (val - xDomain[0])) / (xDomain[1] - xDomain[0] || 1);
  const yScale = (val: number) =>
    h - pad - ((h - 2 * pad) * (val - minY)) / (maxY - minY || 1);

  const paths = lines.map((s) => {
    const d =
      s.y.length > 0
        ? s.y
            .map((v, i) => `${i ? "L" : "M"} ${xScale(s.x[i])} ${yScale(v)}`)
            .join(" ")
        : "";
    return { label: s.label, color: s.color ?? PALETTE[0], d };
  });

  useEffect(() => {
    if (!chartId || !exportKind) return;
    type ExportDetail = { id?: string; type?: "png" | "csv" };
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<ExportDetail>;
      if (ce.detail?.id && ce.detail.id !== chartId) return;
      const type = ce.detail?.type ?? "png";
      if (type === "csv") {
        const header = ["x", ...lines.map((s) => s.label)];
        const rows: (string | number)[][] = [header];
        const len = lines[0]?.x.length ?? 0;
        for (let i = 0; i < len; i++) {
          rows.push([
            lines[0].x[i],
            ...lines.map((s) => s.y[i] ?? ""),
          ]);
        }
        const csv = csvFromRows(rows);
        downloadBlob(csv, `${chartId}.csv`, "text/csv;charset=utf-8");
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
  }, [chartId, exportKind, lines, title, w, h]);

  return (
    <div className="w-full">
      {title && <div className="text-xs font-medium mb-1">{title}</div>}
      <div className="flex items-center gap-2 text-[10px] text-slate-600 mb-1 flex-wrap">
        {lines.map((s, idx) => (
          <span key={idx} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-1.5 rounded-full"
              style={{ backgroundColor: s.color ?? PALETTE[idx % PALETTE.length] }}
            />
            {s.label}
          </span>
        ))}
        {!hasLines && <span className="text-slate-400">No data</span>}
      </div>
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
        {/* lines */}
        {paths.map((p, idx) => (
          <path
            key={p.label + idx}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
