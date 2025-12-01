// src/components/SharesMini.tsx
export default function SharesMini({
  title,
  labels,
  values,   // 0..1
  height = 120,
  colors,
}: {
  title?: string;
  labels: string[];
  values: number[];
  height?: number;
  colors?: string[];
}) {
  const w = 520; // SVG scales via width: 100%
  const h = height;
  const pad = 20;

  const barH = (h - 2 * pad) / Math.max(1, values.length);
  const max = Math.max(1e-6, ...values);
  const colorFor = (idx: number) => colors?.[idx] ?? "#10b981";

  return (
    <div className="w-full">
      {title && <div className="text-xs font-medium mb-1">{title}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* axis */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
        {values.map((v, i) => {
          const y = pad + i * barH + 3;
          const bw = (v / max) * (w - 2 * pad);
          return (
            <g key={i}>
              <text x={pad} y={y - 6} fontSize="10" fill="#6b7280">
                {labels[i] ?? ""}
              </text>
              <rect
                x={pad}
                y={y}
                width={bw}
                height={Math.max(6, barH - 10)}
                rx="2"
                fill={colorFor(i)}
              />
              <text
                x={pad + bw + 4}
                y={y + Math.max(6, barH - 10) - 2}
                fontSize="10"
                fill="#374151"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
