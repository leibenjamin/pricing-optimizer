import type { ReactNode, Dispatch, SetStateAction } from "react";
import type { Prices } from "../lib/segments";
import type { Constraints, GridDiagnostics, SearchRanges } from "../lib/optimize";
import InfoTip from "./InfoTip";
import { Section } from "./Section";

type OptimizerKind = "grid-worker" | "grid-inline" | "future";

type OptimizerResult = {
  prices: Prices;
  profit: number;
  diagnostics?: GridDiagnostics;
} | null;

type OptimizerPanelProps = {
  optRanges: SearchRanges;
  setOptRanges: Dispatch<SetStateAction<SearchRanges>>;
  optConstraints: Constraints;
  setOptConstraints: Dispatch<SetStateAction<Constraints>>;
  coverageUsePocket: boolean;
  setCoverageUsePocket: Dispatch<SetStateAction<boolean>>;
  optError: string | null;
  optResult: OptimizerResult;
  quickOptDiagnostics?: GridDiagnostics;
  isOptRunning: boolean;
  optimizerWhyLines: string[];
  optimizerKind: OptimizerKind;
  setOptimizerKind: Dispatch<SetStateAction<OptimizerKind>>;
  runOptimizer: () => void;
  applyOptimizedPrices: () => void;
  onQuickOptimize: () => void;
  onResetOptimizer: () => void;
  prices: Prices;
  costs: Prices;
  headline?: ReactNode;
  actions?: ReactNode;
};

