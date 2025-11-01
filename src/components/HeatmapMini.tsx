// src/components/HeatmapMini.tsx
import type { FeasCell } from "../lib/coverage";

export default function HeatmapMini({
  cells,
  gTicks,
  bTicks,
  title = "Feasible region (Good × Better)",
  height = 220
}: {
  cells: FeasCell[];
  gTicks: number[];
  bTicks: number[];
  title?: string;
  height?: number;
}) {
  const W = 440;
  const H = height;
  const padL = 40, padB = 30, padT = 22, padR = 12;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xScale = (g: number) => {
    const g0 = gTicks[0], g1 = gTicks[gTicks.length - 1] || g0 + 1;
    return padL + ((g - g0) / (g1 - g0)) * plotW;
  };
  const yScale = (b: number) => {
    const b0 = bTicks[0], b1 = bTicks[bTicks.length - 1] || b0 + 1;
    // SVG y grows downward; invert so higher Better is at top
    return padT + (1 - (b - b0) / (b1 - b0)) * plotH;
  };

  // Cell size: use adjacent ticks to estimate
  const cw = gTicks.length > 1 ? xScale(gTicks[1]) - xScale(gTicks[0]) : 16;
  const ch = bTicks.length > 1 ? yScale(bTicks[0]) - yScale(bTicks[1]) : 16;

  return (
    <div className="w-full">
      <div className="text-xs font-medium mb-1">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
        {/* axes */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e5e7eb" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#e5e7eb" />
        {/* ticks */}
        {gTicks.map((g, i) => (
          <text key={`gx${i}`} x={xScale(g)} y={H - padB + 12} fontSize={9} textAnchor="middle" fill="#6b7280">
            {g}
          </text>
        ))}
        {bTicks.map((b, i) => (
          <text key={`by${i}`} x={padL - 6} y={yScale(b) + 3} fontSize={9} textAnchor="end" fill="#6b7280">
            {b}
          </text>
        ))}

        {/* cells */}
        {cells.map((c, i) => {
          const x = xScale(c.g) - cw / 2;
          const y = yScale(c.b) - ch / 2;
          const fill = c.ok ? "#86efac" : "#e5e7eb"; // green vs light gray
          const stroke = c.ok ? "#22c55e" : "#cbd5e1";
          return (
            <rect key={i} x={x} y={y} width={cw} height={ch} fill={fill} stroke={stroke} strokeWidth={0.5} />
          );
        })}
      </svg>
      <div className="text-[11px] text-gray-600 mt-1">
        Green = tiers feasible at pocket-margin floors (Best fixed to a reasonable value).
      </div>
    </div>
  );
}
