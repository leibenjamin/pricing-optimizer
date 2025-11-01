// src/components/MiniLine.tsx

export default function MiniLine({
  title,
  x,
  y,
  height = 140,
}: {
  title?: string;
  x: number[]; // 1..N
  y: number[]; // values
  height?: number;
}) {
  const w = 520; // SVG will scale with CSS width: 100%
  const h = height;
  const pad = 24;

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

  return (
    <div className="w-full">
      {title && <div className="text-xs font-medium mb-1">{title}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
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