export function OptimizerPanel({
  optRanges,
  setOptRanges,
  optConstraints,
  setOptConstraints,
  coverageUsePocket,
  setCoverageUsePocket,
  optError,
  optResult,
  quickOptDiagnostics,
  isOptRunning,
  optimizerWhyLines,
  optimizerKind,
  setOptimizerKind,
  runOptimizer,
  applyOptimizedPrices,
  onQuickOptimize,
  onResetOptimizer,
  prices,
  costs,
  headline,
  actions,
}: OptimizerPanelProps) {
  const diag: GridDiagnostics | undefined = optResult?.diagnostics ?? quickOptDiagnostics;

  return (
    <Section id="global-optimizer" title="Global Optimizer" actions={actions}>
      {headline}
      <div className="text-[11px] text-slate-600 mb-1">
        We auto-pin the current scenario as a baseline before every run so scorecard deltas stay anchored.
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <span className="font-semibold mr-2 basis-full sm:basis-auto">Ranges ($)</span>

          {(["good", "better", "best"] as const).map((tier) => (
            <label key={tier} className="flex items-center gap-1">
              <span className="w-12 capitalize">{tier}</span>
              <input
                type="number"
                className="border rounded px-2 h-8 w-16"
                aria-label={`${tier} min`}
                value={optRanges[tier][0]}
                onChange={(e) =>
                  setOptRanges((r) => ({
                    ...r,
                    [tier]: [Number(e.target.value), r[tier][1]] as [number, number],
                  }))
                }
              />
              <span>-</span>
              <input
                type="number"
                className="border rounded px-2 h-8 w-16"
                aria-label={`${tier} max`}
                value={optRanges[tier][1]}
                onChange={(e) =>
                  setOptRanges((r) => ({
                    ...r,
                    [tier]: [r[tier][0], Number(e.target.value)] as [number, number],
                  }))
                }
              />
            </label>
          ))}

          <label className="flex items-center gap-1">
            <span className="w-16">Step between Prices</span>
            <input
              type="number"
              className="border rounded px-2 h-8 w-16"
              aria-label="Step"
              value={optRanges.step}
              onChange={(e) =>
                setOptRanges((r) => ({
                  ...r,
                  step: Math.max(0.25, Number(e.target.value)),
                }))
              }
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50"
              onClick={runOptimizer}
              disabled={isOptRunning}
            >
              {isOptRunning ? "Running..." : "Run"}
            </button>
            <button
              className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50 disabled:opacity-50"
              onClick={applyOptimizedPrices}
              disabled={!optResult || isOptRunning}
            >
              Apply
            </button>
          </div>

          {diag && (() => {
            const guardrailNote =
              diag.skippedGuardrails > 0
                ? `${diag.skippedGuardrails.toLocaleString()} ladders skipped by guardrails (none-share/take-rate/floors). `
                : "";
            const coarsenNote = diag.coarsened ? "Grid auto-coarsened for performance. " : "";
            return (
              <div className="text-[11px] text-slate-600 mt-2">
                Tested {diag.tested.toLocaleString()} ladders; coarse step ${diag.coarseStep.toFixed(2)} -&gt; refine $
                {diag.refinementStep.toFixed(2)}. {coarsenNote}
                {guardrailNote}
              </div>
            );
          })()}
        </div>

        <div className="text-xs text-gray-700">
          {optError && <span className="text-red-600 mr-2">Error: {optError}</span>}
          {optResult ? (
            <span>
              Best ladder ${optResult.prices.good}/${optResult.prices.better}/${optResult.prices.best} -&gt; Profit $
              {Math.round(optResult.profit)}
            </span>
          ) : (
            <span className="text-gray-500">No result yet</span>
          )}
        </div>

        {optResult && optimizerWhyLines.length > 0 && (
          <div className="mt-2 rounded border border-dashed border-gray-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-1">Why these prices?</div>
            <ul className="list-disc ml-4 space-y-1 text-[11px] text-gray-700">
              {optimizerWhyLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <details className="text-[11px] text-gray-600">
          <summary className="cursor-pointer select-none">How ranges & floors work</summary>
          <div className="mt-1 print-tight">
            Optimizer searches the grid defined by ranges and step. Gap constraints keep ladder spacing consistent. Floors can
            be checked on list or <em>pocket</em> margin. Use Apply to write prices back to the Scenario Panel.
          </div>
        </details>

        <details className="rounded border border-gray-200 p-3 bg-gray-50/60">
          <summary className="cursor-pointer select-none text-xs font-medium">Advanced constraints</summary>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="w-28">Gap G-&gt;B</span>
              <input
                type="number"
                className="border rounded px-2 h-8 flex-1"
                value={optConstraints.gapGB}
                onChange={(e) =>
                  setOptConstraints((c) => ({
                    ...c,
                    gapGB: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-28">Gap B-&gt;Best</span>
              <input
                type="number"
                className="border rounded px-2 h-8 flex-1"
                value={optConstraints.gapBB}
                onChange={(e) =>
                  setOptConstraints((c) => ({
                    ...c,
                    gapBB: Number(e.target.value),
                  }))
                }
              />
            </label>

            <div>
              <div className="text-[11px] font-semibold mb-1">Margin floors</div>
              <div className="grid grid-cols-3 gap-2">
                {(["good", "better", "best"] as const).map((t) => (
                  <label key={t} className="text-[11px]">
                    {t}
                    <input
                      type="number"
                      className="mt-1 w-full border rounded px-1 py-0.5"
                      value={optConstraints.marginFloor[t]}
                      step={0.01}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          marginFloor: {
                            ...c.marginFloor,
                            [t]: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={optConstraints.charm}
                onChange={(e) =>
                  setOptConstraints((c) => ({
                    ...c,
                    charm: e.target.checked,
                  }))
                }
              />
              <span>Charm endings (.99)</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={optConstraints.usePocketMargins}
                onChange={(e) =>
                  setOptConstraints((c) => ({
                    ...c,
                    usePocketMargins: e.target.checked,
                  }))
                }
              />
              <span>
                Use <em>pocket</em> price for margin floors
              </span>
              <InfoTip id="optimizer.pocketMargins" ariaLabel="What are pocket margins?" />
            </label>

            <label className="flex items-center gap-2">
              <span className="w-28">Optimizer engine</span>
              <select
                className="border rounded px-2 h-8 flex-1"
                value={optimizerKind}
                onChange={(e) => setOptimizerKind(e.target.value as OptimizerKind)}
              >
                <option value="grid-worker">Grid (worker)</option>
                <option value="grid-inline">Grid (inline)</option>
                <option value="future" disabled>
                  Future (coming)
                </option>
              </select>
            </label>

            <p className="text-[11px] text-gray-500 sm:col-span-2 print-tight">
              When enabled, margins are checked on pocket (after promo/payment/FX/refunds) instead of list.
            </p>

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={optConstraints.usePocketProfit}
                onChange={(e) =>
                  setOptConstraints((c) => ({
                    ...c,
                    usePocketProfit: e.target.checked,
                  }))
                }
              />
              <span>Compute profit using pocket price</span>
              <InfoTip id="optimizer.pocketProfit" ariaLabel="What is pocket profit?" />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={coverageUsePocket}
                onChange={(e) => setCoverageUsePocket(e.target.checked)}
              />
              <span>Coverage uses pocket (floors/coverage widgets)</span>
            </label>
          </div>
        </details>

        <div className="rounded border border-slate-200 bg-white px-3 py-2 shadow-sm space-y-2">
          <div className="text-[11px] uppercase text-slate-500">Run options</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
              onClick={onQuickOptimize}
              disabled={isOptRunning}
            >
              Quick grid (inline)
            </button>
            <button
              className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
              onClick={onResetOptimizer}
              disabled={isOptRunning}
            >
              Reset optimizer
            </button>
          </div>
          <div className="text-[11px] text-slate-600">
            Current ladder: ${prices.good}/${prices.better}/${prices.best}; costs ${costs.good}/${costs.better}/${costs.best}.
          </div>
        </div>

        <details className="mt-4 rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-medium">Field guide (copy placeholder)</summary>
          <div data-copy-slot="waterfall.fieldGuide" className="space-y-2 text-slate-600 mt-2">
            <div>
              <span className="font-semibold">Tier discounts</span>: Promo/volume discounts shave list down to pocket.
              Prioritize heavier discounts on tiers where you need mix or where payment fees bite less (higher-ticket tiers).
            </div>
            <div>
              <span className="font-semibold">Global leakages</span>: Payment %/fixed fees, FX, and refunds vary by channel.
              Low-ticket/high-fee businesses feel payment %; cross-border sales feel FX; high-return categories feel refunds.
            </div>
            <div>
              <span className="font-semibold">Compare all tiers</span>: Mini waterfalls help defend Good/Better/Best
              deltas-ensure pocket spreads match your positioning and guardrails.
            </div>
            <div>
              <span className="font-semibold">Channel blend</span>: Blend presets (e.g., Stripe vs. marketplace) to see a
              composite leak profile; narrate how channel mix shifts pocket and floors.
            </div>
          </div>
        </details>
      </div>
    </Section>
  );
}
