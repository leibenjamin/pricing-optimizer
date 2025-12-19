// src/components/OptimizerPanel.tsx

import type { ReactNode, Dispatch, SetStateAction } from "react";
import type { Prices } from "../lib/segments";
import type { Constraints, GridDiagnostics, SearchRanges } from "../lib/optimize";
import InfoTip from "./InfoTip";
import NumberInput from "./NumberInput";
import { Section } from "./Section";
import type { CurrentVsOptimizedVM } from "./CurrentVsOptimizedSection";

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
  coverageSnapshot: { pct1: number; demandPct?: number };
  optError: string | null;
  optResult: OptimizerResult;
  quickOptDiagnostics?: GridDiagnostics;
  isOptRunning: boolean;
  optimizerWhyLines: string[];
  optimizerKind: OptimizerKind;
  setOptimizerKind: Dispatch<SetStateAction<OptimizerKind>>;
  runOptimizer: () => void;
  onQuickOptimize: () => void;
  onResetOptimizer: () => void;
  latestRun: CurrentVsOptimizedVM | null;
  canUndoApply: boolean;
  canPinBaseline: boolean;
  onApplyLatestRun: (best: Prices) => void;
  onUndoApply: () => void;
  onPinBaselineFromRun: () => void;
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
  coverageSnapshot,
  optError,
  optResult,
  quickOptDiagnostics,
  isOptRunning,
  optimizerWhyLines,
  optimizerKind,
  setOptimizerKind,
  runOptimizer,
  onQuickOptimize,
  onResetOptimizer,
  latestRun,
  canUndoApply,
  canPinBaseline,
  onApplyLatestRun,
  onUndoApply,
  onPinBaselineFromRun,
  prices,
  costs,
  headline,
  actions,
}: OptimizerPanelProps) {
  const diag: GridDiagnostics | undefined = optResult?.diagnostics ?? quickOptDiagnostics;
  const readinessTone =
    coverageSnapshot.pct1 >= 70
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : coverageSnapshot.pct1 >= 40
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const readinessBasis = coverageUsePocket ? "pocket" : "list";

  return (
    <Section id="global-optimizer" title="Global Optimizer" actions={actions}>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-700">
            <span className="font-semibold">Fast path:</span> set ranges + guardrails, click{" "}
            <span className="font-semibold">Run</span>, then review{" "}
            <button
              type="button"
              className="text-sky-700 font-semibold hover:underline"
              onClick={() =>
                document
                  .getElementById("results-overview")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Results Overview
            </button>{" "}
            on the right.
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Baseline auto-pinned before run
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <span className="font-semibold mr-2 basis-full sm:basis-auto">Ranges ($)</span>

          {(["good", "better", "best"] as const).map((tier) => (
            <label key={tier} className="flex items-center gap-1">
              <span className="w-12 capitalize">{tier}</span>
              <NumberInput
                className="border rounded px-2 h-8 w-16"
                aria-label={`${tier} min`}
                value={optRanges[tier][0]}
                onValueChange={(v) =>
                  setOptRanges((r) => ({
                    ...r,
                    [tier]: [v, r[tier][1]] as [number, number],
                  }))
                }
              />
              <span>-</span>
              <NumberInput
                className="border rounded px-2 h-8 w-16"
                aria-label={`${tier} max`}
                value={optRanges[tier][1]}
                onValueChange={(v) =>
                  setOptRanges((r) => ({
                    ...r,
                    [tier]: [r[tier][0], v] as [number, number],
                  }))
                }
              />
            </label>
          ))}

          <label className="flex items-center gap-1">
            <span className="w-16">Step between Prices</span>
            <NumberInput
              className="border rounded px-2 h-8 w-16"
              aria-label="Step"
              value={optRanges.step}
              onValueChange={(v) =>
                setOptRanges((r) => ({
                  ...r,
                  step: Math.max(0.25, v),
                }))
              }
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded px-3 h-8 text-xs font-semibold border border-sky-600 bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={runOptimizer}
              disabled={isOptRunning}
            >
              {isOptRunning ? "Running..." : "Run"}
            </button>
            <button
              type="button"
              className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50"
              onClick={() =>
                document
                  .getElementById("results-overview")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              See results
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

        <div className={`rounded-xl border px-3 py-2 ${readinessTone}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600">
                Guardrail readiness
              </div>
              <div className="text-lg font-semibold leading-tight">
                {coverageSnapshot.pct1}%
              </div>
              <div className="text-[11px]">
                floors feasible ({readinessBasis} basis)
              </div>
              {coverageSnapshot.demandPct !== undefined && (
                <div className="text-[11px]">
                  Full guardrails: {coverageSnapshot.demandPct}%
                </div>
              )}
            </div>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() =>
                document
                  .getElementById("kpi-pocket-coverage")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Details
            </button>
          </div>
        </div>

        <LatestRunSummary
          vm={latestRun}
          canUndo={canUndoApply}
          canPinBaseline={canPinBaseline}
          onApply={(best) => onApplyLatestRun(best)}
          onUndo={onUndoApply}
          onPinBaseline={onPinBaselineFromRun}
          disabled={isOptRunning}
        />

        {optError ? (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <span className="font-semibold">Optimizer error:</span> {optError}
          </div>
        ) : null}

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

        {headline ? (
          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm text-[11px] text-slate-600">
            <summary className="cursor-pointer select-none font-semibold text-slate-700">
              How this optimizer works
            </summary>
            <div className="mt-2">{headline}</div>
          </details>
        ) : (
          <details className="text-[11px] text-gray-600">
            <summary className="cursor-pointer select-none">How ranges & floors work</summary>
            <div className="mt-1 print-tight">
              Optimizer searches the grid defined by ranges and step. Gap constraints keep ladder spacing consistent. Floors can
              be checked on list or <em>pocket</em> margin.
            </div>
          </details>
        )}

        <details className="rounded border border-gray-200 p-3 bg-gray-50/60">
          <summary className="cursor-pointer select-none text-xs font-medium">Advanced constraints</summary>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="w-28">Gap G-&gt;B</span>
              <NumberInput
                className="border rounded px-2 h-8 flex-1"
                value={optConstraints.gapGB}
                onValueChange={(v) =>
                  setOptConstraints((c) => ({
                    ...c,
                    gapGB: v,
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-28">Gap B-&gt;Best</span>
              <NumberInput
                className="border rounded px-2 h-8 flex-1"
                value={optConstraints.gapBB}
                onValueChange={(v) =>
                  setOptConstraints((c) => ({
                    ...c,
                    gapBB: v,
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
                    <NumberInput
                      className="mt-1 w-full border rounded px-1 py-0.5"
                      value={optConstraints.marginFloor[t]}
                      step={0.01}
                      onValueChange={(v) =>
                        setOptConstraints((c) => ({
                          ...c,
                          marginFloor: {
                            ...c.marginFloor,
                            [t]: v,
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
          <summary className="cursor-pointer select-none font-medium">
            Field guide: sanity-check pocket profit & guardrails
          </summary>
          <div data-copy-slot="waterfall.fieldGuide" className="text-slate-600 mt-2 space-y-2">
            <div className="font-semibold text-slate-700">Sanity-check the recommendation</div>
            <ul className="list-disc ml-4 space-y-1">
              <li>
                <span className="font-semibold">Pick the right basis</span>: pocket profit/floors enforce what you actually keep after promos, payment fees, FX, and refunds.
              </li>
              <li>
                <span className="font-semibold">Watch fixed-fee cliffs</span>: payment $ and refunds can overwhelm low-ticket tiers; if Good goes negative on pocket, raise floors or re-scope the offer.
              </li>
              <li>
                <span className="font-semibold">Protect tier separation</span>: confirm Better/Best still separate on pocket after discounts/fees; otherwise a tier can become a “discount trap”.
              </li>
              <li>
                <span className="font-semibold">Use charts as cross-checks</span>: Frontier shows sensitivity (flat vs sharp peak); Tornado/Robustness show which assumptions move profit.
              </li>
              <li>
                <span className="font-semibold">Edge optima mean “expand ranges”</span>: if the best point is at the min/max, widen ranges before trusting the exact number.
              </li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="text-sky-700 font-semibold hover:underline"
                onClick={() =>
                  document
                    .getElementById("pocket-price-waterfall")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Jump to Pocket Price Waterfall
              </button>
              <button
                type="button"
                className="text-sky-700 font-semibold hover:underline"
                onClick={() =>
                  document
                    .getElementById("profit-frontier")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Jump to Profit Frontier
              </button>
              <button
                type="button"
                className="text-sky-700 font-semibold hover:underline"
                onClick={() =>
                  document
                    .getElementById("tornado")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Jump to Tornado
              </button>
            </div>
          </div>
        </details>
      </div>
    </Section>
  );
}

function LatestRunSummary(props: {
  vm: CurrentVsOptimizedVM | null;
  canUndo: boolean;
  canPinBaseline: boolean;
  disabled: boolean;
  onApply: (best: Prices) => void;
  onUndo: () => void;
  onPinBaseline: () => void;
}) {
  const { vm, canUndo, canPinBaseline, disabled, onApply, onUndo, onPinBaseline } = props;

  if (!vm) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
        No run yet. Click <span className="font-semibold">Run</span> to generate a ladder recommendation; results populate
        on the right.
      </div>
    );
  }

  const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const fmtP = (p: number) =>
    `$${(Math.round(p * 100) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  const isSameLadder =
    Math.abs(vm.best.good - vm.curPrices.good) < 1e-9 &&
    Math.abs(vm.best.better - vm.curPrices.better) < 1e-9 &&
    Math.abs(vm.best.best - vm.curPrices.best) < 1e-9;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm" id="optimizer-latest-run">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Latest run summary</div>
          <div className="text-sm font-semibold text-slate-900">
            {isSameLadder
              ? "No better ladder found (baseline retained)"
              : `Profit ${vm.deltaProfit >= 0 ? "+" : "-"}${fmtUSD(Math.abs(vm.deltaProfit))} vs pre-run baseline`}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            Basis: {vm.basisLabel}. Ladder: {fmtP(vm.best.good)} / {fmtP(vm.best.better)} / {fmtP(vm.best.best)}.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => onApply(vm.best)}
            disabled={disabled}
          >
            Apply ladder
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onUndo}
            disabled={!canUndo || disabled}
          >
            Undo apply
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onPinBaseline}
            disabled={!canPinBaseline || disabled}
            title={canPinBaseline ? "Save this run as the pinned baseline" : "Run the optimizer to pin from run"}
          >
            Pin as baseline
          </button>
        </div>
      </div>

      {vm.driftNote ? (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {vm.driftNote}
        </div>
      ) : null}
    </div>
  );
}
