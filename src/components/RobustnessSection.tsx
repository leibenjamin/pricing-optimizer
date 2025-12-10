import { Section } from "./Section";
import type { ScenarioResult } from "../lib/robustness";

type Props = {
  results: ScenarioResult[];
};

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function RobustnessSection({ results }: Props) {
  return (
    <Section id="optimizer-robustness" title="Optimizer robustness">
      <div className="text-[11px] text-slate-700 bg-slate-50 border border-dashed border-slate-200 rounded px-3 py-2">
        Stress scenarios scale price sensitivity and leakages to show how fragile the recommendation is. We re-run the grid
        under each scenario and compare profits at your optimized ladder vs the per-scenario optimum.
      </div>
      {results.length === 0 ? (
        <div className="text-xs text-gray-600">Run the optimizer to populate robustness scenarios.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-[11px] border border-slate-200 rounded">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-2 py-1 text-left">Scenario</th>
                <th className="px-2 py-1 text-left">Profit @ optimized ladder</th>
                <th className="px-2 py-1 text-left">Scenario-optimal profit</th>
                <th className="px-2 py-1 text-left">Price shift vs optimized</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.name} className="odd:bg-white even:bg-slate-50">
                  <td className="px-2 py-1 font-semibold text-slate-800">{r.name}</td>
                  <td className="px-2 py-1">{r.profitAtBase != null ? fmtUSD(r.profitAtBase) : "n/a"}</td>
                  <td className="px-2 py-1">{fmtUSD(r.bestProfit)}</td>
                  <td className="px-2 py-1 text-slate-700">
                    {r.priceDelta != null ? `$${r.priceDelta.toFixed(2)} avg abs delta` : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
