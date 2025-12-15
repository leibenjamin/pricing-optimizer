import { TAKE_RATE_COLORS } from "../lib/colors";
import type { TakeRateScenario } from "./TakeRateChart";

type Row = {
  tier: string;
  baseline: number;
  current: number;
  optimized?: number;
};

const CLOSE_ENOUGH = 0.0005;

export function TakeRateDeltaTable({
  scenarios,
  baselineKey,
}: {
  scenarios: TakeRateScenario[];
  baselineKey?: string;
}) {
  if (!scenarios.length) return null;
  const baseline = baselineKey
    ? scenarios.find((s) => s.key === baselineKey)
    : scenarios[0];
  if (!baseline) return null;

  const current = scenarios.find((s) => s.kind === "current") ?? baseline;
  const optimized = scenarios.find((s) => s.kind === "optimized");

  const rows: Row[] = ["None", "Good", "Better", "Best"].map((tierLabel) => {
    const key = tierLabel.toLowerCase() as keyof typeof baseline.shares;
    return {
      tier: tierLabel,
      baseline: baseline.shares[key] * 100,
      current: current.shares[key] * 100,
      optimized: optimized ? optimized.shares[key] * 100 : undefined,
    };
  });

  const baselineEqualsCurrent = rows.every(
    (r) => Math.abs(r.current - r.baseline) < CLOSE_ENOUGH
  );

  const cell = (val: number | undefined, ref: number) => {
    if (val == null || Number.isNaN(val)) return "";
    const delta = val - ref;
    const deltaTxt = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} %pt.`;
    return `${val.toFixed(1)}% (${deltaTxt})`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] uppercase text-slate-500 mb-1">
        Take-rate detail (vs baseline)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-700">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2">Tier</th>
              {baselineEqualsCurrent ? (
                <th className="py-1 pr-2">Baseline &amp; Current</th>
              ) : (
                <>
                  <th className="py-1 pr-2">Baseline</th>
                  <th className="py-1 pr-2">Current</th>
                </>
              )}
              {optimized ? <th className="py-1 pr-2">Optimized</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tier} className="border-t border-slate-100">
                <td className="py-1 pr-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full mr-2 align-middle"
                    style={{
                      backgroundColor:
                        TAKE_RATE_COLORS[
                          r.tier.toLowerCase() as keyof typeof TAKE_RATE_COLORS
                        ],
                    }}
                  />
                  {r.tier}
                </td>
                {baselineEqualsCurrent ? (
                  <td className="py-1 pr-2 text-slate-800">
                    {r.baseline.toFixed(1)}% (no change)
                  </td>
                ) : (
                  <>
                    <td className="py-1 pr-2 text-slate-800">{r.baseline.toFixed(1)}%</td>
                    <td className="py-1 pr-2 text-slate-800">
                      {cell(r.current, r.baseline)}
                    </td>
                  </>
                )}
                {optimized ? (
                  <td className="py-1 pr-2 text-slate-800">
                    {cell(r.optimized, r.baseline)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
