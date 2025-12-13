// src/App.tsx

import React from "react";
import { Suspense, lazy, type ReactNode, type ChangeEvent } from "react";
// replace direct imports:
const FrontierChartReal = lazy(() => import("./components/FrontierChart"));
const Tornado = lazy(() => import("./components/Tornado"));
const Waterfall = lazy(() => import("./components/Waterfall"));
import type { TakeRateScenario } from "./components/TakeRateChart";
import { Section } from "./components/Section";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultSim } from "./lib/simulate";
import { fitMNL } from "./lib/mnl";
import {
  now,
  formatPriceChange,
  formatCostChange,
  formatToggle,
} from "./lib/logger";
import {
  defaultSegments,
  normalizeWeights,
  scaleSegmentsPrice,
  type Segment,
  type Prices,
  type Features,
} from "./lib/segments";
import { choiceShares } from "./lib/choice";
import { type SearchRanges, type GridDiagnostics, type Constraints } from "./lib/optimize";
import { runOptimizeInWorker } from "./lib/optWorker";

import { computePocketPrice, type Tier, type Leakages } from "./lib/waterfall";
import { LEAK_PRESETS } from "./lib/waterfallPresets";

import { gridOptimize } from "./lib/optQuick";

import { describeSegment } from "./lib/segmentNarrative";

import { pocketCoverage } from "./lib/coverage";

import {
  collectPriceRange,
  hasMeaningfulRange,
  type PriceRangeSource,
  type TierRangeMap,
} from "./lib/priceRange";
import { buildFrontier, deriveFrontierSweep } from "./lib/frontier";

import { PRESETS, type Preset } from "./lib/presets";
import { makeScenarioRun, type ScenarioRun, type ScenarioUncertainty } from "./lib/domain";
import PresetPicker from "./components/PresetPicker";

import { explainGaps, topDriver, explainOptimizerResult } from "./lib/explain";
import InfoTip from "./components/InfoTip";

import ActionCluster from "./components/ActionCluster";
import DataImport from "./components/DataImport";
import SalesImport from "./components/SalesImport";
import Modal from "./components/Modal";
import ErrorBoundary from "./components/ErrorBoundary";
import OnboardingOverlay from "./components/OnboardingOverlay";
import { useStickyState } from "./lib/useStickyState";

import { preflight, fetchWithRetry, apiUrl, type RetryConfig } from "./lib/net";

import { CompareBoardSection } from "./components/CompareBoardSection";
import { ScorecardCallouts } from "./components/ScorecardCallouts";
import { TakeRateSection } from "./components/TakeRateSection";
import { CohortSection } from "./components/CohortSection";
import { FrontierSection } from "./components/FrontierSection";
import { OptimizerPanel } from "./components/OptimizerPanel";
import { WaterfallSection } from "./components/WaterfallSection";
import { RobustnessSection } from "./components/RobustnessSection";
import { CoverageSection } from "./components/CoverageSection";
import { CurrentVsOptimizedSection, type CurrentVsOptimizedVM } from "./components/CurrentVsOptimizedSection";
import { ShareExportSection } from "./components/ShareExportSection";
import { RecentLinksSection } from "./components/RecentLinksSection";
import { ScenarioJournalSection } from "./components/ScenarioJournalSection";
import RiskBadge from "./components/RiskBadge";
import { kpisFromSnapshot, type SnapshotKPIs } from "./lib/snapshots";
import { runRobustnessScenarios, type UncertaintyScenario } from "./lib/robustness";
import { buildTornadoRows, tornadoSignalThreshold, type TornadoValueMode } from "./lib/tornadoView";
import type { TornadoMetric, Scenario as TornadoScenario } from "./lib/sensitivity";
import { type ScorecardBand, type ScorecardDelta } from "./lib/scorecard";
import {
  buildFrontierViewModel,
  buildTornadoViewModel,
  buildScorecardViewModel,
  buildCohortViewModel,
  formatBaselineLabel,
  buildGuardrailSummary,
  formatRiskNote,
} from "./lib/viewModels";
import {
  buildScenarioSnapshot,
  isScenarioImport,
  mapNormalizedToUI,
  normalizeSegmentsForSave,
  type NormalizedSegment,
  type ScenarioImport,
} from "./lib/snapshots";
import {
  buildSharePayload,
  downloadScenarioJson,
  downloadScenarioCsv,
  downloadJournal,
  saveShortLinkFlow,
  roundTripValidate,
  runRoundTripSuite,
  buildPayloadFromScenario,
  copyPageUrl,
  copyScenarioLongUrl,
  copyShortLinkUrl,
  navigateToShortLink,
  type SharePayload,
} from "./lib/share";
import { readSlot, writeSlot, clearSlot, type SlotId } from "./lib/slots";
import { clearRecents, readRecents, rememberId } from "./lib/recents";

// ---- Helpers (stable) for preset diffing ----
const eqPrices = (a: Prices, b: Prices) =>
  Math.abs(a.good - b.good) < 1e-6 &&
  Math.abs(a.better - b.better) < 1e-6 &&
  Math.abs(a.best - b.best) < 1e-6;

const eqFeatures = (a: Features, b: Features) =>
  eqPrices(a.featA as Prices, b.featA as Prices) && eqPrices(a.featB as Prices, b.featB as Prices);

const eqSegments = (a: Segment[], b: Segment[]) => {
  if (a.length !== b.length) return false;
  return a.every((seg, idx) => {
    const other = b[idx];
    return (
      Math.abs(seg.weight - other.weight) < 1e-6 &&
      Math.abs(seg.betaPrice - other.betaPrice) < 1e-6 &&
      Math.abs(seg.betaFeatA - other.betaFeatA) < 1e-6 &&
      Math.abs(seg.betaFeatB - other.betaFeatB) < 1e-6 &&
      Math.abs(seg.betaNone - other.betaNone) < 1e-6 &&
      Math.abs((seg.alphaAnchor ?? 0) - (other.alphaAnchor ?? 0)) < 1e-6 &&
      Math.abs((seg.lambdaLoss ?? 0) - (other.lambdaLoss ?? 0)) < 1e-6
    );
  });
};

const eqLeak = (a: Leakages, b: Leakages) =>
  Math.abs(a.paymentPct - b.paymentPct) < 1e-6 &&
  Math.abs(a.paymentFixed - b.paymentFixed) < 1e-6 &&
  Math.abs(a.fxPct - b.fxPct) < 1e-6 &&
  Math.abs(a.refundsPct - b.refundsPct) < 1e-6 &&
  eqPrices(a.promo as Prices, b.promo as Prices) &&
  eqPrices(a.volume as Prices, b.volume as Prices);

const eqConstraints = (a: Constraints, b: Constraints) =>
  Math.abs((a.gapGB ?? 0) - (b.gapGB ?? 0)) < 1e-6 &&
  Math.abs((a.gapBB ?? 0) - (b.gapBB ?? 0)) < 1e-6 &&
  Math.abs((a.maxNoneShare ?? 0) - (b.maxNoneShare ?? 0)) < 1e-6 &&
  Math.abs((a.minTakeRate ?? 0) - (b.minTakeRate ?? 0)) < 1e-6 &&
  Math.abs((a.marginFloor?.good ?? 0) - (b.marginFloor?.good ?? 0)) < 1e-6 &&
  Math.abs((a.marginFloor?.better ?? 0) - (b.marginFloor?.better ?? 0)) < 1e-6 &&
  Math.abs((a.marginFloor?.best ?? 0) - (b.marginFloor?.best ?? 0)) < 1e-6 &&
  (a.charm ?? false) === (b.charm ?? false) &&
  (a.usePocketMargins ?? false) === (b.usePocketMargins ?? false) &&
  (a.usePocketProfit ?? false) === (b.usePocketProfit ?? false);

const eqRanges = (a: SearchRanges, b: SearchRanges) =>
  eqPrices(
    { good: a.good?.[0] ?? 0, better: a.better?.[0] ?? 0, best: a.best?.[0] ?? 0 },
    { good: b.good?.[0] ?? 0, better: b.better?.[0] ?? 0, best: b.best?.[0] ?? 0 }
  ) &&
  eqPrices(
    { good: a.good?.[1] ?? 0, better: a.better?.[1] ?? 0, best: a.best?.[1] ?? 0 },
    { good: b.good?.[1] ?? 0, better: b.better?.[1] ?? 0, best: b.best?.[1] ?? 0 }
  ) &&
  Math.abs((a.step ?? 0) - (b.step ?? 0)) < 1e-6;

const eqUncertainty = (a: ScenarioUncertainty | null, b: ScenarioUncertainty | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    Math.abs((a.priceScaleDelta ?? 0) - (b.priceScaleDelta ?? 0)) < 1e-6 &&
    Math.abs((a.leakDeltaPct ?? 0) - (b.leakDeltaPct ?? 0)) < 1e-6 &&
    a.source === b.source
  );
};

const eqChannelMix = (a: Array<{ preset: string; w: number }>, b: Array<{ preset: string; w: number }>) => {
  if (a.length !== b.length) return false;
  return a.every((r, idx) => r.preset === b[idx].preset && Math.abs(r.w - b[idx].w) < 1e-6);
};

const TIER_ORDER: readonly Tier[] = ["good", "better", "best"] as const;
type OptimizerKind = "grid-worker" | "grid-inline" | "future";

type PriceRangeState = {
  map: TierRangeMap;
  source: PriceRangeSource;
};
type BaselineMeta = {
  label: string;
  savedAt: number;
};
type AppliedPresetSnapshot = {
  id: string;
  prices: Prices;
  costs: Prices;
  refPrices: Prices;
  features: Features;
  segments: Segment[];
  leak: Leakages;
  optConstraints: Constraints;
  optRanges: SearchRanges;
  tornado: {
    usePocket: boolean;
    priceBump: number;
    pctBump: number;
    rangeMode: "symmetric" | "data";
    metric: TornadoMetric;
    valueMode: TornadoValueMode;
  };
  retentionPct: number;
  kpiFloorAdj: number;
  channelMix: Array<{ preset: string; w: number }>;
  uncertainty: ScenarioUncertainty | null;
};
const ROBUST_SCENARIOS: UncertaintyScenario[] = [
  { name: "Base", segmentScalePrice: 1 },
  { name: "More price sensitive", segmentScalePrice: 1.2, leakDeltaPct: 0.05 },
  { name: "Less price sensitive", segmentScalePrice: 0.8, leakDeltaPct: -0.05 },
];
const ONBOARDING_STEPS = [
  {
    id: "preset-scenarios",
    title: "Start with a preset",
    body: "Pick a preset to load prices, refs, leakages, guardrails, and sensitivity knobs so you can run immediately. We auto-pin that preset as your baseline.",
    targetId: "preset-scenarios",
    helper: "Presets are ready-to-run; switch anytime to reset the ladder and optimizer settings.",
  },
  {
    id: "global-optimizer",
    title: "Run the optimizer",
    body: "Go to Optimize and click Run. We'll auto-pin the current scenario as the baseline before running so deltas make sense.",
    targetId: "global-optimizer",
    helper: "Pocket/list basis, gaps, and floors sit here. Charm endings are optional.",
  },
  {
    id: "callouts",
    title: "Read what changed",
    body: "Scorecard and callouts summarize lift, drivers, and guardrails. Use them to narrate before/after in the right column.",
    targetId: "callouts",
    helper: "Switch Current/Optimized to see mix shifts and KPI deltas.",
  },
  {
    id: "compare",
    title: "Compare ladders & export",
    body: "Pin scenarios on the compare board, generate short links, and use Print for a PDF-ready narrative.",
    targetId: "compare-board",
    helper: "Charts and KPIs are print friendly, so exports look polished.",
  },
] as const;

const LOAD_TAB_SECTION_IDS = ["preset-scenarios", "scenario-imports"] as const;
const ADJUST_TAB_SECTION_IDS = [
  "scenario",
  "customer-segments",
  "pocket-price-waterfall",
] as const;
const ADJUST_SLIDERS_SECTION_IDS = ["scenario"] as const;
const ADJUST_SEGMENTS_SECTION_IDS = ["customer-segments"] as const;
const ADJUST_LEAKAGES_SECTION_IDS = ["pocket-price-waterfall"] as const;
  const SAVE_TAB_SECTION_IDS = [
    "scenario-baseline",
    "export-summary",
    "export-narrative",
    "compare-board",
    "share-links",
    "recent-short-links",
    "scenario-journal",
  ] as const;
const OPTIMIZE_TAB_SECTION_IDS = [
  "global-optimizer",
  "reference-prices",
  "kpi-pocket-coverage",
  "current-vs-optimized",
  "methods",
] as const;


function Explanation({
  slot,
  children,
  className = "",
}: {
  slot: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-copy-slot={slot}
      className={`rounded border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600 leading-relaxed ${className}`}
    >
      {children}
    </div>
  );
}

function mapFitToSegments(
  inSegs: Array<{ name: string; weight: number; beta: { price: number; featA: number; featB: number } }>
): Segment[] {
  const wSum = inSegs.reduce((s, z) => s + (z.weight ?? 0), 0) || 1;
  return inSegs.map((z, i) => ({
    name: z.name && z.name.trim() ? z.name : `Segment ${i + 1}`, // <-- name, not label
    weight: (z.weight ?? 0) / wSum,
    betaNone: 0,                   // outside option intercept (fixed)
    betaPrice: z.beta.price ?? 0,
    betaFeatA: z.beta.featA ?? 0,
    betaFeatB: z.beta.featB ?? 0,
    alphaAnchor: 0,
    lambdaLoss: 1,
  }));
}

const isFullSegment = (s: unknown): s is Segment =>
  !!s &&
  typeof s === "object" &&
  typeof (s as Segment).name === "string" &&
  typeof (s as Segment).betaPrice === "number" &&
  typeof (s as Segment).betaFeatA === "number" &&
  typeof (s as Segment).betaFeatB === "number" &&
  typeof (s as Segment).betaNone === "number" &&
  typeof (s as Segment).weight === "number";

function coerceSegmentsForCalc(input: unknown, fallback: Segment[]): Segment[] {
  if (Array.isArray(input) && input.every(isFullSegment)) {
    return normalizeWeights(input as Segment[]);
  }
  if (Array.isArray(input)) {
    const fallbackSeg = (idx: number): Segment | null => {
      const base = fallback[idx] ?? fallback[0] ?? null;
      return base ? { ...base } : null;
    };
    const mapped: Segment[] = [];
    (input as unknown[]).forEach((raw, idx) => {
      const base = fallbackSeg(idx);
      if (!raw || typeof raw !== "object") {
        if (base) mapped.push(base);
        return;
      }
      const anyR = raw as Record<string, unknown>;
      if (isFullSegment(anyR)) {
        mapped.push(anyR);
        return;
      }
      const beta = (anyR["beta"] as Record<string, unknown>) || {};
      const seg: Segment = {
        name:
          typeof anyR["name"] === "string" && anyR["name"].trim()
            ? (anyR["name"] as string)
            : base?.name ?? `Segment ${idx + 1}`,
        weight: typeof anyR["weight"] === "number" ? anyR["weight"] : base?.weight ?? 1,
        betaPrice: typeof beta["price"] === "number" ? (beta["price"] as number) : base?.betaPrice ?? 0,
        betaFeatA: typeof beta["featA"] === "number" ? (beta["featA"] as number) : base?.betaFeatA ?? 0,
        betaFeatB: typeof beta["featB"] === "number" ? (beta["featB"] as number) : base?.betaFeatB ?? 0,
        betaNone: typeof anyR["betaNone"] === "number" ? (anyR["betaNone"] as number) : base?.betaNone ?? 0,
        alphaAnchor:
          typeof anyR["alphaAnchor"] === "number" ? (anyR["alphaAnchor"] as number) : base?.alphaAnchor ?? 0,
        lambdaLoss:
          typeof anyR["lambdaLoss"] === "number" ? (anyR["lambdaLoss"] as number) : base?.lambdaLoss ?? 1,
        ...(typeof beta["refAnchor"] === "number" ? { betaRefAnchor: beta["refAnchor"] as number } : {}),
      };
      mapped.push(seg);
    });
    if (mapped.length) return normalizeWeights(mapped);
  }
  return fallback;
}

export default function App() {
  const [journal, setJournal] = useState<string[]>([]);
  const [showSalesImport, setShowSalesImport] = useState(false);
  const [leftColumnTab, setLeftColumnTab] = useState<
    "load" | "adjust" | "save" | "optimize"
  >("load");
  const [adjustSubTab, setAdjustSubTab] = useState<
    "sliders" | "segments" | "leakages"
  >("sliders");
  // Persist baseline run directly; deprecated scenarioBaseline is migrated on first load.
  const [baselineRun, setBaselineRun] = useStickyState<ScenarioRun | null>("po:baseline-run-v1", null);
  const [optimizedRun, setOptimizedRun] = useState<ScenarioRun | null>(null);
  const [scenarioUncertainty, setScenarioUncertainty] = useState<ScenarioUncertainty | null>(null);
  const riskNote = formatRiskNote(scenarioUncertainty);
  const baselineMeta = baselineRun?.meta ?? null;
  const [scorecardView, setScorecardView] = useState<"current" | "optimized">("current");
  const [takeRateMode, setTakeRateMode] = useState<"mix" | "delta">("mix");
  const [takeRateSegmentKey, setTakeRateSegmentKey] = useState<"all" | string>("all");
  const [showSegmentBreakdown, setShowSegmentBreakdown] = useState(false);
  const [segmentBreakdownScenarioKey, setSegmentBreakdownScenarioKey] = useState<string | undefined>(undefined);
  const uncPriceDelta = scenarioUncertainty?.priceScaleDelta ?? 0;
  const uncLeakDelta = scenarioUncertainty?.leakDeltaPct ?? 0;

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const updateUncertainty = (field: "priceScaleDelta" | "leakDeltaPct", valuePct: number) => {
    const val = clamp(valuePct, 0, 50) / 100; // stored as fraction, input is %
    setScenarioUncertainty((prev) => ({
      priceScaleDelta: field === "priceScaleDelta" ? val : prev?.priceScaleDelta ?? 0,
      leakDeltaPct: field === "leakDeltaPct" ? val : prev?.leakDeltaPct ?? 0,
      source: prev?.source ?? "user",
    }));
  };

  // --- Toasts ---
  type Toast = {
    id: number;
    kind: "error" | "success" | "info" | "warning";
    msg: string;
    ttl?: number;
  };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback(
    (kind: Toast["kind"], msg: string, ttl = 4000) => {
      const id = Date.now() + Math.random();
      setToasts((ts) => [...ts, { id, kind, msg, ttl }]);
    },
    [setToasts]
  );

  function Toasts() {
    return (
      <div
        className="fixed bottom-4 right-4 z-9999 space-y-2"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const tone =
            t.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : t.kind === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : t.kind === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-slate-300 bg-white text-slate-800";
          const iconTone =
            t.kind === "error"
              ? "bg-red-500"
              : t.kind === "success"
              ? "bg-green-500"
              : t.kind === "warning"
              ? "bg-amber-500"
              : "bg-slate-500";
          return (
            <div
              key={t.id}
              className={`w-72 max-w-[90vw] rounded-md border shadow px-3 py-2 text-sm ${tone}`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${iconTone}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1">{t.msg}</div>
                <button
                  className="opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                  onClick={() =>
                    setToasts((ts) => ts.filter((x) => x.id !== t.id))
                  }
                >
                  <span aria-hidden="true">X</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // --- Sticky Toolbelt (bottom-right): consistent PNG/CSV + print, a11y, shortcuts ---
  function StickyToolbelt() {
    // One place to define section + chart ids (keeps labels & dispatch consistent)
    const GROUPS: Array<{
      kind: "frontier" | "waterfall" | "tornado" | "takerate" | "cohort" | "coverage";
      sectionId: string;
      chartId: string;
      label: string; // short chip label
      aria: string;  // descriptive label
    }> = [
      { kind: "frontier",  sectionId: "profit-frontier",        chartId: "frontier-main",      label: "Frontier",    aria: "Export Profit Frontier" },
      { kind: "takerate",  sectionId: "take-rate",              chartId: "takerate-main",      label: "Take-Rate",   aria: "Export Take-Rate Bars" },
      { kind: "cohort",    sectionId: "cohort-rehearsal",       chartId: "cohort-curve",       label: "Cohort",      aria: "Export Cohort rehearsal" },
      { kind: "tornado",   sectionId: "tornado",                chartId: "tornado-main",       label: "Tornado",     aria: "Export Tornado Sensitivity" },
      { kind: "waterfall", sectionId: "pocket-price-waterfall", chartId: "waterfall-main",     label: "Waterfall",   aria: "Export Pocket Price Waterfall" },
      { kind: "coverage",  sectionId: "kpi-pocket-coverage",    chartId: "coverage-heatmap",   label: "Coverage",    aria: "Export pocket floor coverage" },
    ];
    const [isToolbeltOpen, setIsToolbeltOpen] = useStickyState(
      "po:export-toolbar-open",
      false
    );
    const TOOLBELT_PANEL_ID = "po-export-toolbar";

    // Dispatch helper (used by buttons and keyboard shortcuts)
    function dispatchExport(
      kind: "frontier" | "waterfall" | "tornado" | "takerate" | "cohort" | "coverage",
      id: string,
      type: "png" | "csv"
    ) {
      const ev = new CustomEvent(`export:${kind}`, { detail: { id, type } });
      window.dispatchEvent(ev);
    }

    // Keyboard shortcuts (Alt+1..4 = PNG, Shift+Alt+1..4 = CSV, Ctrl/Cmd+P = print)
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        // Respect native print with Ctrl/Cmd+P (don't intercept)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") return;

        const idx = Number(e.key) - 1; // '1' ? 0
        const inRange = idx >= 0 && idx < GROUPS.length;
        if (e.altKey && inRange) {
          e.preventDefault();
          const g = GROUPS[idx];
          const csv = e.shiftKey;
          dispatchExport(g.kind, g.chartId, csv ? "csv" : "png");
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
      if (!isToolbeltOpen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsToolbeltOpen(false);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [isToolbeltOpen, setIsToolbeltOpen]);

    return (
      <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border bg-white/95 backdrop-blur px-3 py-1 text-xs font-semibold shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          aria-expanded={isToolbeltOpen}
          aria-controls={TOOLBELT_PANEL_ID}
          onClick={() => setIsToolbeltOpen((open) => !open)}
          title={
            isToolbeltOpen ? "Hide quick export shortcuts" : "Show quick export shortcuts"
          }
        >
          <span>Exports</span>
          <span className="text-[11px] font-normal text-slate-500">
            {isToolbeltOpen ? "Hide" : "Show"}
          </span>
        </button>
        {isToolbeltOpen && (
          <div
            id={TOOLBELT_PANEL_ID}
            className="rounded-lg border bg-white/95 backdrop-blur shadow px-2 py-1"
            role="toolbar"
            aria-label="Quick export toolbar"
          >
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[90vw] p-1">
              {GROUPS.map((g, i) => (
                <div
                  key={g.chartId}
                  className="flex items-center gap-1.5 border rounded-md px-1.5 py-1 bg-white"
                  aria-label={g.aria}
                  title={`${g.label} ? Alt+${i + 1} (PNG), Shift+Alt+${i + 1} (CSV)`}
                >
                  {/* Chip label scrolls to the section */}
                  <button
                    type="button"
                    className="px-1 text-[11px] leading-tight text-slate-700 hover:underline whitespace-nowrap"
                    onClick={() => scrollToId(g.sectionId)}
                    aria-label={`Scroll to ${g.label} section`}
                  >
                    {g.label}
                  </button>

                  {/* Export PNG */}
                  <button
                    type="button"
                    className="text-[11px] border rounded px-2 py-1 hover:bg-gray-50"
                    aria-label={`${g.aria} as PNG`}
                    onClick={() => dispatchExport(g.kind, g.chartId, "png")}
                  >
                    PNG
                  </button>

                  {/* Export CSV */}
                  <button
                    type="button"
                    className="text-[11px] border rounded px-2 py-1 hover:bg-gray-50"
                    aria-label={`${g.aria} as CSV`}
                    onClick={() => dispatchExport(g.kind, g.chartId, "csv")}
                  >
                    CSV
                  </button>
                </div>
              ))}

              {/* Separator + Print */}
              <div className="ml-1 pl-1 border-l">
                <button
                  type="button"
                  className="text-[11px] border rounded px-2 py-1 hover:bg-gray-50"
                  aria-label="Print this analysis"
                  title="Print this analysis"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }



  // auto-dismiss after ttl
  useEffect(() => {
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((ts) => ts.filter((x) => x.id !== t.id));
      }, t.ttl ?? 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const NAV_SECTIONS = useMemo(
    () => [
      "scorecard",
      "callouts",
      "profit-frontier",
      "pocket-price-waterfall",
      "compare-board",
      "cohort-rehearsal",
      "tornado",
      "global-optimizer",
    ],
    []
  );

  const loadTabSet = useMemo(() => new Set<string>(LOAD_TAB_SECTION_IDS), []);
  const adjustTabSet = useMemo(
    () => new Set<string>(ADJUST_TAB_SECTION_IDS),
    []
  );
  const adjustSlidersSet = useMemo(
    () => new Set<string>(ADJUST_SLIDERS_SECTION_IDS),
    []
  );
  const adjustSegmentsSet = useMemo(
    () => new Set<string>(ADJUST_SEGMENTS_SECTION_IDS),
    []
  );
  const adjustLeakagesSet = useMemo(
    () => new Set<string>(ADJUST_LEAKAGES_SECTION_IDS),
    []
  );
  const saveTabSet = useMemo(() => new Set<string>(SAVE_TAB_SECTION_IDS), []);
  const optimizeTabSet = useMemo(
    () => new Set<string>(OPTIMIZE_TAB_SECTION_IDS),
    []
  );

  const [activeSection, setActiveSection] = useState<string>(NAV_SECTIONS[0]);
  const stickyNavRef = useRef<HTMLDivElement | null>(null);

  const getStickyOffset = useCallback(() => {
    if (typeof window === "undefined") return 80;
    const sticky = stickyNavRef.current;
    if (!sticky) return 80;
    const height = sticky.offsetHeight || sticky.getBoundingClientRect().height;
    // Add a small margin so sections aren't flush against the sticky strip.
    return Math.max(64, Math.round(height) + 12);
  }, []);

  const focusSection = useCallback((el: HTMLElement | null) => {
    if (!el || typeof window === "undefined") return;
    const previousTabIndex = el.getAttribute("tabindex");
    if (previousTabIndex === null) el.setAttribute("tabindex", "-1");
    const focus = () => {
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focus);
    } else {
      focus();
    }
    if (previousTabIndex === null) {
      const cleanup = () => {
        if (el.getAttribute("tabindex") === "-1") el.removeAttribute("tabindex");
      };
      el.addEventListener("blur", cleanup, { once: true });
      window.setTimeout(cleanup, 1500);
    }
  }, []);

  function labelFor(id: string) {
    switch (id) {
      case "scorecard":
        return "Scorecard";
      case "callouts":
        return "Callouts";
      case "profit-frontier":
        return "Profit Frontier";
      case "pocket-price-waterfall":
        return "Pocket Price Waterfall";
      case "compare-board":
        return "Compare Board";
      case "cohort-rehearsal":
        return "Cohort Rehearsal";
      case "tornado":
        return "Tornado";
      case "global-optimizer":
        return "Global Optimizer";
      default:
        return id;
    }
  }

  function scrollToId(id: string) {
    if (typeof document === "undefined") return;
    const wantsLoad = loadTabSet.has(id);
    const wantsAdjust = adjustTabSet.has(id);
    const wantsSave = saveTabSet.has(id);
    const wantsOptimize = optimizeTabSet.has(id);

    if (wantsAdjust) {
      if (adjustSlidersSet.has(id)) setAdjustSubTab("sliders");
      else if (adjustSegmentsSet.has(id)) setAdjustSubTab("segments");
      else if (adjustLeakagesSet.has(id)) setAdjustSubTab("leakages");
    }

    const shouldSwitch =
      (wantsLoad && leftColumnTab !== "load") ||
      (wantsAdjust && leftColumnTab !== "adjust") ||
      (wantsSave && leftColumnTab !== "save") ||
      (wantsOptimize && leftColumnTab !== "optimize");

    if (wantsLoad) setLeftColumnTab("load");
    if (wantsAdjust) setLeftColumnTab("adjust");
    if (wantsSave) setLeftColumnTab("save");
    if (wantsOptimize) setLeftColumnTab("optimize");

    const runScroll = () => {
      const el = document.getElementById(id);
      if (!el) return;
      const stickyHeight = getStickyOffset();
      const margin = 12;
      const scrollParent = findScrollableParent(el);
      const docElement = document.scrollingElement || document.documentElement;

      if (!scrollParent || scrollParent === document.body || scrollParent === docElement) {
        const top = el.getBoundingClientRect().top + window.scrollY - stickyHeight - margin;
        window.scrollTo({ top, behavior: "smooth" });
        window.setTimeout(() => focusSection(el), 400);
        return;
      }

      const parentRect = scrollParent.getBoundingClientRect();
      const parentTargetTop = parentRect.top + window.scrollY - stickyHeight - margin;
      if (Math.abs(window.scrollY - parentTargetTop) > 1) {
        window.scrollTo({ top: parentTargetTop, behavior: "smooth" });
      }

      const elementRect = el.getBoundingClientRect();
      const targetTop =
        elementRect.top - parentRect.top + scrollParent.scrollTop - margin;
      if (typeof scrollParent.scrollTo === "function") {
        scrollParent.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      } else {
        scrollParent.scrollTop = Math.max(0, targetTop);
      }

      window.setTimeout(() => focusSection(el), 400);
    };

    if (shouldSwitch) {
      window.setTimeout(runScroll, 30);
    } else {
      runScroll();
    }
  }

  function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
    if (typeof window === "undefined" || !el) return null;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (
        ["auto", "scroll", "overlay"].includes(style.overflowY) &&
        node.scrollHeight > node.clientHeight
      ) {
        return node;
      }
      node = node.parentElement;
    }
    const root = document.scrollingElement;
    return root && root instanceof HTMLElement
      ? root
      : document.documentElement;
  }

  // Stable, optional journal logger
  const pushJ = useCallback((msg: string) => {
    try {
      setJournal((j) => [msg, ...j].slice(0, 200))
      // No-op fallback to keep ESLint happy:
      void msg;
    } catch { /* no-op */ }
  }, []);

  const [onboardingSeen, setOnboardingSeen] = useStickyState("po:onboarding-v1", false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  useEffect(() => {
    if (!onboardingSeen) setShowOnboarding(true);
  }, [onboardingSeen]);

  const handleTourStart = useCallback(() => {
    setOnboardingStep(0);
    setShowOnboarding(true);
  }, []);

  const handleTourDismiss = useCallback(() => {
    setShowOnboarding(false);
    setOnboardingSeen(true);
  }, [setOnboardingSeen]);

  // Draft value for Best while dragging, and the drag start (for the "from" price)
  const [prices, setPrices] = useStickyState("po:prices", { good: 9, better: 15, best: 25 });

  const [refPrices, setRefPrices] = useStickyState("po:refs", { good: 10, better: 18, best: 30 });

  const priceEditStart = useRef<Record<Tier, number | null>>({
    good: null,
    better: null,
    best: null,
  });

  type PendingPriceLog =
    | { from: number; to: number; timer: number | null }
    | null;
  const pendingPriceLogs = useRef<Record<Tier, PendingPriceLog>>({
    good: null,
    better: null,
    best: null,
  });

  const clearPendingPriceLog = useCallback((tier: Tier) => {
    const pending = pendingPriceLogs.current[tier];
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    pendingPriceLogs.current[tier] = null;
  }, []);

  const flushPendingPriceLog = useCallback(
    (tier: Tier) => {
      const pending = pendingPriceLogs.current[tier];
      if (!pending) return;
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pendingPriceLogs.current[tier] = null;
      if (Math.abs(pending.to - pending.from) < 0.005) return;
      pushJ(formatPriceChange(tier, pending.from, pending.to));
    },
    [pushJ]
  );

  const queuePriceLog = useCallback(
    (tier: Tier, nextValue: number, immediate = false) => {
      const start = priceEditStart.current[tier];
      if (start === null) return;
      if (Math.abs(nextValue - start) < 0.005) {
        clearPendingPriceLog(tier);
        return;
      }
      const existing = pendingPriceLogs.current[tier];
      if (existing) {
        if (existing.timer) clearTimeout(existing.timer);
        existing.to = nextValue;
      } else {
        pendingPriceLogs.current[tier] = {
          from: start,
          to: nextValue,
          timer: null,
        };
      }
      if (immediate) {
        flushPendingPriceLog(tier);
        return;
      }
      pendingPriceLogs.current[tier]!.timer = window.setTimeout(
        () => flushPendingPriceLog(tier),
        350
      );
    },
    [clearPendingPriceLog, flushPendingPriceLog]
  );

  useEffect(() => {
    const logs = pendingPriceLogs.current;
    return () => {
      (["good", "better", "best"] as const).forEach((tier) => {
        const pending = logs[tier];
        if (pending?.timer) clearTimeout(pending.timer);
        logs[tier] = null;
      });
    };
  }, []);

  const beginPriceEdit = useCallback(
    (tier: Tier) => {
      if (priceEditStart.current[tier] === null) {
        priceEditStart.current[tier] = prices[tier];
      }
    },
    [prices]
  );

  const commitPriceEdit = useCallback(
    (tier: Tier, override?: number) => {
      const start = priceEditStart.current[tier];
      if (start === null) return;
      const target =
        Number.isFinite(override) && typeof override === "number"
          ? override
          : prices[tier];
      queuePriceLog(tier, target, true);
      priceEditStart.current[tier] = null;
    },
    [prices, queuePriceLog]
  );

  const updatePrice = useCallback(
    (tier: Tier, value: number) => {
      const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
      const rounded = Math.round(safe * 100) / 100;
      setPrices((prev) => ({ ...prev, [tier]: rounded }));
      queuePriceLog(tier, rounded);
    },
    [queuePriceLog, setPrices]
  );

  // Track which scenario preset is currently active (purely UI-affordance)
  const [scenarioPresetId, setScenarioPresetId] = useState<string | null>(null);
  const [appliedPresetSnapshot, setAppliedPresetSnapshot] = useState<AppliedPresetSnapshot | null>(null);

  const [costs, setCosts] = useStickyState("po:costs", { good: 3, better: 5, best: 8 });

  const costEditStart = useRef<Record<Tier, number | null>>({
    good: null,
    better: null,
    best: null,
  });

  const beginCostEdit = useCallback(
    (tier: Tier) => {
      if (costEditStart.current[tier] === null) {
        costEditStart.current[tier] = costs[tier];
      }
    },
    [costs]
  );

  const commitCostEdit = useCallback(
    (tier: Tier, override?: number) => {
      const start = costEditStart.current[tier];
      if (start === null) return;
      const next = Number.isFinite(override) ? Number(override) : costs[tier];
      if (Math.abs(start - next) >= 0.005) {
        pushJ(formatCostChange(tier, start, next));
      }
      costEditStart.current[tier] = null;
    },
    [costs, pushJ]
  );

  const [leak, setLeak] = useStickyState("po:leak", {
    promo: { good: 0.05, better: 0.05, best: 0.05 }, // 5% promo
    volume: { good: 0.03, better: 0.03, best: 0.03 }, // 3% volume
    paymentPct: 0.029, // 2.9% processor
    paymentFixed: 0.1, // $0.10
    fxPct: 0.01, // 1%
    refundsPct: 0.02, // 2%
  });

  const sliderMax = useMemo(() => {
    const preset = scenarioPresetId
      ? PRESETS.find((x) => x.id === scenarioPresetId)
      : null;
    const presetMax = preset
      ? Math.max(preset.prices.good, preset.prices.better, preset.prices.best)
      : 0;
    const currentMax = Math.max(prices.good, prices.better, prices.best);
    const refMax = Math.max(refPrices.good, refPrices.better, refPrices.best);
    const base = Math.max(presetMax, currentMax, refMax, 100);
    const padded = Math.ceil((base * 1.5) / 10) * 10;
    return Math.max(100, padded);
  }, [
    scenarioPresetId,
    prices.good,
    prices.better,
    prices.best,
    refPrices.good,
    refPrices.better,
    refPrices.best,
  ]);

  const sliderMin = 0;


  // (optional) a quick helper to set refs from current sliders
  const setRefsFromCurrent = () =>
    setRefPrices({
      good: prices.good,
      better: prices.better,
      best: prices.best,
    });

  const [features, setFeatures] = useState({
    featA: { good: 1, better: 1, best: 1 },
    featB: { good: 0, better: 1, best: 1 },
  });
  
  const [fitInfo, setFitInfo] = useState<{
    logLik: number;
    iters: number;
    converged: boolean;
    trainLogLik?: number;
    testLogLik?: number;
    pseudoR2?: number;
    accuracy?: number;
    dataDiagnostics?: import("./workers/estimator").FitDone["dataDiagnostics"];
  } | null>(null);

  const [channelMix, setChannelMix] = useState([
    { preset: "Stripe (cards)", w: 70 },
    { preset: "App Store (est.)", w: 30 },
  ]);
  const [channelBlendApplied, setChannelBlendApplied] = useState(false);
  const defaults = useMemo(
    () => ({
      prices: { good: 9, better: 15, best: 25 },
      costs: { good: 3, better: 5, best: 8 },
      refPrices: { good: 10, better: 18, best: 30 },
      leak: { promo: { good: 0.05, better: 0.05, best: 0.05 }, volume: { good: 0.03, better: 0.03, best: 0.03 }, paymentPct: 0.029, paymentFixed: 0.1, fxPct: 0, refundsPct: 0.02 },
      features: { featA: { good: 1, better: 1, best: 1 }, featB: { good: 0, better: 1, best: 1 } },
      optConstraints: { gapGB: 2, gapBB: 3, marginFloor: { good: 0.25, better: 0.25, best: 0.25 }, charm: false, usePocketProfit: false, usePocketMargins: false },
      optRanges: { good: [5, 30] as [number, number], better: [10, 45] as [number, number], best: [15, 60] as [number, number], step: 1 },
      channelMix: [
        { preset: "Stripe (cards)", w: 70 },
        { preset: "App Store (est.)", w: 30 },
      ],
    }),
    []
  );
  const clearDefaults = {
    prices: { good: 0, better: 0, best: 0 },
    costs: { good: 0, better: 0, best: 0 },
    refPrices: { good: 0, better: 0, best: 0 },
    leak: { promo: { good: 0, better: 0, best: 0 }, volume: { good: 0, better: 0, best: 0 }, paymentPct: 0, paymentFixed: 0, fxPct: 0, refundsPct: 0 },
    features: { featA: { good: 0, better: 0, best: 0 }, featB: { good: 0, better: 0, best: 0 } },
    optConstraints: { gapGB: 0, gapBB: 0, marginFloor: { good: 0, better: 0, best: 0 }, charm: false, usePocketProfit: false, usePocketMargins: false },
    optRanges: { good: [0, 0] as [number, number], better: [0, 0] as [number, number], best: [0, 0] as [number, number], step: 1 },
    channelMix: [],
  };

  const TORNADO_DEFAULTS = {
    usePocket: true,
    priceBump: 12,
    pctBump: 3,
    rangeMode: "symmetric" as const,
    metric: "profit" as TornadoMetric,
    valueMode: "absolute" as TornadoValueMode,
  };
  const RETENTION_DEFAULT = 92;
  const KPI_FLOOR_ADJ_DEFAULT = 0;

  const resetAllSettings = () => {
    localStorage.removeItem("po:prices");
    localStorage.removeItem("po:costs");
    localStorage.removeItem("po:refs");
    localStorage.removeItem("po:leak");
    localStorage.removeItem("po:constraints");
    setPrices(defaults.prices);
    setCosts(defaults.costs);
    setRefPrices(defaults.refPrices);
    setFeatures(defaults.features);
    setLeak(defaults.leak);
    setOptConstraints(defaults.optConstraints);
    setOptRanges(defaults.optRanges);
    setChannelMix(defaults.channelMix);
    setChannelBlendApplied(false);
  };

  const clearAllSettings = () => {
    localStorage.removeItem("po:prices");
    localStorage.removeItem("po:costs");
    localStorage.removeItem("po:refs");
    localStorage.removeItem("po:leak");
    localStorage.removeItem("po:constraints");
    setPrices(clearDefaults.prices);
    setCosts(clearDefaults.costs);
    setRefPrices(clearDefaults.refPrices);
    setFeatures(clearDefaults.features);
    setLeak(clearDefaults.leak);
    setOptConstraints(clearDefaults.optConstraints);
    setOptRanges(clearDefaults.optRanges);
    setChannelMix(clearDefaults.channelMix);
    setChannelBlendApplied(false);
  };

  // ---- recent IDs helpers ----
  const [compareUseSavedSegments, setCompareUseSavedSegments] = useState(true);
  const [compareUseSavedLeak, setCompareUseSavedLeak] = useState(true);
  const [compareUseSavedRefs, setCompareUseSavedRefs] = useState(true);

  // ADD: latent-class segments state
  const [segments, setSegments] = useState<Segment[]>(defaultSegments);
  const syntheticRangeRef = useRef<TierRangeMap | null>(null);
  const [priceRangeState, setPriceRangeState] = useState<PriceRangeState | null>(null);

  const setPriceRangeFromData = useCallback(
    (map: TierRangeMap | null, source: PriceRangeSource) => {
      if (map && hasMeaningfulRange(map)) {
        setPriceRangeState({ map, source });
        return true;
      }
      return false;
    },
    []
  );

  const fallbackToSyntheticRanges = useCallback(() => {
    const fallback = syntheticRangeRef.current;
    if (fallback && hasMeaningfulRange(fallback)) {
      setPriceRangeState({ map: fallback, source: "synthetic" });
    } else {
      setPriceRangeState(null);
    }
  }, []);


  // Estimate model once from synthetic data
  useEffect(() => {
    const rows = defaultSim();
    const syntheticRange = collectPriceRange(rows);
    if (hasMeaningfulRange(syntheticRange)) {
      syntheticRangeRef.current = syntheticRange;
      setPriceRangeState((prev) => prev ?? { map: syntheticRange, source: "synthetic" });
    }
    // Closer init + more iters + a tiny tolerance for better convergence:
    const fit = fitMNL(
      rows,
      [0.8, 1.2, 1.1, -0.07, 0.35, 0.25], // init near ground-truth
      { maxIters: 400, ridge: 2e-3, tol: 1e-7 }
    );
    setFitInfo({
      logLik: fit.logLik,
      iters: fit.iters,
      converged: fit.converged,
    });
  }, []);

  useEffect(() => {
    const sid = new URLSearchParams(location.search).get("s");
    if (!sid) return;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/get?s=${encodeURIComponent(sid)}`));
        if (!res.ok) {
          pushJ(`[${now()}] Load failed for id ${sid} (HTTP ${res.status})`);
          toast("error", `Load failed (HTTP ${res.status})`);
          return;
        }
        const { scenario } = (await res.json()) as {
          scenario: {
            prices: typeof prices;
            costs: typeof costs;
            features: typeof features;
            refPrices?: typeof refPrices;
            leak?: typeof leak;
            segments?: typeof segments;
            channelMix?: typeof channelMix;
          analysis?: {
            tornadoPocket?: boolean;
            tornadoPriceBump?: number;
            tornadoPctBump?: number;
            tornadoRangeMode?: "symmetric" | "data";
            retentionPct?: number;
            retentionMonths?: number;
            kpiFloorAdj?: number;
            priceRange?: TierRangeMap;
            priceRangeSource?: PriceRangeSource;
            optRanges?: typeof optRanges;
            optConstraints?: typeof optConstraints;
            channelMix?: typeof channelMix;
            uncertainty?: ScenarioUncertainty;
          };
        };
      };
        setPrices(scenario.prices);
        setCosts(scenario.costs);
        setFeatures(scenario.features);
        if (scenario.refPrices) setRefPrices(scenario.refPrices);
        if (scenario.leak) setLeak(scenario.leak);
        if (scenario.segments) setSegments(scenario.segments);
        const incomingMix = scenario.channelMix ?? scenario.analysis?.channelMix;
        if (incomingMix && Array.isArray(incomingMix) && incomingMix.length) {
          setChannelMix(incomingMix as typeof channelMix);
          setChannelBlendApplied(true);
        }
        const incomingUnc = (scenario as { uncertainty?: unknown }).uncertainty ?? scenario.analysis?.uncertainty;
        if (incomingUnc) {
          setScenarioUncertainty(incomingUnc as ScenarioUncertainty);
        }

        // Restore analysis knobs if present
        if (scenario.analysis) {
          if (typeof scenario.analysis.tornadoPocket === "boolean") {
            setTornadoPocket(scenario.analysis.tornadoPocket);
          }
          if (typeof scenario.analysis.tornadoPriceBump === "number") {
            setTornadoPriceBump(scenario.analysis.tornadoPriceBump);
          }
          if (typeof scenario.analysis.tornadoPctBump === "number") {
            setTornadoPctBump(scenario.analysis.tornadoPctBump);
          }
          if (
            scenario.analysis.tornadoRangeMode === "symmetric" ||
            scenario.analysis.tornadoRangeMode === "data"
          ) {
            setTornadoRangeMode(scenario.analysis.tornadoRangeMode);
          }
          if (typeof scenario.analysis.retentionPct === "number") {
            setRetentionPct(scenario.analysis.retentionPct);
          }
          if (typeof scenario.analysis.retentionMonths === "number") {
            setRetentionMonths(Math.min(24, Math.max(6, scenario.analysis.retentionMonths)));
          }
          if (typeof scenario.analysis.kpiFloorAdj === "number") {
            setKpiFloorAdj(scenario.analysis.kpiFloorAdj);
          }
          if (scenario.analysis.optRanges) setOptRanges(scenario.analysis.optRanges);
          if (scenario.analysis.optConstraints)
            setOptConstraints(scenario.analysis.optConstraints);
          if (scenario.analysis.priceRange) {
            const ok = setPriceRangeFromData(
              scenario.analysis.priceRange,
              scenario.analysis.priceRangeSource ?? "shared"
            );
            if (!ok) {
              fallbackToSyntheticRanges();
            }
          } else {
            fallbackToSyntheticRanges();
          }
        } else {
          fallbackToSyntheticRanges();
        }

        rememberId(sid);
        pushJ(`[${now()}] Loaded scenario ${sid}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushJ(`[${now()}] Load error for id ${sid}: ${(e as Error).message}`);
        toast("error", `Load error: ${msg}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimizer inputs
  const [optRanges, setOptRanges] = useState<SearchRanges>({
    good: [5, 30],
    better: [10, 45],
    best: [15, 60],
    step: 1,
  });
  const [optConstraints, setOptConstraints] = useStickyState<Constraints>("po:constraints", {
    gapGB: 2,
    gapBB: 3,
    marginFloor: { good: 0.25, better: 0.25, best: 0.25 },
    charm: false,
    usePocketMargins: false,
    usePocketProfit: false,
    maxNoneShare: 0.9,
    minTakeRate: 0.02,
  });

  // Demand scale for demo math
  const N = 1000;

  type OptRunContext = {
    pricesAtRun: Prices;
    costs: Prices;
    features: Features;
    segments: Segment[];
    refPrices: Prices;
    leak: Leakages;
    constraints: Constraints;
    ranges: SearchRanges;
    usePocketProfit: boolean;
    usePocketMargins: boolean;
    N: number;
  };

  type OptRunResult = {
    prices: Prices;
    profit: number;
    kpis: SnapshotKPIs;
    diagnostics?: GridDiagnostics;
    context: OptRunContext;
    baselineProfit: number;
    runId: number;
  };

  // Result of last run
  const [optimizerKind, setOptimizerKind] = useState<OptimizerKind>("grid-worker");
  const [optResult, setOptResult] = useState<OptRunResult | null>(null);
  const [lastOptAt, setLastOptAt] = useState<number | null>(null);

  // Clear optimizer results when basis toggles change to avoid pocket/list mismatches.
  const prevBasisRef = useRef<{ pocket: boolean | undefined; margins: boolean | undefined }>({
    pocket: optConstraints.usePocketProfit,
    margins: optConstraints.usePocketMargins,
  });
  useEffect(() => {
    const prev = prevBasisRef.current;
    if (prev.pocket !== optConstraints.usePocketProfit || prev.margins !== optConstraints.usePocketMargins) {
      prevBasisRef.current = { pocket: optConstraints.usePocketProfit, margins: optConstraints.usePocketMargins };
      if (optResult) {
        setOptResult(null);
        setOptimizedRun(null);
        setLastOptAt(null);
        setScorecardView("current");
        toast("info", "Optimizer results cleared after basis change");
      }
    }
  }, [optConstraints.usePocketProfit, optConstraints.usePocketMargins, optResult, setLastOptAt, setOptResult, setScorecardView, toast]);

  const computeScenarioProfit = useCallback(
    (
      ladder: Prices,
      usePocket: boolean,
      ctx?: { costs?: Prices; features?: Features; segments?: Segment[]; refPrices?: Prices; leak?: Leakages; N?: number }
    ) => {
      const ctxCosts = ctx?.costs ?? costs;
      const ctxFeatures = ctx?.features ?? features;
      const ctxSegments = ctx?.segments ?? segments;
      const ctxRefPrices = ctx?.refPrices ?? refPrices;
      const ctxLeak = ctx?.leak ?? leak;
      const ctxN = ctx?.N ?? N;
      const probs = choiceShares(ladder, ctxFeatures, ctxSegments, ctxRefPrices);
      const qty = {
        good: ctxN * probs.good,
        better: ctxN * probs.better,
        best: ctxN * probs.best,
      };

      if (!usePocket) {
        return (
          qty.good * (ladder.good - ctxCosts.good) +
          qty.better * (ladder.better - ctxCosts.better) +
          qty.best * (ladder.best - ctxCosts.best)
        );
      }

      const pocketGood = computePocketPrice(ladder.good, "good", ctxLeak).pocket;
      const pocketBetter = computePocketPrice(ladder.better, "better", ctxLeak).pocket;
      const pocketBest = computePocketPrice(ladder.best, "best", ctxLeak).pocket;

      return (
        qty.good * (pocketGood - ctxCosts.good) +
        qty.better * (pocketBetter - ctxCosts.better) +
        qty.best * (pocketBest - ctxCosts.best)
      );
    },
    [N, features, segments, refPrices, costs, leak]
  );

  function runOptimizer() {
    // cancel any in-flight run
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    pinBaseline("Baseline before optimizer run", undefined, {
      toastKind: "info",
      toastMessage: "Baseline saved before running optimizer",
    });
    setIsOptRunning(true);
    setOptError(null);
    const runId = ++runIdRef.current;

    const constraintsAtRun: Constraints = {
      gapGB: optConstraints.gapGB,
      gapBB: optConstraints.gapBB,
      marginFloor: { ...optConstraints.marginFloor },
      charm: optConstraints.charm,
      usePocketMargins: !!optConstraints.usePocketMargins,
      usePocketProfit: !!optConstraints.usePocketProfit,
      maxNoneShare: optConstraints.maxNoneShare,
      minTakeRate: optConstraints.minTakeRate,
    };
    const rangesAtRun: SearchRanges = {
      good: [...optRanges.good] as [number, number],
      better: [...optRanges.better] as [number, number],
      best: [...optRanges.best] as [number, number],
      step: optRanges.step,
    };
    const runContext: OptRunContext = {
      pricesAtRun: { ...prices },
      costs: { ...costs },
      features: JSON.parse(JSON.stringify(features)) as Features,
      segments: segments.map((s) => ({ ...s })),
      refPrices: { ...refPrices },
      leak: JSON.parse(JSON.stringify(leak)) as Leakages,
      constraints: constraintsAtRun,
      ranges: rangesAtRun,
      usePocketProfit: !!optConstraints.usePocketProfit,
      usePocketMargins: !!optConstraints.usePocketMargins,
      N,
    };
    const baseProfitAtRun = computeScenarioProfit(runContext.pricesAtRun, runContext.usePocketProfit, {
      costs: runContext.costs,
      features: runContext.features,
      segments: runContext.segments,
      refPrices: runContext.refPrices,
      leak: runContext.leak,
      N: runContext.N,
    });

    const { promise, cancel } = runOptimizeInWorker({
      runId,
      ranges: rangesAtRun,
      costs: runContext.costs,
      feats: runContext.features,
      segs: runContext.segments,
      refPrices: runContext.refPrices,
      N: runContext.N,
      C: constraintsAtRun,
      leak: runContext.leak,
    });
    cancelRef.current = cancel;

    promise
      .then((out) => {
        // ignore if a newer run started
        if (runIdRef.current !== runId) return;
        setLastOptAt(Date.now());
        const keepBaseline = out.profit <= baseProfitAtRun;
        const keptPrices = keepBaseline ? runContext.pricesAtRun : out.prices;
        const keptProfit = keepBaseline ? baseProfitAtRun : out.profit;
        const resultKPIs = kpisFromSnapshot(
          { prices: keptPrices, costs: runContext.costs, features: runContext.features, segments: runContext.segments, refPrices: runContext.refPrices, leak: runContext.leak },
          runContext.N,
          !!constraintsAtRun.usePocketProfit,
          constraintsAtRun.usePocketMargins ?? !!constraintsAtRun.usePocketProfit
        );
        setOptResult({
          prices: keptPrices,
          profit: keptProfit,
          kpis: resultKPIs,
          diagnostics: out.diagnostics,
          context: runContext,
          baselineProfit: baseProfitAtRun,
          runId,
        });
        setOptimizedRun(
          makeScenarioRun({
            scenarioId: scenarioPresetId ?? "custom",
            ladder: keptPrices,
            costs: runContext.costs,
            leak: runContext.leak,
            refPrices: runContext.refPrices,
            features: runContext.features,
            segments: runContext.segments,
            basis: {
              usePocketProfit: !!constraintsAtRun.usePocketProfit,
              usePocketMargins: !!constraintsAtRun.usePocketMargins,
            },
            kpis: resultKPIs,
            uncertainty: scenarioUncertainty ?? undefined,
            meta: { label: "Optimized run", savedAt: Date.now(), source: "optimized" },
          })
        );
        pushJ(
          `[${now()}] Optimizer best ladder $${out.prices.good}/$${out.prices.better}/$${out.prices.best} (profit $${Math.round(out.profit)})`
        );
        setScorecardView("optimized");
        toast("success", out.profit <= baseProfitAtRun ? "Optimizer finished (no better than baseline; kept baseline)" : "Optimizer finished");
        if (out.profit <= baseProfitAtRun) {
          toast("info", "Optimizer result was not better than baseline; baseline retained.");
        } else {
          toast("info", "Optimizer done. Deltas compare to the saved pre-run baseline.");
        }
      })
      .catch((e) => {
        if (runIdRef.current !== runId) return;
        setOptError(e instanceof Error ? e.message : String(e));
        pushJ(
          `[${now()}] Optimizer error: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
        toast(
          "error",
          `Optimizer error: ${e instanceof Error ? e.message : String(e)}`
        );
      })
      .finally(() => {
        if (runIdRef.current === runId) {
          setIsOptRunning(false);
          cancelRef.current = null;
        }
      });
  }

  function applyOptimizedPrices() {
    if (!optResult) return;
    pushJ?.(
      `[${now()}] Applied optimizer ladder $${optResult.prices.good}/$${optResult.prices.better}/$${optResult.prices.best}`
    );
    setPrices({
      good: optResult.prices.good,
      better: optResult.prices.better,
      best: optResult.prices.best,
    });
  }

  const [isOptRunning, setIsOptRunning] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const cancelRef = useRef<null | (() => void)>(null);

  const [kpiFloorAdj, setKpiFloorAdj] = useState(KPI_FLOOR_ADJ_DEFAULT); // -10..+10 (pp)
  const [coverageUsePocket, setCoverageUsePocket] = useState(true);
  const coverageSnapshot = useMemo(() => {
    const floors0 = optConstraints.marginFloor;
    const adj = (x: number) =>
      Math.max(0, Math.min(0.95, x + kpiFloorAdj / 100));
    const floors1 = {
      good: adj(floors0.good),
      better: adj(floors0.better),
      best: adj(floors0.best),
    };
    const constraints = { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB };
    const base = pocketCoverage(optRanges, costs, floors0, constraints, leak, coverageUsePocket);
    const moved = pocketCoverage(optRanges, costs, floors1, constraints, leak, coverageUsePocket);
    const pct0 = Math.round(base.coverage * 100);
    const pct1 = Math.round(moved.coverage * 100);
    return {
      pct0,
      pct1,
      delta: pct1 - pct0,
      tested: moved.tested,
      step: optRanges.step,
      floors: floors1,
    };
  }, [optConstraints.marginFloor, optConstraints.gapGB, optConstraints.gapBB, optRanges, costs, leak, kpiFloorAdj, coverageUsePocket]);

  const lastAppliedPricesRef = useRef<Prices | null>(null);

  const compareBoardData = useMemo<{
    current: SnapshotKPIs;
    slots: Record<"A" | "B" | "C", SnapshotKPIs | null>;
  }>(() => {
    const usePocket = !!optConstraints.usePocketProfit;
    const curKPIs = kpisFromSnapshot(
      { prices, costs, features, refPrices, leak, segments },
      N,
      usePocket,
      optConstraints.usePocketMargins ?? usePocket
    );

    const slotKpis = (
      obj: ReturnType<typeof readSlot>
    ): SnapshotKPIs | null => {
      if (!obj) return null;
      const slotSegments = obj.segments
        ? compareUseSavedSegments
          ? mapNormalizedToUI(normalizeSegmentsForSave(obj.segments))
          : segments
        : segments;
      const slotRef = compareUseSavedRefs && obj.refPrices ? obj.refPrices : refPrices;
      const slotLeak = compareUseSavedLeak && obj.leak ? obj.leak : leak;
      const slotFeats = obj.features ?? features;
      const slotUsePocket =
        obj.analysis?.optConstraints?.usePocketProfit ?? usePocket;
      const slotUsePocketMargins =
        obj.analysis?.optConstraints?.usePocketMargins ?? slotUsePocket;
      return kpisFromSnapshot(
        {
          prices: obj.prices,
          costs: obj.costs ?? costs,
          features: slotFeats,
          refPrices: slotRef,
          leak: slotLeak,
          segments: slotSegments,
        },
        N,
        slotUsePocket,
        slotUsePocketMargins
      );
    };

    return {
      current: curKPIs,
      slots: {
        A: slotKpis(readSlot("A")),
        B: slotKpis(readSlot("B")),
        C: slotKpis(readSlot("C")),
      },
    };
  }, [N, compareUseSavedLeak, compareUseSavedRefs, compareUseSavedSegments, costs, features, leak, optConstraints.usePocketMargins, optConstraints.usePocketProfit, prices, refPrices, segments]);

  const applyOptimizedLadder = useCallback(
    (best: Prices) => {
      lastAppliedPricesRef.current = { ...prices };
      setPrices(best);
      pushJ?.(`Applied optimized ladder: ${best.good}/${best.better}/${best.best}`);
    },
    [prices, pushJ, setPrices]
  );

  const undoAppliedLadder = useCallback(() => {
    const prev = lastAppliedPricesRef.current;
    if (!prev) return;
    setPrices(prev);
    lastAppliedPricesRef.current = null;
    pushJ?.("Undo: restored ladder to previous prices");
  }, [pushJ, setPrices]);

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  // which preset is currently selected in the dropdown (for UI only)
  const [presetSel, setPresetSel] = useState<string>("");
  const [waterTier, setWaterTier] = useState<Tier>("good");

  const probs = useMemo(
    () =>
      choiceShares(
        { good: prices.good, better: prices.better, best: prices.best },
        features,
        segments,
        refPrices
      ),
    [
      prices.good,
      prices.better,
      prices.best,
      features,
      segments,
      refPrices,
    ]
  );

  const [frontierTier, setFrontierTier] = useState<Tier>("best");
  const [frontierCompareCharm, setFrontierCompareCharm] = useState(false);

  const frontierSweep = useMemo(
    () =>
      deriveFrontierSweep({
        tier: frontierTier,
        prices,
        priceRange: priceRangeState?.map?.[frontierTier] ?? null,
        optRange: optRanges ? optRanges[frontierTier] : null,
      }),
    [frontierTier, optRanges, priceRangeState?.map, prices]
  );

  // Profit frontier: sweep selected tier; hold others fixed (latent-class mix)
  const frontier = useMemo(() => {
    const usePocketMargins = !!(optConstraints.usePocketMargins ?? optConstraints.usePocketProfit);
    const constraints = {
      ...optConstraints,
      usePocketMargins,
    };

    const base = buildFrontier({
      tier: frontierTier,
      prices,
      costs,
      features,
      segments,
      refPrices,
      leak,
      constraints,
      sweep: frontierSweep,
      N,
      charm: !!optConstraints.charm,
    });
    const alt = frontierCompareCharm
      ? buildFrontier({
          tier: frontierTier,
          prices,
          costs,
          features,
          segments,
          refPrices,
          leak,
          constraints,
          sweep: frontierSweep,
          N,
          charm: !optConstraints.charm,
        })
      : null;
    return { base, alt };
  }, [
    N,
    costs,
    features,
    frontierCompareCharm,
    frontierSweep,
    frontierTier,
    leak,
    optConstraints,
    prices,
    refPrices,
    segments,
  ]);

  // Optional frontier slice anchored on the optimizer ladder (holds other tiers at optimized values)
  const frontierOptimizedSlice = useMemo(() => {
    if (!optResult) return null;
    const ctx = optResult.context;
    const sweep = deriveFrontierSweep({
      tier: frontierTier,
      prices: optResult.prices,
      priceRange: priceRangeState?.map?.[frontierTier] ?? null,
      optRange: ctx.ranges ? ctx.ranges[frontierTier] : null,
    });
    return buildFrontier({
      tier: frontierTier,
      prices: optResult.prices,
      costs: ctx.costs,
      features: ctx.features,
      segments: ctx.segments,
      refPrices: ctx.refPrices,
      leak: ctx.leak,
      constraints: ctx.constraints,
      sweep,
      N: ctx.N,
      charm: !!ctx.constraints.charm,
    });
  }, [frontierTier, optResult, priceRangeState?.map]);


  // Expected profit (current slider scenario)
  const take = {
    none: N * probs.none,
    good: N * probs.good,
    better: N * probs.better,
    best: N * probs.best,
  };
  const revenue =
    take.good * prices.good +
    take.better * prices.better +
    take.best * prices.best;
  const profit =
    take.good * (prices.good - costs.good) +
    take.better * (prices.better - costs.better) +
    take.best * (prices.best - costs.best);
  const activeCustomers = N - take.none;
  const arpu = activeCustomers > 0 ? revenue / activeCustomers : 0;
  const profitPerCustomer = profit / N;
  const grossMarginPct = revenue > 0 ? profit / revenue : 0;

  // Light-weight KPI bundle used by Compare Board and the scorecard panel
  const currentKPIs = useMemo(
    () =>
      kpisFromSnapshot(
        { prices, costs, features, segments, refPrices, leak },
        N,
        !!optConstraints.usePocketProfit,
        optConstraints.usePocketMargins ?? optConstraints.usePocketProfit ?? false
      ),
    [prices, costs, features, segments, refPrices, leak, N, optConstraints.usePocketProfit, optConstraints.usePocketMargins]
  );
  const optimizedKPIs = useMemo(
    () => optResult?.kpis ?? null,
    [optResult?.kpis]
  );
  const baselineKpis = baselineRun?.kpis ?? null;
  const optimizedKpis = optimizedRun?.kpis ?? optimizedKPIs;

  const buildExplainDelta = useCallback(
    (target: SnapshotKPIs | null, targetPrices: Prices | null): ScorecardDelta | null => {
      if (!baselineKpis || !segments.length || !target || !targetPrices || !baselineRun?.ladder) return null;

      const deltaProfit = target.profit - baselineKpis.profit;
      const deltaRevenue = target.revenue - baselineKpis.revenue;

      const currentActive = N * (1 - target.shares.none);
      const baselineActive = N * (1 - baselineKpis.shares.none);
      const deltaActive = currentActive - baselineActive;

      const deltaARPU = target.arpuActive - baselineKpis.arpuActive;

      // --- Main driver by tier (Good / Better / Best) ---
      const tiers: Array<"good" | "better" | "best"> = ["good", "better", "best"];
      const perTier = tiers.map((tier) => {
        const shareBase = baselineKpis.shares[tier];
        const shareCur = target.shares[tier];
        const qBase = N * shareBase;
        const qCur = N * shareCur;

        // Approximate unit margin from baseline list prices
        const marginBase = baselineRun.ladder[tier] - costs[tier];

        const mixEffect = (qCur - qBase) * marginBase;
        const priceEffect = qBase * (targetPrices[tier] - baselineRun.ladder[tier]);
        const total = mixEffect + priceEffect;

        return { tier, mixEffect, priceEffect, total };
      });

      const main = perTier.reduce((best, cand) =>
        Math.abs(cand.total) > Math.abs(best.total) ? cand : best
      , perTier[0]);

      let mainDriver: string;
      if (Math.abs(deltaProfit) < 1e-2) {
        mainDriver =
          "Profit is essentially unchanged vs. your baseline scenario.";
      } else {
        const dir = deltaProfit > 0 ? "up" : "down";
        const absDelta = Math.abs(deltaProfit).toFixed(0);
        const driverKind =
          Math.abs(main.mixEffect) >= Math.abs(main.priceEffect)
            ? "mix shift across tiers"
            : "unit margin change from price moves";

        mainDriver = `Profit is ${dir} about $${absDelta} vs. baseline, mainly driven by a ${driverKind} in the ${main.tier} tier.`;
      }

      // --- Most price-sensitive segment (by |betaPrice|) ---
      const mostPriceSensitive = segments.reduce((best, seg) =>
        Math.abs(seg.betaPrice) > Math.abs(best.betaPrice) ? seg : best
      , segments[0]);

      const segmentLine = `Most price-sensitive segment right now: ${mostPriceSensitive.name} (I_beta_price = ${mostPriceSensitive.betaPrice.toFixed(
        2
      )}). Price moves that help or hurt them will have outsized impact.`;

      // --- Simple suggestion sentence ---
      let suggestion: string;
      if (Math.abs(deltaProfit) < 1e-2) {
        suggestion =
          "You're right on top of your baseline. Try a small $1-$2 nudge to the Better tier to explore profit vs. conversion trade-offs.";
      } else if (deltaProfit > 0) {
        suggestion = `You're ahead of baseline. If you're comfortable with the current active-customer level, consider testing a slightly higher price for the ${main.tier} tier to see if profit can rise further without losing too many buyers.`;
      } else {
        suggestion = `Profit is below baseline. Consider nudging the ${main.tier} tier back toward the baseline price, or improving its features, to regain mix from 'None' or lower tiers.`;
      }

      return {
        deltaProfit,
        deltaRevenue,
        deltaARPU,
        deltaActive,
        mainDriver,
        segmentLine,
        suggestion,
      };
    },
    [baselineKpis, baselineRun?.ladder, costs, N, segments]
  );

  const explainDeltaCurrent = useMemo(
    () => buildExplainDelta(currentKPIs, prices),
    [buildExplainDelta, currentKPIs, prices]
  );
  const explainDeltaOptimized = useMemo(
    () => buildExplainDelta(optimizedKpis, optResult?.prices ?? optimizedRun?.ladder ?? null),
    [buildExplainDelta, optimizedKpis, optResult?.prices, optimizedRun?.ladder]
  );

  const guardrailsForCurrent = useMemo(
    () =>
      buildGuardrailSummary({
        activePrices: prices,
        constraints: optConstraints,
        ranges: optRanges,
        hasOptimizer: Boolean(optResult?.prices),
      }),
    [optConstraints, optRanges, optResult?.prices, prices]
  );
  const guardrailsForOptimized = useMemo(
    () =>
      buildGuardrailSummary({
        activePrices: optResult?.prices ?? prices,
        constraints: optResult?.context?.constraints ?? optConstraints,
        ranges: optResult?.context?.ranges ?? optRanges,
        hasOptimizer: Boolean(optResult?.prices),
      }),
    [optConstraints, optRanges, optResult?.context?.constraints, optResult?.context?.ranges, optResult?.prices, prices]
  );

  const scorecardVM = useMemo(
    () =>
      buildScorecardViewModel({
        view: scorecardView,
        baselineRun,
        optimizedRun,
        currentKPIs,
        optimizedKPIs: optimizedKpis,
        explainCurrent: explainDeltaCurrent,
        explainOptimized: explainDeltaOptimized,
        N,
        guardrailsCurrent: guardrailsForCurrent,
        guardrailsOptimized: guardrailsForOptimized,
        activeUsePocketProfit:
          scorecardView === "optimized"
            ? Boolean(optResult?.context?.usePocketProfit ?? optConstraints.usePocketProfit)
            : Boolean(optConstraints.usePocketProfit),
      }),
    [
      baselineRun,
      currentKPIs,
      explainDeltaCurrent,
      explainDeltaOptimized,
      guardrailsForCurrent,
      guardrailsForOptimized,
      N,
      optimizedKpis,
      optimizedRun,
      scorecardView,
      optConstraints.usePocketProfit,
      optResult?.context?.usePocketProfit,
    ]
  );

  type TakeRateContext = {
    key: string;
    label: string;
    kind: "baseline" | "current" | "optimized";
    prices: Prices;
    features: Features;
    refPrices?: Prices;
    segments: Segment[];
    N: number;
    kpis?: SnapshotKPIs | null;
  };

  const takeRateSegmentOptions = useMemo(() => {
    if (!segments.length) return [];
    const normalized = normalizeWeights(segments);
    return normalized
      .map((seg, idx) => ({ seg, idx }))
      .sort((a, b) => b.seg.weight - a.seg.weight)
      .slice(0, 3)
      .map(({ seg, idx }) => {
        const name = seg.name?.trim() || `Segment ${idx + 1}`;
        return {
          key: `${name}-${idx}`,
          label: name,
          nameLower: name.toLowerCase(),
          idx,
          weight: seg.weight,
        };
      });
  }, [segments]);

  const takeRateContexts = useMemo<TakeRateContext[]>(() => {
    const list: TakeRateContext[] = [];

    if (baselineRun) {
      list.push({
        key: "baseline",
        label: baselineRun.meta?.label ?? (baselineMeta ? formatBaselineLabel(baselineMeta) : "Baseline (pinned)"),
        kind: "baseline",
        prices: baselineRun.ladder,
        features: baselineRun.features,
        refPrices: baselineRun.refPrices,
        segments: coerceSegmentsForCalc(baselineRun.segments, segments),
        N,
        kpis: baselineRun.kpis,
      });
    }

    if (currentKPIs) {
      list.push({
        key: "current",
        label: baselineKpis || baselineRun ? "Current" : "Current (no baseline pinned yet)",
        kind: "current",
        prices,
        features,
        refPrices,
        segments,
        N,
        kpis: currentKPIs,
      });
    }

    if (optimizedRun) {
      list.push({
        key: "optimized",
        label: "Optimized",
        kind: "optimized",
        prices: optimizedRun.ladder,
        features: optimizedRun.features,
        refPrices: optimizedRun.refPrices,
        segments: coerceSegmentsForCalc(optimizedRun.segments, segments),
        N: optResult?.context.N ?? N,
        kpis: optimizedRun.kpis,
      });
    } else if (optimizedKpis && optResult?.prices) {
      list.push({
        key: "optimized",
        label: "Optimized",
        kind: "optimized",
        prices: optResult.prices,
        features: optResult.context.features,
        refPrices: optResult.context.refPrices,
        segments: coerceSegmentsForCalc(optResult.context.segments, segments),
        N: optResult.context.N,
        kpis: optimizedKpis,
      });
    }

    return list;
  }, [
    N,
    baselineKpis,
    baselineMeta,
    baselineRun,
    currentKPIs,
    features,
    optimizedKpis,
    optResult?.context.features,
    optResult?.context.refPrices,
    optResult?.context.segments,
    optResult?.context.N,
    optResult?.prices,
    optimizedRun,
    prices,
    refPrices,
    segments,
  ]);

  useEffect(() => {
    if (takeRateSegmentKey !== "all" && !takeRateSegmentOptions.some((o) => o.key === takeRateSegmentKey)) {
      setTakeRateSegmentKey("all");
    }
  }, [takeRateSegmentKey, takeRateSegmentOptions]);

  useEffect(() => {
    const hasSelection =
      segmentBreakdownScenarioKey && takeRateContexts.some((c) => c.key === segmentBreakdownScenarioKey);
    if (hasSelection) return;
    const fallback =
      takeRateContexts.find((c) => c.kind === "optimized")?.key ??
      takeRateContexts.find((c) => c.kind === "current")?.key ??
      takeRateContexts[0]?.key ??
      undefined;
    setSegmentBreakdownScenarioKey(fallback);
  }, [segmentBreakdownScenarioKey, takeRateContexts]);

  const selectedSegmentLabel = useMemo(
    () =>
      takeRateSegmentKey === "all"
        ? null
        : takeRateSegmentOptions.find((o) => o.key === takeRateSegmentKey)?.label ?? null,
    [takeRateSegmentKey, takeRateSegmentOptions]
  );

  // --- Take-rate comparison data (baseline/current/optimized) ---
  const takeRateScenarios: TakeRateScenario[] = useMemo(() => {
    if (!takeRateContexts.length) return [];

    const sameShares = (a: SnapshotKPIs["shares"], b: SnapshotKPIs["shares"]) =>
      Math.abs(a.none - b.none) < 1e-6 &&
      Math.abs(a.good - b.good) < 1e-6 &&
      Math.abs(a.better - b.better) < 1e-6 &&
      Math.abs(a.best - b.best) < 1e-6;

    const findSegmentForContext = (ctxSegments: Segment[]) => {
      if (takeRateSegmentKey === "all") return null;
      const opt = takeRateSegmentOptions.find((o) => o.key === takeRateSegmentKey);
      if (!opt) return null;
      const normalized = normalizeWeights(ctxSegments);
      const byNameIdx = normalized.findIndex(
        (s) => (s.name?.trim().toLowerCase() ?? "") === opt.nameLower
      );
      const idx = byNameIdx >= 0 ? byNameIdx : opt.idx;
      const seg = normalized[idx] ?? normalized[0];
      if (!seg) return null;
      return { seg, weight: seg.weight };
    };

    const rows: TakeRateScenario[] = [];
    takeRateContexts.forEach((ctx) => {
      let shares: SnapshotKPIs["shares"];
      let active = 0;
      let population = ctx.N;
      if (takeRateSegmentKey === "all") {
        shares =
          ctx.kpis?.shares ??
          choiceShares(ctx.prices, ctx.features, ctx.segments, ctx.refPrices);
        active = Math.round(ctx.N * (1 - shares.none));
      } else {
        const segPick = findSegmentForContext(ctx.segments);
        if (!segPick) return;
        shares = choiceShares(ctx.prices, ctx.features, [segPick.seg], ctx.refPrices);
        active = Math.round(ctx.N * segPick.weight * (1 - shares.none));
        population = Math.round(ctx.N * segPick.weight);
      }
      rows.push({
        key: ctx.key,
        label: ctx.label,
        shares,
        active,
        kind: ctx.kind,
        population,
      });
    });

    // Deduplicate identical mixes to reduce clutter (e.g., Current == Baseline)
    const deduped: TakeRateScenario[] = [];
    for (const row of rows) {
      const existing = deduped.find((r) => sameShares(r.shares, row.shares));
      if (existing) {
        const kinds = new Set([existing.kind, row.kind].filter(Boolean));
        const hasBaseline = kinds.has("baseline");
        const hasCurrent = kinds.has("current");
        const hasOptimized = kinds.has("optimized");
        if (hasBaseline && hasCurrent && !hasOptimized) {
          existing.label = "Current & Baseline";
        } else if (hasBaseline && hasOptimized && !hasCurrent) {
          existing.label = "Baseline & Optimized";
        } else if (hasCurrent && hasOptimized && !hasBaseline) {
          existing.label = "Current & Optimized";
        } else {
          existing.label = `${existing.label} & ${row.label}`;
        }
        if (row.kind === "optimized") existing.kind = "optimized";
        if (row.kind === "baseline") existing.kind = "baseline";
      } else {
        deduped.push({ ...row });
      }
    }

    return deduped;
  }, [takeRateContexts, takeRateSegmentKey, takeRateSegmentOptions]);

  const takeRateBaselineKey = takeRateContexts.some((ctx) => ctx.kind === "baseline")
    ? "baseline"
    : takeRateScenarios[0]?.key;

    const takeRateSummary = useMemo(() => {
      if (!takeRateScenarios.length) return null;
      const base =
        takeRateScenarios.find((s) => s.key === takeRateBaselineKey) ??
        takeRateScenarios[0];
    const target =
      takeRateScenarios.find((s) => s.kind === "optimized") ??
      takeRateScenarios.find((s) => s.kind === "current") ??
      base;
    if (!base || !target) return null;

    const delta = {
      none: (target.shares.none - base.shares.none) * 100,
      good: (target.shares.good - base.shares.good) * 100,
      better: (target.shares.better - base.shares.better) * 100,
      best: (target.shares.best - base.shares.best) * 100,
    };
    const activeDelta = target.active - base.active;
    const fmt = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 10) / 10} pp`;
    const fmtActive =
      activeDelta === 0 ? "+/-0" : `${activeDelta > 0 ? "+" : ""}${activeDelta.toLocaleString()}`;

      const labels: Record<keyof typeof delta, string> = {
        none: "None",
        good: "Good",
        better: "Better",
        best: "Best",
      };
      const order: Array<keyof typeof delta> = ["best", "better", "good", "none"];
      const biggest = order.reduce<{ key: keyof typeof delta; mag: number }>(
        (acc, key) => {
          const mag = Math.abs(delta[key]);
          if (mag > acc.mag) return { key, mag };
          return acc;
        },
        { key: "best", mag: Math.abs(delta.best) }
      );

      const segmentPrefix = selectedSegmentLabel ? `${selectedSegmentLabel}: ` : "";
      const baselineLabel =
        base.kind === "baseline"
          ? baselineMeta
            ? formatBaselineLabel(baselineMeta)
            : base.label
          : null;

      const customerImpact =
        delta.best > 0
          ? "Best gaining; watch for premium skew."
          : delta.good < 0 && delta.none < 0
          ? "Lower tiers losing; check accessibility."
          : "Mix shifting; validate with customers.";

      return {
        headline: `${segmentPrefix}${target.label} vs ${base.label}: Best ${fmt(
          delta.best
        )}, None ${fmt(delta.none)}; Active ${fmtActive}.`,
        detail: `Biggest mover: ${labels[biggest.key]} ${fmt(delta[biggest.key])}. Better ${fmt(
          delta.better
        )}, Good ${fmt(delta.good)}.`,
        baselineLabel,
        targetLabel: target.label,
        customerImpact,
      };
    }, [baselineMeta, selectedSegmentLabel, takeRateBaselineKey, takeRateScenarios]);
  const segmentBreakdownScenarios = useMemo(() => {
    if (!showSegmentBreakdown || !segmentBreakdownScenarioKey) return [];
    const ctx = takeRateContexts.find((c) => c.key === segmentBreakdownScenarioKey);
    if (!ctx) return [];

    const ranked = normalizeWeights(ctx.segments)
      .map((seg, idx) => ({ seg, idx }))
      .sort((a, b) => b.seg.weight - a.seg.weight)
      .slice(0, 3);

    return ranked.map(({ seg, idx }) => {
      const shares = choiceShares(ctx.prices, ctx.features, [seg], ctx.refPrices);
      return {
        key: `${ctx.key}-seg-${idx}`,
        label: seg.name?.trim() || `Segment ${idx + 1}`,
        shares,
        active: Math.round(ctx.N * seg.weight * (1 - shares.none)),
        kind: `segment-${ctx.key}`,
        population: Math.round(ctx.N * seg.weight),
      };
    });
  }, [segmentBreakdownScenarioKey, showSegmentBreakdown, takeRateContexts]);

  useEffect(() => {
    if (!takeRateBaselineKey && takeRateMode === "delta") {
      setTakeRateMode("mix");
    }
  }, [takeRateBaselineKey, takeRateMode]);

  // Cohort retention (percent, per-month) and horizon.
  const [retentionPct, setRetentionPct] = useState<number>(() => {
    const saved = localStorage.getItem("cohort_retention_pct");
    const v = saved ? Number(saved) : RETENTION_DEFAULT;
    return Number.isFinite(v) ? Math.min(99.9, Math.max(70, v)) : RETENTION_DEFAULT;
  });
  useEffect(() => {
    localStorage.setItem("cohort_retention_pct", String(retentionPct));
  }, [retentionPct]);

  const [retentionMonths, setRetentionMonths] = useState<number>(() => {
    const saved = localStorage.getItem("cohort_months");
    const v = saved ? Number(saved) : 12;
    return Number.isFinite(v) ? Math.min(24, Math.max(6, v)) : 12;
  });
  useEffect(() => {
    localStorage.setItem("cohort_months", String(retentionMonths));
  }, [retentionMonths]);
  const [showCohortAdvanced, setShowCohortAdvanced] = useState(false);

  // --- Cohort rehearsal scenarios (baseline/current/optimized) ---
  const { scenarios: cohortScenarios, summaries: cohortSummaryCards } = useMemo(() => {
    const baselineLabel =
      baselineRun?.meta
        ? formatBaselineLabel({ label: baselineRun.meta.label, savedAt: baselineRun.meta.savedAt })
        : baselineMeta
        ? formatBaselineLabel(baselineMeta)
        : "Baseline";
    const baselineInfo =
      baselineKpis && baselineRun
        ? {
            label: baselineLabel,
            kpis: baselineKpis,
            prices: baselineRun.ladder,
            leak: baselineRun.leak,
            costs: baselineRun.costs,
          }
        : null;

    const optimizedInfo =
      optimizedKpis && (optimizedRun?.ladder || optResult?.prices)
        ? {
            label: "Optimized",
            kpis: optimizedKpis,
            prices: optimizedRun?.ladder ?? optResult?.prices ?? prices,
            leak: optimizedRun?.leak ?? leak,
            costs: optimizedRun?.costs ?? costs,
          }
        : null;

    const currentInfo = currentKPIs
      ? {
          label: baselineRun ? "Current" : "Current (unpinned)",
          kpis: currentKPIs,
          prices,
          leak,
          costs,
        }
      : null;

    return buildCohortViewModel({
      baseline: baselineInfo,
      current: currentInfo,
      optimized: optimizedInfo,
      retentionMonths,
      retentionPct,
    });
  }, [
    baselineKpis,
    baselineMeta,
    baselineRun,
    costs,
    currentKPIs,
    leak,
    optResult?.prices,
    optimizedKpis,
    optimizedRun,
    prices,
    retentionMonths,
    retentionPct,
  ]);

  // --- Frontier markers & summary ---
  const frontierMarkers = useMemo(() => {
    const raw: Array<{ label: string; price: number; profit: number; kind: "baseline" | "current" | "optimized" }> = [];

    // Current marker uses today's ladder and today's pocket/list basis.
    const profitCurrent = computeScenarioProfit(prices, !!optConstraints.usePocketProfit);
    raw.push({
      label: "Current",
      price: prices[frontierTier],
      profit: profitCurrent,
      kind: "current",
    });

    // Baseline marker should respect the pinned baseline KPIs/basis (no drift if knobs changed after pin).
    if (baselineRun) {
      raw.push({
        label: "Baseline",
        price: baselineRun.ladder[frontierTier],
        profit: baselineRun.kpis.profit,
        kind: "baseline",
      });
    } else if (baselineKpis) {
      raw.push({
        label: "Baseline",
        price: prices[frontierTier],
        profit: baselineKpis.profit,
        kind: "baseline",
      });
    }

    // Optimized marker should reflect the optimizer run context/profit (not recomputed on new knobs).
    if (optimizedRun) {
      raw.push({
        label: "Optimized",
        price: optimizedRun.ladder[frontierTier],
        profit: optimizedRun.kpis.profit,
        kind: "optimized",
      });
    } else if (optResult?.prices) {
      const profitOptimized =
        typeof optResult.profit === "number"
          ? optResult.profit
          : computeScenarioProfit(optResult.prices, !!optResult.context.usePocketProfit, {
              costs: optResult.context.costs,
              features: optResult.context.features,
              segments: optResult.context.segments,
              refPrices: optResult.context.refPrices,
              leak: optResult.context.leak,
              N: optResult.context.N,
            });
      raw.push({
        label: "Optimized",
        price: optResult.prices[frontierTier],
        profit: profitOptimized,
        kind: "optimized",
      });
    }

    // Merge markers that sit on the exact same coordinate to avoid label overlap.
    const order = ["baseline", "current", "optimized"] as const;
    const grouped = new Map<string, { price: number; profit: number; labels: string[]; kinds: Set<string> }>();
    raw.forEach((m) => {
      const key = `${m.price.toFixed(4)}|${m.profit.toFixed(4)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.labels.push(m.label);
        existing.kinds.add(m.kind);
      } else {
        grouped.set(key, { price: m.price, profit: m.profit, labels: [m.label], kinds: new Set([m.kind]) });
      }
    });

    const merged = Array.from(grouped.values()).map((g) => {
      const kinds = Array.from(g.kinds);
      const kind = (order.find((k) => kinds.includes(k)) ?? "current") as "baseline" | "current" | "optimized";
      const hasBaseline = kinds.includes("baseline");
      const hasCurrent = kinds.includes("current");
      const hasOptimized = kinds.includes("optimized");
      let label: string;
      if (hasBaseline && hasCurrent && !hasOptimized) {
        label = "Current & Baseline";
      } else if (hasBaseline && hasCurrent && hasOptimized) {
        label = "Optimized + Current & Baseline";
      } else if (hasBaseline && hasOptimized && !hasCurrent) {
        label = "Optimized & Baseline";
      } else if (hasCurrent && hasOptimized && !hasBaseline) {
        label = "Optimized & Current";
      } else {
        const labels = order
          .filter((k) => kinds.includes(k))
          .map((k) => (k === "baseline" ? "Baseline" : k === "current" ? "Current" : "Optimized"));
        label = labels.length ? labels.join(" / ") : g.labels.join(" / ");
      }
      return { label, price: g.price, profit: g.profit, kind };
    });

    return merged;
  }, [
    baselineKpis,
    baselineRun,
    optConstraints.usePocketProfit,
    optResult,
    optimizedRun,
    prices,
    computeScenarioProfit,
    frontierTier,
  ]);

  const frontierSummary = useMemo(() => {
    if (!frontier.base.optimum) return null;
    const optBest = frontier.base.optimum.price;
    const optProf = frontier.base.optimum.profit;
    const feasibleCount = frontier.base.feasiblePoints?.length ?? 0;
    const infeasibleCount = frontier.base.infeasiblePoints?.length ?? 0;
    const baselineMarker = frontierMarkers.find((m) => m.kind === "baseline");
    const currentMarker = frontierMarkers.find((m) => m.kind === "current");
    const optimizedMarker = frontierMarkers.find((m) => m.kind === "optimized");

    const anchor = optimizedMarker ?? currentMarker ?? baselineMarker;
    if (!anchor) return null;
    const delta = anchor.profit - optProf;
    const anchorLabel = optimizedMarker ? "Optimized" : baselineMarker ? "Baseline" : "Current";
    const sweep = frontier.base.sweep;
    const tierLabel = `${frontierTier[0].toUpperCase()}${frontierTier.slice(1)}`;
    return {
      headline: `${tierLabel} sweep peak at $${optBest.toFixed(2)} (profit $${Math.round(optProf).toLocaleString()}); ${anchorLabel} at $${anchor.price.toFixed(2)} (${delta >= 0 ? "+" : "-"}$${Math.abs(Math.round(delta)).toLocaleString()} vs peak). Range $${sweep.min.toFixed(2)}-$${sweep.max.toFixed(2)}.`,
      anchorLabel: `${anchorLabel} (${tierLabel})`,
      anchorPrice: anchor.price,
      feasibility: { feasibleCount, infeasibleCount },
    };
  }, [frontier.base.optimum, frontier.base.feasiblePoints?.length, frontier.base.infeasiblePoints?.length, frontier.base.sweep, frontierMarkers, frontierTier]);

  const frontierViewModel = useMemo(
    () =>
      buildFrontierViewModel({
        base: {
          points: frontier.base.points,
          feasiblePoints: frontier.base.feasiblePoints,
          infeasiblePoints: frontier.base.infeasiblePoints,
          optimum: frontier.base.optimum,
        },
        alt: frontier.alt
          ? { label: optConstraints.charm ? "No charm" : "Charm .99", points: frontier.alt.points }
          : frontierOptimizedSlice
          ? { label: "Optimized ladder slice", points: frontierOptimizedSlice.points }
          : undefined,
        markers: frontierMarkers,
        xLabel: `${frontierTier[0].toUpperCase()}${frontierTier.slice(1)} price`,
        run: scorecardView === "optimized" ? optimizedRun : baselineRun,
      }),
    [
      baselineRun,
      frontier.alt,
      frontier.base.feasiblePoints,
      frontier.base.infeasiblePoints,
      frontier.base.optimum,
      frontier.base.points,
      frontierOptimizedSlice,
      frontierMarkers,
      frontierTier,
      optConstraints.charm,
      optimizedRun,
      scorecardView,
    ]
  );

  // ---- Tornado sensitivity data ----
  // ---- Tornado sensitivity data ----
  const [tornadoPocket, setTornadoPocket] = useState(TORNADO_DEFAULTS.usePocket);
  const [tornadoView, setTornadoView] = useState<"current" | "optimized">("current");
  const [tornadoPriceBump, setTornadoPriceBump] = useState(TORNADO_DEFAULTS.priceBump); // percent span for symmetric mode
  const [tornadoRangeMode, setTornadoRangeMode] = useState<"symmetric" | "data">(TORNADO_DEFAULTS.rangeMode);
  const [tornadoPctBump, setTornadoPctBump] = useState(TORNADO_DEFAULTS.pctBump); // pp
  const [tornadoMetric, setTornadoMetric] = useState<TornadoMetric>(TORNADO_DEFAULTS.metric);
  const [tornadoValueMode, setTornadoValueMode] = useState<TornadoValueMode>(TORNADO_DEFAULTS.valueMode);
  const activePresetDiffs = useMemo(() => {
    if (!appliedPresetSnapshot || appliedPresetSnapshot.id !== scenarioPresetId) return [];
    const diffs: string[] = [];
    if (!eqPrices(prices, appliedPresetSnapshot.prices)) diffs.push("Prices");
    if (!eqPrices(costs, appliedPresetSnapshot.costs)) diffs.push("Costs");
    if (!eqPrices(refPrices, appliedPresetSnapshot.refPrices)) diffs.push("Refs");
    if (!eqFeatures(features, appliedPresetSnapshot.features)) diffs.push("Features");
    if (!eqSegments(segments, appliedPresetSnapshot.segments)) diffs.push("Segments");
    if (!eqLeak(leak, appliedPresetSnapshot.leak)) diffs.push("Leakages");
    if (!eqConstraints(optConstraints, appliedPresetSnapshot.optConstraints)) diffs.push("Constraints");
    if (!eqRanges(optRanges, appliedPresetSnapshot.optRanges)) diffs.push("Ranges");
    if (
      appliedPresetSnapshot.tornado.usePocket !== tornadoPocket ||
      Math.abs(appliedPresetSnapshot.tornado.priceBump - tornadoPriceBump) >= 1e-6 ||
      Math.abs(appliedPresetSnapshot.tornado.pctBump - tornadoPctBump) >= 1e-6 ||
      appliedPresetSnapshot.tornado.rangeMode !== tornadoRangeMode ||
      appliedPresetSnapshot.tornado.metric !== tornadoMetric ||
      appliedPresetSnapshot.tornado.valueMode !== tornadoValueMode
    ) {
      diffs.push("Tornado");
    }
    if (Math.abs(appliedPresetSnapshot.retentionPct - retentionPct) >= 1e-6 || Math.abs(appliedPresetSnapshot.kpiFloorAdj - kpiFloorAdj) >= 1e-6) {
      diffs.push("Retention/Floor adj");
    }
    if (!eqChannelMix(channelMix, appliedPresetSnapshot.channelMix)) diffs.push("Channel mix");
    if (!eqUncertainty(scenarioUncertainty, appliedPresetSnapshot.uncertainty)) diffs.push("Uncertainty");
    return diffs;
  }, [
    appliedPresetSnapshot,
    scenarioPresetId,
    prices,
    costs,
    refPrices,
    features,
    segments,
    leak,
    optConstraints,
    optRanges,
    tornadoPocket,
    tornadoPriceBump,
    tornadoPctBump,
    tornadoRangeMode,
    tornadoMetric,
    tornadoValueMode,
    retentionPct,
    kpiFloorAdj,
    channelMix,
    scenarioUncertainty,
  ]);

  const dataDrivenBumps = useMemo(() => {
    const ranges = priceRangeState?.map;
    if (!ranges) return null;
    const map: Partial<Record<Tier, number>> = {};
    TIER_ORDER.forEach((tier) => {
      const stats = ranges[tier];
      if (stats && stats.max > stats.min) {
        map[tier] = Math.max(0.25, (stats.max - stats.min) / 2);
      }
    });
    return Object.keys(map).length ? map : null;
  }, [priceRangeState]);

  useEffect(() => {
    if (tornadoRangeMode === "data" && !dataDrivenBumps) {
      setTornadoRangeMode("symmetric");
    }
  }, [tornadoRangeMode, dataDrivenBumps]);

  const computePriceBumps = useCallback(
    (priceSet: Prices): Prices => {
      const pct = Math.max(1, Math.min(50, tornadoPriceBump)) / 100;
      const symmetric: Prices = {
        good: Math.max(0.25, priceSet.good * pct),
        better: Math.max(0.25, priceSet.better * pct),
        best: Math.max(0.25, priceSet.best * pct),
      };
      if (tornadoRangeMode === "data" && dataDrivenBumps) {
        return {
          good: dataDrivenBumps.good && dataDrivenBumps.good > 0 ? dataDrivenBumps.good : symmetric.good,
          better: dataDrivenBumps.better && dataDrivenBumps.better > 0 ? dataDrivenBumps.better : symmetric.better,
          best: dataDrivenBumps.best && dataDrivenBumps.best > 0 ? dataDrivenBumps.best : symmetric.best,
        };
      }
      return symmetric;
    },
    [tornadoPriceBump, tornadoRangeMode, dataDrivenBumps]
  );

  const avgFromBumps = useCallback((map: Prices) => {
    const vals = TIER_ORDER.map((tier) => map[tier]).filter(
      (v) => Number.isFinite(v) && v > 0
    );
    if (!vals.length) return 1;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, []);

  const buildTornadoScenario = useCallback(
    (priceSet: Prices, ctx?: OptRunContext | null): TornadoScenario => {
      if (ctx) {
        return {
          N: ctx.N,
          prices: priceSet,
          costs: ctx.costs,
          features: ctx.features,
          segments: ctx.segments,
          refPrices: ctx.refPrices,
          leak: ctx.leak,
        };
      }
      return { N, prices: priceSet, costs, features, segments, refPrices, leak };
    },
    [N, costs, features, segments, refPrices, leak]
  );


  const dataRangeSummary = useMemo(() => {
    const map = priceRangeState?.map;
    if (!map) return null;
    const prefix =
      priceRangeState?.source === "imported"
        ? "Imported ranges"
        : priceRangeState?.source === "shared"
        ? "Scenario ranges"
        : "Synthetic ranges";
    const rows = TIER_ORDER.map((tier) => {
      const stats = map[tier];
      const label = tier.charAt(0).toUpperCase() + tier.slice(1);
      if (!stats) return `${label} --`;
      return `${label} $${stats.min.toFixed(2)}-$${stats.max.toFixed(2)}`;
    });
    return `${prefix}: ${rows.join(" | " )}`;
  }, [priceRangeState]);

  const dataRangeOptionLabel =
    priceRangeState?.source === "imported"
      ? "Data-driven (CSV)"
      : priceRangeState?.source === "shared"
      ? "Data-driven (scenario)"
      : "Data-driven (default)";

  // ---- Optimizer (quick grid) ----
  // A fast, in-component grid optimizer used for compare/tornado visuals.
  // Does NOT replace the Worker-based optimizer you already have.
  const quickOpt = useMemo(() => {
    const ranges = optRanges;
    // Coerce possibly-undefined flags to strict booleans
    const usePocketFloors = optConstraints.usePocketMargins ?? false;
    const usePocketProfit = optConstraints.usePocketProfit ?? false;

    const C = {
      gapGB: optConstraints.gapGB,
      gapBB: optConstraints.gapBB,
      marginFloor: optConstraints.marginFloor,
      usePocketMargins: usePocketFloors,
      usePocketProfit,
      charm: !!optConstraints.charm,
    };

    return gridOptimize(
      N,
      ranges,
      costs,
      features,
      segments,
      refPrices,
      leak,
      C
    );
  }, [
    N,
    optRanges,
    costs,
    features,
    segments,
    refPrices,
    leak,
    optConstraints,
  ]);

  const resetOptimizer = useCallback(() => {
    setOptResult(null);
    setOptError(null);
    setLastOptAt(null);
  }, []);

  const runQuickOptimizeInline = useCallback(() => {
    setOptError(null);
    const best = quickOpt.best;
    if (!best) {
      toast("warning", "Quick grid found no feasible ladder in the current ranges/floors");
      return;
    }
    const constraintsAtRun: Constraints = {
      gapGB: optConstraints.gapGB,
      gapBB: optConstraints.gapBB,
      marginFloor: { ...optConstraints.marginFloor },
      charm: optConstraints.charm,
      usePocketMargins: optConstraints.usePocketMargins ?? false,
      usePocketProfit: optConstraints.usePocketProfit ?? false,
      maxNoneShare: optConstraints.maxNoneShare,
      minTakeRate: optConstraints.minTakeRate,
    };
    const rangesAtRun: SearchRanges = {
      good: [...optRanges.good] as [number, number],
      better: [...optRanges.better] as [number, number],
      best: [...optRanges.best] as [number, number],
      step: optRanges.step,
    };
    const runContext: OptRunContext = {
      pricesAtRun: { ...prices },
      costs: { ...costs },
      features: JSON.parse(JSON.stringify(features)) as Features,
      segments: segments.map((s) => ({ ...s })),
      refPrices: { ...refPrices },
      leak: JSON.parse(JSON.stringify(leak)) as Leakages,
      constraints: constraintsAtRun,
      ranges: rangesAtRun,
      usePocketProfit: !!constraintsAtRun.usePocketProfit,
      usePocketMargins: !!constraintsAtRun.usePocketMargins,
      N,
    };
    const baseProfit = computeScenarioProfit(runContext.pricesAtRun, runContext.usePocketProfit, {
      costs: runContext.costs,
      features: runContext.features,
      segments: runContext.segments,
      refPrices: runContext.refPrices,
      leak: runContext.leak,
      N: runContext.N,
    });
    const resultKPIs = kpisFromSnapshot(
      {
        prices: best,
        costs: runContext.costs,
        features: runContext.features,
        segments: runContext.segments,
        refPrices: runContext.refPrices,
        leak: runContext.leak,
      },
      runContext.N,
      !!constraintsAtRun.usePocketProfit,
      constraintsAtRun.usePocketMargins ?? !!constraintsAtRun.usePocketProfit
    );
    setOptResult({
      prices: best,
      profit: quickOpt.profit ?? baseProfit,
      kpis: resultKPIs,
      diagnostics: quickOpt.diagnostics,
      context: runContext,
      baselineProfit: baseProfit,
      runId: Date.now(),
    });
    setLastOptAt(Date.now());
    toast("success", "Quick grid result ready");
  }, [
    computeScenarioProfit,
    costs,
    features,
    leak,
    N,
    optConstraints,
    optRanges,
    prices,
    refPrices,
    segments,
    quickOpt,
    toast,
  ]);

  const robustnessResults = useMemo(
    () => {
      if (!optResult) return [];
      const ctx = optResult.context;
      return runRobustnessScenarios({
        scenarios: ROBUST_SCENARIOS,
        baseRanges: ctx?.ranges ?? optRanges,
        baseConstraints: ctx?.constraints ?? optConstraints,
        baseSegments: ctx?.segments ?? segments,
        baseFeatures: ctx?.features ?? features,
        baseRefPrices: ctx?.refPrices ?? refPrices,
        baseCosts: ctx?.costs ?? costs,
        baseLeak: ctx?.leak ?? leak,
        N: ctx?.N ?? N,
        baseLadder: optResult.prices,
      });
    },
    [optResult, optRanges, optConstraints, segments, features, refPrices, costs, leak, N]
  );
  useEffect(() => {
    if (!optResult?.prices && !quickOpt.best && tornadoView === "optimized") {
      setTornadoView("current");
    }
  }, [optResult?.prices, quickOpt.best, tornadoView]);

  const optimizerProfitDelta = useMemo(() => {
    if (!optResult) return null;
    const ctx = optResult.context;
    const baseProfit =
      optResult.baselineProfit ??
      computeScenarioProfit(ctx.pricesAtRun, ctx.usePocketProfit, {
        costs: ctx.costs,
        features: ctx.features,
        segments: ctx.segments,
        refPrices: ctx.refPrices,
        leak: ctx.leak,
        N: ctx.N,
      });
    return { delta: optResult.profit - baseProfit, base: baseProfit };
  }, [optResult, computeScenarioProfit]);
  const optimizerInputDrift = useMemo(() => {
    if (!optResult) return [];
    const ctx = optResult.context;
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const notes: string[] = [];
    if (changed(ctx.pricesAtRun, prices)) notes.push("ladder");
    if (changed(ctx.costs, costs)) notes.push("costs");
    if (changed(ctx.leak, leak)) notes.push("leakages");
    if (changed(ctx.refPrices, refPrices)) notes.push("ref prices");
    if (changed(ctx.features, features)) notes.push("features");
    if (changed(ctx.segments, segments)) notes.push("segments");
    if (changed(ctx.constraints, optConstraints)) notes.push("constraints");
    return notes;
  }, [optResult, prices, costs, leak, refPrices, features, segments, optConstraints]);
  const optimizerWhyLines = useMemo(() => {
    if (!optResult) return [];
    const ctx = optResult.context;
    const basePrices = ctx.pricesAtRun;
    const lines = explainOptimizerResult({
      basePrices,
      optimizedPrices: optResult.prices,
      costs: ctx.costs,
      leak: ctx.leak,
      constraints: {
        gapGB: ctx.constraints.gapGB,
        gapBB: ctx.constraints.gapBB,
        marginFloor: ctx.constraints.marginFloor,
        usePocketMargins: ctx.constraints.usePocketMargins,
        usePocketProfit: ctx.constraints.usePocketProfit,
      },
      profitDelta: optimizerProfitDelta?.delta ?? 0,
    });
    if (optimizerInputDrift.length) {
      lines.push(
        `Optimizer inputs have changed since the last run (${optimizerInputDrift.join(
          ", "
        )}). Rerun the optimizer to refresh the recommendation.`
      );
    }
    return lines;
  }, [optimizerInputDrift, optResult, optimizerProfitDelta]);

  // ---- Tornado data (current & optimized) ----
  const tornadoRowsCurrent = useMemo(() => {
    const bumps = computePriceBumps(prices);
    const avgSpan = avgFromBumps(bumps);
    const avgPrice = (prices.good + prices.better + prices.best) / 3;
    const pctBumpAbs = Math.max(0.005, tornadoPctBump / 100);
    // Scale leak bumps relative to price span so non-price factors remain visible.
    const leakPct = Math.max(pctBumpAbs, (avgSpan / Math.max(1, avgPrice)) * 0.3);
    const leakFixed = Math.max(0.05, avgPrice * leakPct * 0.1);
    return buildTornadoRows({
      metric: tornadoMetric,
      mode: tornadoValueMode,
      scenario: buildTornadoScenario(prices),
      opts: {
        usePocket: tornadoPocket,
        priceBump: avgSpan,
        priceBumps: bumps,
        pctSmall: leakPct,
        payPct: leakPct,
        payFixed: leakFixed,
      },
    });
  }, [
    prices,
    tornadoPctBump,
    tornadoMetric,
    tornadoValueMode,
    buildTornadoScenario,
    computePriceBumps,
    avgFromBumps,
    tornadoPocket,
  ]);

  const tornadoRowsOptim = useMemo(() => {
    const bestLadder = optResult?.prices ?? quickOpt.best;
    if (!bestLadder) return [];
    const p = bestLadder;
    const bumps = computePriceBumps(p);
    const avgSpan = avgFromBumps(bumps);
    const avgPrice = (p.good + p.better + p.best) / 3;
    const pctBumpAbs = Math.max(0.005, tornadoPctBump / 100);
    const leakPct = Math.max(pctBumpAbs, (avgSpan / Math.max(1, avgPrice)) * 0.3);
    const leakFixed = Math.max(0.05, avgPrice * leakPct * 0.1);
    const ctx = optResult?.context ?? null;
    return buildTornadoRows({
      metric: tornadoMetric,
      mode: tornadoValueMode,
      scenario: buildTornadoScenario(p, ctx),
      opts: {
        usePocket: tornadoPocket,
        priceBump: avgSpan,
        priceBumps: bumps,
        pctSmall: leakPct,
        payPct: leakPct,
        payFixed: leakFixed,
      },
    });
  }, [
    optResult,
    quickOpt.best,
    tornadoPctBump,
    tornadoMetric,
    tornadoValueMode,
    buildTornadoScenario,
    tornadoPocket,
    computePriceBumps,
    avgFromBumps,
  ]);

  const hasOptimizedTornado = Boolean(optResult?.prices ?? optimizedRun?.ladder ?? quickOpt.best);
  const trimTornadoRows = useCallback(
    (rows: typeof tornadoRowsCurrent) => {
      // Keep rows with any visible signal; if everything is tiny, keep the top few anyway.
      const meaningful = rows.filter(
        (r) => Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh)) >= tornadoSignalThreshold(tornadoValueMode)
      );
      const base = meaningful.length ? meaningful : rows;
      // Show more rows so non-price drivers remain visible (tornado has 15 drivers today).
      return base.slice(0, 15);
    },
    [tornadoValueMode]
  );
  const activeTornadoRows = useMemo(
    () =>
      trimTornadoRows(
        tornadoView === "optimized" && hasOptimizedTornado
          ? tornadoRowsOptim
          : tornadoRowsCurrent
      ),
    [hasOptimizedTornado, tornadoRowsCurrent, tornadoRowsOptim, tornadoView, trimTornadoRows]
  );
  const tornadoViewLabel =
      tornadoView === "optimized" && hasOptimizedTornado ? "Optimized" : "Current";
    const tornadoHasSignal = useMemo(() => {
      const minSignal = tornadoSignalThreshold(tornadoValueMode);
      return activeTornadoRows.some((r) => Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh)) >= minSignal);
    }, [activeTornadoRows, tornadoValueMode]);
    const tornadoTopDriver = useMemo(() => {
      const top = activeTornadoRows.find(
        (r) => Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh)) >= tornadoSignalThreshold(tornadoValueMode)
      );
      if (!top) return null;
      const dir =
        Math.abs(top.deltaHigh) >= Math.abs(top.deltaLow)
          ? `${top.name} up`
          : `${top.name} down`;
      const mag =
        tornadoValueMode === "percent"
          ? `${Math.max(Math.abs(top.deltaLow), Math.abs(top.deltaHigh)).toFixed(1)}%`
          : `$${Math.round(Math.max(Math.abs(top.deltaLow), Math.abs(top.deltaHigh))).toLocaleString()}`;
      return `${dir}: ${mag}`;
    }, [activeTornadoRows, tornadoValueMode]);

  const tornadoMetricLabel = tornadoMetric === "revenue" ? "Revenue" : "Profit";
  const tornadoUnitLabel = tornadoValueMode === "percent" ? "% delta" : "$ delta";
  const tornadoChartTitle = `Tornado: ${tornadoViewLabel} ${tornadoMetricLabel.toLowerCase()} sensitivity (${tornadoUnitLabel})`;

  const currentVsOptimizedVM = useMemo<CurrentVsOptimizedVM | null>(() => {
    if (!optResult) return null;
    const ctx = optResult.context;
    const basisLabel = ctx.usePocketProfit ? "Pocket profit (after leakages)" : "List profit";
    const curPrices = ctx.pricesAtRun;
    const curProfit =
      optResult.baselineProfit ??
      computeScenarioProfit(curPrices, ctx.usePocketProfit, {
        costs: ctx.costs,
        features: ctx.features,
        segments: ctx.segments,
        refPrices: ctx.refPrices,
        leak: ctx.leak,
        N: ctx.N,
      });
    const best = optResult.prices;
    const bestProfit = optResult.profit ?? null;
    if (!best || bestProfit === null) return null;
    const deltaProfit = (optimizerProfitDelta?.delta ?? bestProfit - curProfit) || 0;
    const revenueDeltaCurrent = optimizedKpis && currentKPIs ? optimizedKpis.revenue - currentKPIs.revenue : null;
    const activeDeltaCurrent =
      optimizedKpis && currentKPIs ? Math.round(N * (1 - optimizedKpis.shares.none)) - Math.round(N * (1 - currentKPIs.shares.none)) : null;
    const arpuDeltaCurrent = optimizedKpis && currentKPIs ? optimizedKpis.arpuActive - currentKPIs.arpuActive : null;
    const binds = explainGaps(best, { gapGB: ctx.constraints.gapGB, gapBB: ctx.constraints.gapBB });
    const topDriverLine = topDriver(tornadoRowsOptim, { unit: tornadoValueMode === "percent" ? "percent" : "usd", metric: tornadoMetric });
    const deltaLabel = optimizerInputDrift.length ? "vs run baseline" : "vs current profit";
    const driftNote =
      optimizerInputDrift.length > 0
        ? `Inputs changed since the optimizer run (${optimizerInputDrift.join(", ")}). Numbers here use the saved run inputs.`
        : null;
    return {
      basisLabel,
      driftNote,
      deltaLabel,
      curPrices,
      curProfit,
      best,
      bestProfit,
      deltaProfit,
      revenueDeltaCurrent,
      activeDeltaCurrent,
      arpuDeltaCurrent,
      binds,
      topDriverLine: topDriverLine ?? null,
      guardrailFloorLine: guardrailsForOptimized.floorLine,
      tornadoMetricLabel,
      explainDelta: explainDeltaOptimized,
    };
  }, [
    N,
    computeScenarioProfit,
    currentKPIs,
    explainDeltaOptimized,
    guardrailsForOptimized.floorLine,
    optResult,
    optimizerInputDrift,
    optimizerProfitDelta?.delta,
    optimizedKpis,
    tornadoMetric,
    tornadoMetricLabel,
    tornadoRowsOptim,
    tornadoValueMode,
  ]);

  const tornadoViewModel = useMemo(
    () =>
      buildTornadoViewModel({
        title: tornadoChartTitle,
        rows: activeTornadoRows,
        valueMode: tornadoValueMode,
        metric: tornadoMetric,
        run: tornadoView === "optimized" ? optimizedRun : baselineRun,
      }),
    [activeTornadoRows, baselineRun, optimizedRun, tornadoChartTitle, tornadoMetric, tornadoValueMode, tornadoView]
  );

  const normalizeChannelMix = useCallback(
    (rows: Array<{ w: number; preset: string }>) => {
      const cleaned = rows
        .map((r) => ({
          preset: r.preset,
          w: Number.isFinite(Number(r.w)) ? Number(r.w) : 0,
        }))
        .filter((r) => r.w > 0 && LEAK_PRESETS[r.preset]);
      if (!cleaned.length) return defaults.channelMix.map((r) => ({ ...r }));
      const total = cleaned.reduce((s, r) => s + r.w, 0) || 1;
      return cleaned.map((r) => ({
        ...r,
        w: Math.round((r.w / total) * 100),
      }));
    },
    [defaults]
  );

  // Migrate legacy stored baseline snapshot to the new baselineRun store.
  useEffect(() => {
    if (baselineRun) return;
    try {
      const raw = localStorage.getItem("po:scenario-baseline-v2");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        snapshot?: ReturnType<typeof buildScenarioSnapshot>;
        kpis?: SnapshotKPIs;
        basis?: { usePocketProfit?: boolean; usePocketMargins?: boolean };
        meta?: BaselineMeta;
      };
      if (!parsed?.snapshot || !parsed?.kpis || !parsed?.meta) return;
      const snap = parsed.snapshot;
      const basis = {
        usePocketProfit: !!parsed.basis?.usePocketProfit,
        usePocketMargins: !!parsed.basis?.usePocketMargins,
      };
      const run = makeScenarioRun({
        scenarioId: scenarioPresetId ?? "custom",
        ladder: snap.prices,
        costs: snap.costs ?? costs,
        leak: snap.leak ?? leak,
        refPrices: snap.refPrices ?? refPrices,
        features: snap.features ?? features,
        segments: snap.segments ? mapNormalizedToUI(snap.segments as NormalizedSegment[]) : segments,
        basis,
        kpis: parsed.kpis,
        uncertainty: scenarioUncertainty ?? undefined,
        meta: { label: parsed.meta.label, savedAt: parsed.meta.savedAt, source: "baseline" },
      });
      setBaselineRun(run);
    } catch {
      // ignore malformed legacy data
    }
  }, [
    baselineRun,
    costs,
    features,
    leak,
    refPrices,
    scenarioPresetId,
    segments,
    scenarioUncertainty,
    setBaselineRun,
  ]);

  type SegmentImportNested = { weight: number; beta: { price: number; featA: number; featB: number; refAnchor?: number } };
  const isSegmentImportNested = (segs: unknown): segs is SegmentImportNested[] => {
    return (
      Array.isArray(segs) &&
      segs.length > 0 &&
      typeof (segs[0] as Record<string, unknown>).beta === "object"
    );
  };

  // Apply a (partial) scenario object into state
  function applyScenarioPartial(obj: {
    prices?: typeof prices;
    costs?: typeof costs;
    refPrices?: typeof refPrices;
    leak?: typeof leak;
    segments?: Segment[] | SegmentImportNested[];
    optConstraints?: Partial<Constraints>;
    optRanges?: Partial<SearchRanges>;
    priceRange?: TierRangeMap;
    priceRangeSource?: PriceRangeSource;
    channelMix?: Array<{ preset: string; w: number }>;
    uncertainty?: ScenarioUncertainty | null;
    optimizerKind?: OptimizerKind;
  }) {
    if (obj.prices) setPrices(obj.prices);
    if (obj.costs) setCosts(obj.costs);
    if (obj.refPrices) setRefPrices(obj.refPrices);
    if (obj.leak) setLeak(obj.leak);

    // Accept both your UI-shape segments and the nested CSV shape
    if (obj.segments) {
      let nextSegs: Segment[];
      if (isSegmentImportNested(obj.segments)) {
        const mapped: Segment[] = obj.segments.map((s) => ({
          name: "",
          weight: Number(s.weight) || 0,
          betaPrice: Number(s.beta.price) || 0,
          betaFeatA: Number(s.beta.featA) || 0,
          betaFeatB: Number(s.beta.featB) || 0,
          betaNone: 0,
          ...(s.beta.refAnchor !== undefined ? { betaRefAnchor: Number(s.beta.refAnchor) } : {}),
        }));
        nextSegs = normalizeWeights(mapped);
      } else {
        nextSegs = normalizeWeights(obj.segments as Segment[]);
      }
      setSegments(nextSegs);
    }
    if (obj.optConstraints) {
      const partial = obj.optConstraints;
      setOptConstraints((prev) => ({
        ...prev,
        ...partial,
        marginFloor: {
          ...prev.marginFloor,
          ...(partial.marginFloor ?? {}),
        },
      }));
    }
    if (obj.optRanges) {
      setOptRanges((prev) => ({ ...prev, ...obj.optRanges }));
    }
    if (obj.priceRange) {
      const ok = setPriceRangeFromData(obj.priceRange, obj.priceRangeSource ?? "shared");
      if (!ok) fallbackToSyntheticRanges();
    }
    if (obj.channelMix) {
      setChannelMix(obj.channelMix as typeof channelMix);
      setChannelBlendApplied(true);
    }
    if (obj.uncertainty !== undefined) {
      setScenarioUncertainty(obj.uncertainty);
    }
    if (obj.optimizerKind) {
      setOptimizerKind(obj.optimizerKind);
    }
  }

  // Initialize baseline once on first render (after helpers are defined)
  useEffect(() => {
    if (baselineRun || !currentKPIs) return;
    const meta = { label: "Pinned on load", savedAt: Date.now() };
    const basis = {
      usePocketProfit: !!optConstraints.usePocketProfit,
      usePocketMargins: !!optConstraints.usePocketMargins,
    };
    setBaselineRun(
      makeScenarioRun({
        scenarioId: scenarioPresetId ?? "custom",
        ladder: prices,
        costs,
        leak,
        refPrices,
        features,
        segments,
        basis,
        kpis: currentKPIs,
        uncertainty: scenarioUncertainty ?? undefined,
        meta: { label: meta.label, savedAt: meta.savedAt, source: "baseline" },
      })
    );
  }, [
    baselineRun,
    channelMix,
    costs,
    currentKPIs,
    features,
    kpiFloorAdj,
    leak,
    optConstraints,
    optRanges,
    optimizerKind,
    priceRangeState,
    prices,
    refPrices,
    retentionMonths,
    retentionPct,
    scenarioPresetId,
    scenarioUncertainty,
    segments,
    setBaselineRun,
    tornadoMetric,
    tornadoPocket,
    tornadoPriceBump,
    tornadoPctBump,
    tornadoRangeMode,
    tornadoValueMode,
  ]);


  async function handleImportJson(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const obj: unknown = JSON.parse(text);

      if (!isScenarioImport(obj)) {
        pushJ?.(`[${now()}] Import failed: missing core keys`);
        toast("error", "Import failed: invalid JSON (missing required fields)");
        alert("Invalid JSON: missing required fields.");
        e.target.value = "";
        return;
      }

      const sc = obj as ScenarioImport;

      if (sc.prices) setPrices(sc.prices);
      if (sc.costs) setCosts(sc.costs);
      if (sc.features) setFeatures(sc.features);
      if (sc.refPrices) setRefPrices(sc.refPrices);
      if (sc.leak) setLeak(sc.leak);
      if (sc.segments)
        setSegments(
          mapNormalizedToUI(normalizeSegmentsForSave(sc.segments))
        );
      if (sc.analysis) {
        if (typeof sc.analysis.tornadoPocket === "boolean")
          setTornadoPocket(sc.analysis.tornadoPocket);
        if (typeof sc.analysis.tornadoPriceBump === "number")
          setTornadoPriceBump(sc.analysis.tornadoPriceBump);
        if (typeof sc.analysis.tornadoPctBump === "number")
          setTornadoPctBump(sc.analysis.tornadoPctBump);
        if (
          sc.analysis.tornadoMetric === "profit" ||
          sc.analysis.tornadoMetric === "revenue"
        ) {
          setTornadoMetric(sc.analysis.tornadoMetric);
        }
        if (
          sc.analysis.tornadoValueMode === "absolute" ||
          sc.analysis.tornadoValueMode === "percent"
        ) {
          setTornadoValueMode(sc.analysis.tornadoValueMode);
        }
        if (
          sc.analysis.tornadoRangeMode === "symmetric" ||
          sc.analysis.tornadoRangeMode === "data"
        ) {
          setTornadoRangeMode(sc.analysis.tornadoRangeMode);
        }
        if (typeof sc.analysis.retentionPct === "number")
          setRetentionPct(sc.analysis.retentionPct);
        if (typeof sc.analysis.kpiFloorAdj === "number")
          setKpiFloorAdj(sc.analysis.kpiFloorAdj);
        if (sc.analysis.optRanges) setOptRanges(sc.analysis.optRanges as typeof optRanges);
        if (sc.analysis.optConstraints) {
          const partial = sc.analysis.optConstraints;
          setOptConstraints((prev) => ({
            ...prev,
            ...partial,
            marginFloor: {
              ...prev.marginFloor,
              ...(partial.marginFloor ?? {}),
            },
          }));
        }
        if (sc.analysis.priceRange) {
          const ok = setPriceRangeFromData(
            sc.analysis.priceRange,
            sc.analysis.priceRangeSource ?? "shared"
          );
          if (!ok) fallbackToSyntheticRanges();
        } else {
          fallbackToSyntheticRanges();
        }
      } else {
        fallbackToSyntheticRanges();
      }
        const incomingMix = sc.channelMix ?? sc.analysis?.channelMix;
        if (incomingMix && (incomingMix as Array<{ preset: string; w: number }>).length) {
          setChannelMix(incomingMix as typeof channelMix);
          setChannelBlendApplied(true);
        }

        if (sc.analysis) {
          if (typeof sc.analysis.retentionMonths === "number")
            setRetentionMonths(Math.min(24, Math.max(6, sc.analysis.retentionMonths)));
          if (typeof sc.analysis.optimizerKind === "string") setOptimizerKind(sc.analysis.optimizerKind);
        }
        const incomingUnc = sc.uncertainty ?? sc.analysis?.uncertainty;
        if (incomingUnc) {
          setScenarioUncertainty(incomingUnc as ScenarioUncertainty);
        }

      pushJ?.(`[${now()}] Imported scenario JSON`);
      toast("success", "Imported scenario");
    } catch (err) {
      pushJ?.(
        `[${now()}] Import failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      toast(
        "error",
        `Import failed: ${err instanceof Error ? err.message : String(err)}`
      );
      alert("Failed to import JSON.");
    }
    e.target.value = "";
  }

  async function handleTestBackend() {
    const ok = await preflight("/api/get?s=ping");
    if (ok) {
      toast("success", "Backend OK (204)");
      pushJ?.(`[${now()}] Backend OK (preflight 204)`);
    } else {
      toast("error", "Backend preflight failed");
      pushJ?.(`[${now()}] Backend preflight failed`);
    }
  }

  async function handleCopyLink() {
    await copyPageUrl(window.location, {
      onSuccess: () => toast?.("success", "URL copied to clipboard"),
      onError: () => toast?.("error", "Copy failed - select and copy the address bar"),
    });
  }

  function handleCopyLongUrl() {
    copyScenarioLongUrl(
      {
        origin: location.origin,
        pathname: location.pathname,
        prices,
        costs,
        features,
      },
      {
        onSuccess: () => toast("success", "Long URL copied"),
        onError: (msg) => toast("error", msg ?? "Copy failed"),
      }
    );
    pushJ?.(`[${now()}] Copied long URL state`);
  }

  const buildSharePayloadChecked = useCallback(
    (context: string): SharePayload => {
      const snap = buildSharePayload({
        prices,
        costs,
        features,
        refPrices,
        leak,
        segments,
        tornadoPocket,
        tornadoPriceBump,
        tornadoPctBump,
        tornadoRangeMode,
        tornadoMetric,
        tornadoValueMode,
        retentionPct,
        retentionMonths,
        kpiFloorAdj,
        priceRange: priceRangeState,
        optRanges,
        optConstraints,
        channelMix,
        optimizerKind,
        uncertainty: scenarioUncertainty,
      });
      const { ok, issues } = roundTripValidate(snap);
      if (!ok) {
        const msg = `Round-trip mismatch during ${context}: ${issues.join("; ")}`;
        pushJ?.(`[${now()}] ${msg}`);
        toast("warning", "Export payload had missing fields; see journal");
      }
      return snap;
    },
    [
      prices,
      costs,
      features,
      refPrices,
      leak,
      segments,
      tornadoPocket,
      tornadoPriceBump,
      tornadoPctBump,
      tornadoRangeMode,
      tornadoMetric,
      tornadoValueMode,
      retentionPct,
      retentionMonths,
      kpiFloorAdj,
      priceRangeState,
      optRanges,
      optConstraints,
      channelMix,
      optimizerKind,
      scenarioUncertainty,
      pushJ,
      toast,
    ]
  );

  const roundTripDevRan = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (roundTripDevRan.current) return;
    roundTripDevRan.current = true;

    const currentSnap = buildSharePayloadChecked("dev round-trip check (current)");
    const presetPayloads = PRESETS.slice(0, 3).map((p, idx) => ({
      label: p.id ?? p.name ?? `preset-${idx}`,
      payload: buildPayloadFromScenario(p, {
        prices,
        costs,
        refPrices,
        features,
        leak,
        segments,
        priceRange: p.priceRange ? { map: p.priceRange, source: p.priceRangeSource ?? "shared" } : priceRangeState,
        optRanges,
        optConstraints,
        channelMix,
        uncertainty: scenarioUncertainty,
        retentionPct,
        retentionMonths,
        kpiFloorAdj,
        tornadoDefaults: {
          usePocket: tornadoPocket,
          priceBump: tornadoPriceBump,
          pctBump: tornadoPctBump,
          rangeMode: tornadoRangeMode,
          metric: tornadoMetric,
          valueMode: tornadoValueMode,
        },
        optimizerKind,
      }),
    }));
    const suite = runRoundTripSuite([{ label: "current", payload: currentSnap }, ...presetPayloads]);
    if (!suite.ok) {
      suite.issues.forEach((issue) => {
        pushJ?.(
          `[${now()}] Round-trip preset check (${issue.label}): ${issue.issues.join("; ")}`
        );
      });
      console.warn("Round-trip preset issues", suite.issues);
    }
  }, [
    buildSharePayloadChecked,
    pushJ,
    prices,
    costs,
    features,
    refPrices,
    leak,
    segments,
    tornadoPocket,
    tornadoPriceBump,
    tornadoPctBump,
    tornadoRangeMode,
    tornadoMetric,
    tornadoValueMode,
    retentionPct,
    retentionMonths,
    kpiFloorAdj,
    priceRangeState,
    optRanges,
    optConstraints,
    channelMix,
    optimizerKind,
    scenarioUncertainty,
  ]);

  function handleExportJson() {
    const snap = buildSharePayloadChecked("export json");
    downloadScenarioJson(snap);
    pushJ?.(`[${now()}] Exported scenario JSON`);
  }

  function handleExportCsv() {
    const snap = buildSharePayloadChecked("export csv");
    downloadScenarioCsv(snap);
    pushJ?.(`[${now()}] Exported scenario CSV`);
  }

  async function saveScenarioShortLink() {
    const payload = buildSharePayloadChecked("save short link");

    await saveShortLinkFlow(payload, {
      preflight,
      fetchWithRetry: (input, init, cfg) =>
        fetchWithRetry(input, init ?? {}, cfg as RetryConfig | undefined),
      onLog: (msg) => pushJ?.(`[${now()}] ${msg}`),
      onToast: (kind, msg) => toast(kind, msg),
      toast,
      rememberId,
      pushJournal: pushJ ?? undefined,
      location: typeof window !== "undefined" ? window.location : undefined,
    });
  }

  function saveToSlot(id: SlotId) {
    const snap = buildSharePayloadChecked(`save slot ${id}`);
    writeSlot(id, snap);
    pushJ?.(`[${now()}] Saved current scenario to slot ${id}`);
    toast("success", `Saved to ${id}`);
  }

  function loadFromSlot(id: SlotId) {
    const sc = readSlot(id);
    if (!sc) {
      toast("error", `Slot ${id} is empty`);
      return;
    }
    if (sc.prices) setPrices(sc.prices);
    if (sc.costs) setCosts(sc.costs);
    if (sc.features) setFeatures(sc.features);
    if (sc.refPrices) setRefPrices(sc.refPrices);
    if (sc.leak) setLeak(sc.leak);
    if (sc.segments)
      setSegments(mapNormalizedToUI(normalizeSegmentsForSave(sc.segments)));
    const incomingMix = sc.channelMix ?? sc.analysis?.channelMix;
    if (incomingMix && (incomingMix as Array<{ preset: string; w: number }>).length) {
      setChannelMix(incomingMix as typeof channelMix);
      setChannelBlendApplied(true);
    }
    if (sc.analysis) {
      if (typeof sc.analysis.tornadoPocket === "boolean")
        setTornadoPocket(sc.analysis.tornadoPocket);
      if (typeof sc.analysis.tornadoPriceBump === "number")
        setTornadoPriceBump(sc.analysis.tornadoPriceBump);
      if (typeof sc.analysis.tornadoPctBump === "number")
        setTornadoPctBump(sc.analysis.tornadoPctBump);
      if (
        sc.analysis.tornadoMetric === "profit" ||
        sc.analysis.tornadoMetric === "revenue"
      )
        setTornadoMetric(sc.analysis.tornadoMetric);
      if (
        sc.analysis.tornadoValueMode === "absolute" ||
        sc.analysis.tornadoValueMode === "percent"
      )
        setTornadoValueMode(sc.analysis.tornadoValueMode);
      if (sc.analysis.optRanges) setOptRanges(sc.analysis.optRanges as typeof optRanges);
      if (sc.analysis.optConstraints) {
        const partial = sc.analysis.optConstraints;
        setOptConstraints((prev) => ({
          ...prev,
          ...partial,
          marginFloor: {
            ...prev.marginFloor,
            ...(partial.marginFloor ?? {}),
          },
        }));
      }
      if (
        sc.analysis.tornadoRangeMode === "symmetric" ||
        sc.analysis.tornadoRangeMode === "data"
      ) {
        setTornadoRangeMode(sc.analysis.tornadoRangeMode);
      }
      if (typeof sc.analysis.retentionPct === "number")
        setRetentionPct(sc.analysis.retentionPct);
      if (typeof sc.analysis.retentionMonths === "number")
        setRetentionMonths(Math.min(24, Math.max(6, sc.analysis.retentionMonths)));
      if (typeof sc.analysis.kpiFloorAdj === "number")
        setKpiFloorAdj(sc.analysis.kpiFloorAdj);
      if (sc.analysis.priceRange) {
        const ok = setPriceRangeFromData(
          sc.analysis.priceRange,
          sc.analysis.priceRangeSource ?? "shared"
        );
        if (!ok) fallbackToSyntheticRanges();
      } else {
        fallbackToSyntheticRanges();
      }
      if (typeof sc.analysis.optimizerKind === "string")
        setOptimizerKind(sc.analysis.optimizerKind);
    } else {
      fallbackToSyntheticRanges();
    }
    pushJ?.(`[${now()}] Loaded scenario from slot ${id}`);
    toast("success", `Loaded ${id}`);
  }


  useEffect(() => {
    const ids = NAV_SECTIONS;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most visible section
        let best: { id: string; ratio: number } | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id;
          const ratio = e.intersectionRatio;
          if (!best || ratio > best.ratio) best = { id, ratio };
        }
        if (best) setActiveSection(best.id);
      },
      {
        // Trigger when ~40% in view; adjust rootMargin to sit below the sticky
        threshold: [0.25, 0.4, 0.6],
        rootMargin: "-80px 0px -40% 0px", // top offset for the sticky nav
      }
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [NAV_SECTIONS]);

  const scorecardBand = useMemo<ScorecardBand | null>(() => {
    if (!scenarioUncertainty) return null;
    const priceDelta = scenarioUncertainty.priceScaleDelta ?? 0;
    const leakDelta = scenarioUncertainty.leakDeltaPct ?? 0;

    const baseIsOptimized = scorecardView === "optimized" && optResult;
    const ctx = baseIsOptimized && optResult
      ? {
          prices: optResult.prices,
          costs: optResult.context.costs,
          features: optResult.context.features,
          segments: optResult.context.segments,
          refPrices: optResult.context.refPrices,
          leak: optResult.context.leak,
          usePocketProfit: !!optResult.context.usePocketProfit,
          usePocketMargins: !!(optResult.context.usePocketMargins ?? optResult.context.usePocketProfit),
        }
      : {
          prices,
          costs,
          features,
          segments,
          refPrices,
          leak,
          usePocketProfit: !!optConstraints.usePocketProfit,
          usePocketMargins: !!(optConstraints.usePocketMargins ?? optConstraints.usePocketProfit),
        };

    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const adjustLeak = (base: Leakages, sign: 1 | -1) => ({
      ...base,
      paymentPct: clamp01(base.paymentPct * (1 + sign * leakDelta)),
      paymentFixed: Math.max(0, base.paymentFixed),
      fxPct: clamp01(base.fxPct * (1 + sign * leakDelta)),
      refundsPct: clamp01(base.refundsPct * (1 + sign * leakDelta)),
    });

    const scaleFor = (sign: 1 | -1) => Math.max(0, 1 + sign * priceDelta);
    const calc = (sign: 1 | -1) => {
      const segs = scaleSegmentsPrice(normalizeWeights(ctx.segments), scaleFor(sign));
      const L = adjustLeak(ctx.leak, sign);
      return kpisFromSnapshot(
        { prices: ctx.prices, costs: ctx.costs, features: ctx.features, segments: segs, refPrices: ctx.refPrices, leak: L },
        N,
        ctx.usePocketProfit,
        ctx.usePocketMargins
      );
    };

    const low = calc(1);  // more sensitive (higher |betaPrice|)
    const high = calc(-1); // less sensitive (lower |betaPrice|)
    return {
      low: { revenue: low.revenue, profit: low.profit },
      high: { revenue: high.revenue, profit: high.profit },
      priceDelta,
      leakDelta,
    };
  }, [
    N,
    leak,
    optConstraints.usePocketMargins,
    optConstraints.usePocketProfit,
    optResult,
    prices,
    costs,
    features,
    refPrices,
    segments,
    scorecardView,
    scenarioUncertainty,
  ]);

  const scorecardPriceDeltas = useMemo(
    () => {
      if (!baselineRun?.ladder) return null;
      const targetPrices = scorecardView === "optimized" && optResult ? optResult.prices : prices;
      return (["good", "better", "best"] as const).map((tier) => {
        const base = baselineRun.ladder[tier];
        const current = targetPrices[tier];
        const delta = current - base;
        return { tier, base, current, delta };
      });
    },
    [baselineRun, optResult, prices, scorecardView]
  );

  type SnapshotInput = Parameters<typeof buildScenarioSnapshot>[0];

  const pinBaseline = useCallback(
    (
      label: string,
      override?: Partial<SnapshotInput>,
      opts?: { toastMessage?: string; toastKind?: "success" | "info" | "error"; silent?: boolean }
    ) => {
      const base: SnapshotInput = {
        prices,
        costs,
        features,
        refPrices,
        leak,
        segments,
        tornadoPocket,
        tornadoPriceBump,
        tornadoPctBump,
        tornadoRangeMode,
        tornadoMetric,
        tornadoValueMode,
        retentionPct,
        retentionMonths,
        kpiFloorAdj,
        priceRange: priceRangeState,
        optRanges,
        optConstraints: {
          ...optConstraints,
          marginFloor: { ...optConstraints.marginFloor },
        },
        channelMix,
        optimizerKind,
      };

      const merged: SnapshotInput = {
        ...base,
        ...(override ?? {}),
        retentionMonths: override?.retentionMonths ?? base.retentionMonths,
        optConstraints: {
          ...base.optConstraints,
          ...(override?.optConstraints ?? {}),
          marginFloor: {
            ...base.optConstraints.marginFloor,
            ...(override?.optConstraints?.marginFloor ?? {}),
          },
        },
        optRanges: override?.optRanges ?? base.optRanges,
        priceRange: override?.priceRange ?? base.priceRange,
        channelMix: override?.channelMix ?? base.channelMix,
      };

      const kpis = kpisFromSnapshot(
        { prices: merged.prices, costs: merged.costs, features: merged.features, segments: merged.segments, refPrices: merged.refPrices, leak: merged.leak },
        N,
        !!merged.optConstraints.usePocketProfit,
        merged.optConstraints.usePocketMargins ?? !!merged.optConstraints.usePocketProfit
      );
      const meta = { label, savedAt: Date.now() };
      setBaselineRun(
        makeScenarioRun({
          scenarioId: scenarioPresetId ?? "custom",
          ladder: merged.prices,
          costs: merged.costs,
          leak: merged.leak,
          refPrices: merged.refPrices,
          features: merged.features ?? features,
          segments: merged.segments ?? segments,
          basis: {
            usePocketProfit: !!merged.optConstraints.usePocketProfit,
            usePocketMargins: !!merged.optConstraints.usePocketMargins,
          },
          kpis,
          uncertainty: scenarioUncertainty ?? undefined,
          meta: { label, savedAt: meta.savedAt, source: "baseline" },
        })
      );
      if (!opts?.silent) {
        const kind = opts?.toastKind ?? "success";
        toast(kind, opts?.toastMessage ?? "Baseline pinned");
      }
    },
    [prices, costs, features, refPrices, leak, setBaselineRun, segments, tornadoPocket, tornadoPriceBump, tornadoPctBump, tornadoRangeMode, tornadoMetric, tornadoValueMode, retentionPct, retentionMonths, kpiFloorAdj, priceRangeState, optRanges, optConstraints, channelMix, optimizerKind, toast, scenarioPresetId, scenarioUncertainty]
  );

  const pinBaselineNow = () => {
    pinBaseline("Pinned now", undefined, { toastMessage: "Baseline pinned" });
  };

  // Quick guardrail check to see if a ladder is feasible under given constraints
  const checkFeasible = useCallback(
    (ladder: Prices, constraints: Constraints, ctx?: { costs?: Prices; features?: Features; segments?: Segment[]; refPrices?: Prices; leak?: Leakages }) => {
      const ctxCosts = ctx?.costs ?? costs;
      const ctxFeatures = ctx?.features ?? features;
      const ctxSegments = ctx?.segments ?? segments;
      const ctxRefPrices = ctx?.refPrices ?? refPrices;
      const ctxLeak = ctx?.leak ?? leak;
      const probs = choiceShares(ladder, ctxFeatures, ctxSegments, ctxRefPrices);
      const maxNone = constraints.maxNoneShare ?? 0.9;
      const minTake = constraints.minTakeRate ?? 0.02;

      const usePocketMargins = !!(constraints.usePocketMargins ?? constraints.usePocketProfit);
      const effG = usePocketMargins && ctxLeak ? computePocketPrice(ladder.good, "good", ctxLeak).pocket : ladder.good;
      const effB = usePocketMargins && ctxLeak ? computePocketPrice(ladder.better, "better", ctxLeak).pocket : ladder.better;
      const effH = usePocketMargins && ctxLeak ? computePocketPrice(ladder.best, "best", ctxLeak).pocket : ladder.best;
      const mG = (effG - ctxCosts.good) / Math.max(effG, 1e-6);
      const mB = (effB - ctxCosts.better) / Math.max(effB, 1e-6);
      const mH = (effH - ctxCosts.best) / Math.max(effH, 1e-6);

      const reasons: string[] = [];
      if (mG < constraints.marginFloor.good) reasons.push("Good margin below floor");
      if (mB < constraints.marginFloor.better) reasons.push("Better margin below floor");
      if (mH < constraints.marginFloor.best) reasons.push("Best margin below floor");
      if (ladder.better < ladder.good + constraints.gapGB) reasons.push("Gap G/B below floor");
      if (ladder.best < ladder.better + constraints.gapBB) reasons.push("Gap B/Best below floor");
      if (probs.none > maxNone) reasons.push("None share above guardrail");
      if (probs.good + probs.better + probs.best < minTake) reasons.push("Take rate below guardrail");

      return { ok: reasons.length === 0, reasons };
    },
    [costs, features, segments, refPrices, leak]
  );

  // Apply a scenario preset: replaces ladder, ref prices, leak, features, segments,
  // optimizer constraints/ranges, sensitivity knobs, cohort retention, and channel blend.
  const applyScenarioPreset = useCallback(
    (p: Preset) => {
      const baseSegments = normalizeWeights(p.segments ?? defaultSegments);
      const appliedSegments = p.priceScale ? scaleSegmentsPrice(baseSegments, p.priceScale) : baseSegments;
      setPrices(p.prices);
      setCosts(p.costs);
      setRefPrices(p.refPrices);
      setFeatures(p.features ?? defaults.features);
      setSegments(appliedSegments);
      setScenarioUncertainty(p.uncertainty ?? null);

      const mix = p.channelMix && p.channelMix.length ? normalizeChannelMix(p.channelMix) : normalizeChannelMix(defaults.channelMix);
      const useBlend = Boolean(p.channelMix && p.channelMix.length);
      setChannelMix(mix);
      setChannelBlendApplied(useBlend);
      setLeak(p.leak);

      let mergedConstraints = {
        ...defaults.optConstraints,
        ...(p.optConstraints ?? {}),
        marginFloor: {
          ...defaults.optConstraints.marginFloor,
          ...(p.optConstraints?.marginFloor ?? {}),
        },
      };

      // If preset ladder is infeasible, relax guardrails so baseline is feasible.
      const feas = checkFeasible(p.prices, mergedConstraints, {
        costs: p.costs,
        features: p.features ?? defaults.features,
        segments: appliedSegments,
        refPrices: p.refPrices,
        leak: p.leak,
      });
      if (!feas.ok) {
        mergedConstraints = {
          ...mergedConstraints,
          gapGB: Math.max(0, mergedConstraints.gapGB - 1),
          gapBB: Math.max(0, mergedConstraints.gapBB - 2),
          marginFloor: {
            good: Math.min(mergedConstraints.marginFloor.good, 0.3),
            better: Math.min(mergedConstraints.marginFloor.better, 0.35),
            best: Math.min(mergedConstraints.marginFloor.best, 0.4),
          },
          maxNoneShare: Math.max(mergedConstraints.maxNoneShare ?? 0, 0.9),
          minTakeRate: Math.min(mergedConstraints.minTakeRate ?? 1, 0.02),
        };
        toast("info", "Relaxed guardrails so the preset baseline is feasible.");
      }

      setOptConstraints(mergedConstraints);
      setCoverageUsePocket(mergedConstraints.usePocketMargins ?? true);
      setOptRanges(p.optRanges ?? defaults.optRanges);

      setTornadoPocket(p.tornado?.usePocket ?? TORNADO_DEFAULTS.usePocket);
      setTornadoPriceBump(p.tornado?.priceBump ?? TORNADO_DEFAULTS.priceBump);
      setTornadoPctBump(p.tornado?.pctBump ?? TORNADO_DEFAULTS.pctBump);
      setTornadoMetric(p.tornado?.metric ?? TORNADO_DEFAULTS.metric);
      setTornadoValueMode(p.tornado?.valueMode ?? TORNADO_DEFAULTS.valueMode);
      const desiredRangeMode = p.tornado?.rangeMode ?? (p.priceRange ? "data" : TORNADO_DEFAULTS.rangeMode);
      const hasRange = p.priceRange && hasMeaningfulRange(p.priceRange);
      const priceRangeForBaseline = hasRange
        ? { map: p.priceRange as TierRangeMap, source: p.priceRangeSource ?? "shared" }
        : null;
      const tornadoRangeModeNext =
        hasRange ? desiredRangeMode : desiredRangeMode === "data" ? "symmetric" : desiredRangeMode;

      if (p.priceRange) {
        const ok = setPriceRangeFromData(p.priceRange, p.priceRangeSource ?? "shared");
        setTornadoRangeMode(ok ? desiredRangeMode : "symmetric");
        if (!ok) fallbackToSyntheticRanges();
      } else {
        fallbackToSyntheticRanges();
        setTornadoRangeMode(desiredRangeMode === "data" ? "symmetric" : desiredRangeMode);
      }

      const retention = p.retentionPct ?? RETENTION_DEFAULT;
      const floorAdj = p.kpiFloorAdj ?? KPI_FLOOR_ADJ_DEFAULT;
      setRetentionPct(retention);
      setKpiFloorAdj(floorAdj);

      setOptResult(null);
      setOptimizedRun(null);
      setOptError(null);
      setLastOptAt(null);
      setScorecardView("current");
      setTornadoView("current");
      setPresetSel("");
      setScenarioPresetId(p.id);
      setAppliedPresetSnapshot({
        id: p.id,
        prices: p.prices,
        costs: p.costs,
        refPrices: p.refPrices,
        features: p.features ?? defaults.features,
        segments: appliedSegments,
        leak: p.leak,
        optConstraints: mergedConstraints,
        optRanges: p.optRanges ?? defaults.optRanges,
        tornado: {
          usePocket: p.tornado?.usePocket ?? TORNADO_DEFAULTS.usePocket,
          priceBump: p.tornado?.priceBump ?? TORNADO_DEFAULTS.priceBump,
          pctBump: p.tornado?.pctBump ?? TORNADO_DEFAULTS.pctBump,
          rangeMode: tornadoRangeModeNext,
          metric: p.tornado?.metric ?? TORNADO_DEFAULTS.metric,
          valueMode: p.tornado?.valueMode ?? TORNADO_DEFAULTS.valueMode,
        },
        retentionPct: retention,
        kpiFloorAdj: floorAdj,
        channelMix: mix,
        uncertainty: p.uncertainty ?? null,
      });
      pinBaseline(
        `Preset: ${p.name}`,
        {
          prices: p.prices,
          costs: p.costs,
          features: p.features ?? defaults.features,
          refPrices: p.refPrices,
          leak: p.leak,
          segments: appliedSegments,
          tornadoPocket: p.tornado?.usePocket ?? TORNADO_DEFAULTS.usePocket,
          tornadoPriceBump: p.tornado?.priceBump ?? TORNADO_DEFAULTS.priceBump,
          tornadoPctBump: p.tornado?.pctBump ?? TORNADO_DEFAULTS.pctBump,
          tornadoRangeMode: tornadoRangeModeNext,
          tornadoMetric: p.tornado?.metric ?? TORNADO_DEFAULTS.metric,
          tornadoValueMode: p.tornado?.valueMode ?? TORNADO_DEFAULTS.valueMode,
          retentionPct: retention,
          kpiFloorAdj: floorAdj,
          priceRange: priceRangeForBaseline,
          optRanges: p.optRanges ?? defaults.optRanges,
          optConstraints: mergedConstraints,
          channelMix: mix,
        },
        { toastKind: "info", toastMessage: "Preset applied and pinned as baseline" }
      );
      pushJ(`Loaded preset: ${p.name}`);
    },
    [KPI_FLOOR_ADJ_DEFAULT, RETENTION_DEFAULT, TORNADO_DEFAULTS.metric, TORNADO_DEFAULTS.priceBump, TORNADO_DEFAULTS.pctBump, TORNADO_DEFAULTS.rangeMode, TORNADO_DEFAULTS.usePocket, TORNADO_DEFAULTS.valueMode, checkFeasible, defaults, fallbackToSyntheticRanges, normalizeChannelMix, pinBaseline, pushJ, setChannelBlendApplied, setChannelMix, setCosts, setCoverageUsePocket, setFeatures, setKpiFloorAdj, setLeak, setLastOptAt, setOptConstraints, setOptError, setOptRanges, setOptResult, setPresetSel, setPriceRangeFromData, setPrices, setRefPrices, setRetentionPct, setScenarioPresetId, setScorecardView, setSegments, setTornadoMetric, setTornadoPctBump, setTornadoPocket, setTornadoPriceBump, setTornadoRangeMode, setTornadoValueMode, setTornadoView, toast]
  );

  const resetActivePreset = useCallback(() => {
    if (!scenarioPresetId) return;
    const p = PRESETS.find((x) => x.id === scenarioPresetId);
    if (!p) return;
    applyScenarioPreset(p);
  }, [applyScenarioPreset, scenarioPresetId]);


  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Left: title + tagline + version */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold">Pricing Optimizer</h1>
                <span className="text-xs text-gray-500">
                  v0.3 - Latent-class choice model (3 segments)
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Good/Better/Best ladder - pocket price waterfall - profit frontier -
                tornado sensitivity - cohorts
              </p>
              <div className="no-print mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <button
                  type="button"
                  onClick={handleTourStart}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  aria-label="Take the guided product tour"
                >
                  Take tour
                </button>
                <span className="text-xs text-slate-500">
                  4 steps - highlights each key section
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                <a
                  className="border rounded px-3 py-1 text-sm bg-white hover:bg-gray-50"
                  href="https://github.com/leibenjamin/pricing-optimizer"
                  target="_blank"
                  rel="noreferrer"
                >
                  View source
                </a>

                <a
                  className="border rounded px-3 py-1 text-sm bg-white hover:bg-gray-50"
                  href="mailto:contact@benlei.org"
                >
                  Contact
                </a>

                {/* Case study (future) */}
                <button
                  type="button"
                  aria-disabled="true"
                  disabled
                  title="Coming soon"
                  className="border rounded px-3 py-1 text-sm bg-gray-100 text-gray-400 cursor-not-allowed"
                >
                  Case study (soon)
                </button>
              </div>

              <div className="no-print flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 rounded-md border text-sm hover:bg-gray-50"
                  aria-label="Print this analysis"
                  title="Print this analysis"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Sticky mini top-nav (desktop & tablet) */}
      <div
        ref={stickyNavRef}
        className="sticky top-0 z-40 hidden md:block bg-white/80 backdrop-blur border-b print:hidden"
        role="region"
        aria-label="Quick navigation across sections"
      >
        <div className="mx-auto max-w-7xl px-4 py-2">
          <nav aria-label="Section shortcuts">
            <div className="flex gap-2 overflow-x-auto no-scrollbar text-sm">
              {NAV_SECTIONS.map((id) => (
                <button
                  key={id}
                  onClick={() => scrollToId(id)}
                  className={
                    "px-3 py-1 rounded border bg-white hover:bg-gray-50 " +
                    (activeSection === id
                      ? "border-blue-500 text-blue-600"
                      : "border-gray-200 text-gray-700")
                  }
                  aria-current={activeSection === id ? "page" : undefined}
                >
                  {labelFor(id)}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-4 min-h-screen print-grid-1 print:gap-2">
        {/* Left half: tabbed workspace */}
        <div className="col-span-12 lg:col-span-6 min-w-0">
          <div className="no-print mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Quick path
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                1) Apply a preset (auto-baseline)
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                2) Optimize (baseline saved before run)
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                3) Read results on the right; export in Review
              </span>
              <button
                type="button"
                className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                onClick={() => {
                  setLeftColumnTab("optimize");
                  scrollToId("global-optimizer");
                }}
              >
                Jump to Optimize
              </button>
            </div>
          </div>
          <div className="no-print mb-3">
            <div
              className="inline-flex flex-wrap items-center gap-2"
              role="tablist"
              aria-label="Left column views"
            >
              <button
                id="tab-btn-load"
                type="button"
                role="tab"
                aria-selected={leftColumnTab === "load"}
                aria-controls="tab-load-scenario"
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  leftColumnTab === "load"
                    ? "bg-gray-900 text-white border-gray-900 shadow"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setLeftColumnTab("load")}
              >
                Load Scenario
              </button>
              <button
                id="tab-btn-adjust"
                type="button"
                role="tab"
                aria-selected={leftColumnTab === "adjust"}
                aria-controls="tab-adjust-scenario"
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  leftColumnTab === "adjust"
                    ? "bg-gray-900 text-white border-gray-900 shadow"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => {
                  setLeftColumnTab("adjust");
                  setAdjustSubTab((cur) => cur || "sliders");
                }}
              >
                Adjust Scenario
              </button>
              <button
                id="tab-btn-optimizer"
                type="button"
                role="tab"
                aria-selected={leftColumnTab === "optimize"}
                aria-controls="tab-global-optimizer"
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  leftColumnTab === "optimize"
                    ? "bg-gray-900 text-white border-gray-900 shadow"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setLeftColumnTab("optimize")}
              >
                Optimize
              </button>
              <button
                id="tab-btn-save"
                type="button"
                role="tab"
                aria-selected={leftColumnTab === "save"}
                aria-controls="tab-save-scenario"
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  leftColumnTab === "save"
                    ? "bg-gray-900 text-white border-gray-900 shadow"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setLeftColumnTab("save")}
              >
                Review & Export
              </button>
            </div>
          </div>

          {leftColumnTab === "adjust" && (
            <div className="no-print mb-3">
              <div
                className="inline-flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="Adjust scenario detail tabs"
              >
                <button
                  id="tab-btn-scenario-sliders"
                  type="button"
                  role="tab"
                  aria-selected={adjustSubTab === "sliders"}
                  aria-controls="tab-adjust-sliders"
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                    adjustSubTab === "sliders"
                      ? "bg-gray-900 text-white border-gray-900 shadow"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setAdjustSubTab("sliders")}
                >
                  Scenario Sliders
                </button>
                <button
                  id="tab-btn-customer-segments"
                  type="button"
                  role="tab"
                  aria-selected={adjustSubTab === "segments"}
                  aria-controls="tab-adjust-segments"
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                    adjustSubTab === "segments"
                      ? "bg-gray-900 text-white border-gray-900 shadow"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setAdjustSubTab("segments")}
                >
                  Customer Segments
                </button>
                <button
                  id="tab-btn-leakages"
                  type="button"
                  role="tab"
                  aria-selected={adjustSubTab === "leakages"}
                  aria-controls="tab-adjust-leakages"
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                    adjustSubTab === "leakages"
                      ? "bg-gray-900 text-white border-gray-900 shadow"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setAdjustSubTab("leakages")}
                >
                  Leakages
                </button>
              </div>
            </div>
          )}

          {leftColumnTab === "load" && (
            <div role="tabpanel" id="tab-load-scenario" aria-labelledby="tab-btn-load" className="space-y-3 md:space-y-4 min-w-0">
              <Section id="preset-scenarios" title="Preset scenarios" className="order-0">
                        <div className="text-[11px] text-slate-600 mb-1">
                          Each preset applies ladder, costs, refs, features, segments, leakages (with channel blend if defined), optimizer ranges/guardrails, tornado knobs, and cohort retention. It should be ready to run the optimizer as-is.
                        </div>
                        <div className="text-[11px] text-slate-600 mb-1">
                          Pick one, hop to Optimize, click Run, then tweak guardrails if needed. Power users can still override any field after applying.
                        </div>
                        <PresetPicker
                          presets={PRESETS}
                          activeId={scenarioPresetId}
                          onApply={applyScenarioPreset}
                          onResetActive={resetActivePreset}
                          onReapply={applyScenarioPreset}
                          activeDiffs={activePresetDiffs}
                          infoId="presets.scenario"
                        className="mt-1"
                      />
                    </Section>
              <Section id="scenario-imports" title="Import & health checks">
                <div className="space-y-3">
                  <div>
                    <div className="text-[12px] font-semibold text-slate-800 mb-1">Load from file or paste</div>
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <label className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 cursor-pointer">
                        Import Scenario JSON (full fidelity)
                        <input
                          type="file"
                          accept="application/json"
                          className="hidden"
                          onChange={handleImportJson}
                          title="Upload (refer to JSON export in Review & Export for format)"
                        />
                      </label>
                      
                      <DataImport
                        onPaste={(obj) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          applyScenarioPartial(obj as any);
                          pushJ?.(`[${now()}] Imported scenario CSV`);
                          toast("success", "Scenario parameters CSV applied");
                        }}
                        onToast={(kind, msg) => toast(kind, msg)}
                      />

                      <button
                        id="sales-import-trigger"
                        className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                        onClick={() => setShowSalesImport(true)}
                        title="Upload sales logs CSV and estimate latent-class segments from sales data"
                      >
                        Import Sales Data CSV (estimate)
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      JSON restores everything (ladder, leak, refs, features, segments, constraints, ranges, channel blend, uncertainty) and round-trips with Export JSON/short link. Paste CSV for lightweight ladder/segments (matches the Export CSV format); Sales CSV estimates segments from logs.
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] font-semibold text-slate-800 mb-1">Reset and health</div>
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <button
                        className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                        onClick={resetAllSettings}
                        title="Reset all fields to sensible defaults"
                      >
                        Reset all settings to defaults
                      </button>
                      <InfoTip id="import.resetAll" ariaLabel="Reset all settings to defaults" />

                      <button
                        className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                        onClick={clearAllSettings}
                        title="Clear all fields (set to zero/blank)"
                      >
                        Clear all settings
                      </button>
                      <InfoTip id="import.clearAll" ariaLabel="Clear all settings to blank" />

                      <button
                        className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                        onClick={handleTestBackend}
                        aria-label="Test backend connectivity"
                        title="Quick health check (HEAD /api/get?s=ping)"
                      >
                        Test backend
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Reset/clear affects all tabs; backend test pings the short-link API to confirm connectivity.
                    </div>
                  </div>
                </div>
              </Section>

              <Modal
                open={showSalesImport}
                onClose={() => setShowSalesImport(false)}
                title="Import Sales CSV & Estimate Segments"
                size="xl"
                footer={
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">
                      The estimator runs in a Web Worker and won't block the UI. Your CSV never leaves the browser.
                    </p>
                    <button
                      className="border rounded px-3 py-1 text-sm bg-white hover:bg-gray-50"
                      onClick={() => setShowSalesImport(false)}
                    >
                      Close
                    </button>
                  </div>
                }
              >
                <div className="text-xs text-gray-700 mb-2">
                  1) Upload your sales CSV &nbsp;?&nbsp; 2) Map columns &nbsp;?&nbsp; 3) Estimate.
                  Use compact column names if possible; unknowns can be left blank.
                </div>
                <SalesImport
                  onApply={({ segments, diagnostics, stats }) => {
                    const segs = mapFitToSegments(segments);
                    setSegments(segs);
                    if (
                      !stats ||
                      !stats.priceRange ||
                      !setPriceRangeFromData(
                        stats.priceRange,
                        stats.priceRangeSource ?? "imported"
                      )
                    ) {
                      fallbackToSyntheticRanges();
                    }
                    setFitInfo(diagnostics);
                    pushJ?.(
                      `[${now()}] Estimated from sales data (logLik=${Math.round(
                        diagnostics.logLik
                      )}, iters=${diagnostics.iters}, converged=${diagnostics.converged})`
                    );
                    toast("success", "Applied latent-class estimate");
                    toast("info", "Segments updated. Re-pin baseline if you want deltas on this mix.");
                  }}
                  onToast={(kind, msg) => toast(kind, msg)}
                  onDone={() => setShowSalesImport(false)}
                />
              </Modal>
            </div>
          )}

          {leftColumnTab === "adjust" && (
            <div role="tabpanel" id="tab-adjust-scenario" aria-labelledby="tab-btn-adjust" className="space-y-3 md:space-y-4 min-w-0">
              {adjustSubTab === "sliders" && (
          <>
          <Section id="scenario" title="Scenario Panel" className="left-rail-scroll overflow-x-auto order-1">
                      <div className="shrink-0 space-y-4">
                      </div>
                      <div id="scenarioScroll" className="flex-1 min-h-0 overflow-y-auto pr-2 pb-4">
                        {(["good", "better", "best"] as const).map((tier) => (
                          <div key={tier} className="space-y-1">
                            <label className="block text-sm font-medium capitalize">
                              {tier} price (${prices[tier].toLocaleString(undefined, { maximumFractionDigits: 2 })})
                            </label>
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="range"
                                min={sliderMin}
                                max={sliderMax}
                                step={0.01}
                                value={prices[tier]}
                                onFocus={() => beginPriceEdit(tier)}
                                onPointerDown={() => beginPriceEdit(tier)}
                                onMouseDown={() => beginPriceEdit(tier)}
                                onTouchStart={() => beginPriceEdit(tier)}
                                onChange={(e) => updatePrice(tier, Number(e.target.value))}
                                onPointerUp={() => commitPriceEdit(tier)}
                                onPointerCancel={() => commitPriceEdit(tier)}
                                onMouseUp={() => commitPriceEdit(tier)}
                                onTouchEnd={() => commitPriceEdit(tier)}
                                onBlur={() => commitPriceEdit(tier)}
                                className="flex-[1.4] min-w-[140px] max-w-[220px]"
                                aria-label={`${tier} price slider`}
                              />
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                inputMode="decimal"
                              value={prices[tier]}
                              onFocus={() => beginPriceEdit(tier)}
                              onChange={(e) => updatePrice(tier, Number(e.target.value))}
                              onBlur={(e) => commitPriceEdit(tier, Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                                className="w-24 border rounded px-2 py-1 text-sm"
                                aria-label={`${tier} price input`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {(["good", "better", "best"] as const).map((tier) => (
                          <div key={tier} className="text-xs">
                            <div className="font-semibold capitalize mb-1">
                              {tier} cost
                            </div>
                            <input
                              type="number"
                              value={costs[tier]}
                              onFocus={() => beginCostEdit(tier)}
                              onChange={(e) => {
                                const to = Number(e.target.value || 0);
                                setCosts((c) => ({ ...c, [tier]: to }));
                              }}
                              onBlur={(e) => commitCostEdit(tier, Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              className="w-full border rounded px-2 py-1"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {(["good", "better", "best"] as const).map((tier) => (
                          <label
                            key={`A-${tier}`}
                            className="text-xs flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={!!features.featA[tier]}
                              onChange={() =>
                                setFeatures((f) => {
                                  const on = !f.featA[tier];
                                  pushJ(formatToggle("FeatA", tier, on));
                                  return {
                                    ...f,
                                    featA: { ...f.featA, [tier]: on ? 1 : 0 },
                                  };
                                })
                              }
                            />
                            FeatA {tier}
                          </label>
                        ))}
                        {(["good", "better", "best"] as const).map((tier) => (
                          <label
                            key={`B-${tier}`}
                            className="text-xs flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={!!features.featB[tier]}
                              onChange={() =>
                                setFeatures((f) => {
                                  const on = !f.featB[tier];
                                  pushJ(formatToggle("FeatB", tier, on));
                                  return {
                                    ...f,
                                    featB: { ...f.featB, [tier]: on ? 1 : 0 },
                                  };
                                })
                              }
                            />
                            FeatB {tier}
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 rounded border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                          Uncertainty heuristics
                          <RiskBadge note={riskNote} infoId="risk.badge" />
                          <InfoTip id="risk.sliders" ariaLabel="How do uncertainty sliders work?" />
                        </div>
                        <div className="text-[11px] text-amber-800">
                          Tweak how wide preset bands are for charts and badges. Higher deltas = wider confidence ranges; defaults come from each preset.
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-900">
                          <label className="flex items-center gap-2">
                            Price scale delta (+/- %)
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-20"
                              min={0}
                              max={50}
                              step={0.5}
                              value={Math.round(uncPriceDelta * 1000) / 10}
                              onChange={(e) => updateUncertainty("priceScaleDelta", Number(e.target.value) || 0)}
                            />
                          </label>
                          <label className="flex items-center gap-2">
                            Leak delta (+/- pp)
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-20"
                              min={0}
                              max={50}
                              step={0.5}
                              value={Math.round(uncLeakDelta * 1000) / 10}
                              onChange={(e) => updateUncertainty("leakDeltaPct", Number(e.target.value) || 0)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50"
                          onClick={() => {
                            localStorage.removeItem("po:prices");
                            localStorage.removeItem("po:costs");
                            localStorage.removeItem("po:refs");
                            localStorage.removeItem("po:leak");
                            localStorage.removeItem("po:constraints");
                            // You can also hard reset state if you want immediate UI reflect:
                            setPrices({ good: 9, better: 15, best: 25 });
                            setCosts({ good: 3, better: 5, best: 8 });
                            setRefPrices({ good: 10, better: 18, best: 30 });
                            setLeak({ promo: { good: 0.05, better: 0.05, best: 0.05 }, volume: { good: 0.03, better: 0.03, best: 0.03 }, paymentPct: 0.029, paymentFixed: 0.1, fxPct: 0, refundsPct: 0.02 });
                            setOptConstraints({ gapGB: 2, gapBB: 3, marginFloor: { good: 0.25, better: 0.25, best: 0.25 }, charm: false, usePocketProfit: false, usePocketMargins: false });
                            setChannelBlendApplied(false);
                          }}
                          aria-label="Reset all settings to defaults"
                        >
                          Reset defaults
                        </button>
                        <span className="text-[11px] text-slate-500">
                          Resets ladder, refs, leak (incl. paymentFixed $0.10), gaps (gapBB=3), constraints, and clears channel blend.
                          <InfoTip id="reset.defaults" ariaLabel="What does reset affect?" />
                        </span>
                      </div>
                    </Section>
                    <Section id="reference-prices" title="Reference prices for optimizer">
                      <Explanation slot="refs.howUsed" className="text-[11px]">
                        <div className="font-semibold text-slate-700">How these are used</div>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>We treat these as customers&apos; remembered â€œfairâ€ prices; prices above the ref get a loss penalty, prices below get a small gain.</li>
                          <li>Impact is scaled by each segment&apos;s anchoring strength (`alphaAnchor`) and loss aversion (`lambdaLoss`) in the demand model that feeds the optimizer and charts.</li>
                          <li>Keep refs near today&apos;s street/list prices or survey anchors; presets and imports set them automatically but you can tune before running the optimizer.</li>
                        </ul>
                      </Explanation>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2 items-center">
                        <label className="text-sm">Good</label>
                        <input
                          type="number"
                          className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                          value={refPrices.good}
                          onChange={(e) =>
                            setRefPrices((p) => ({ ...p, good: Number(e.target.value) }))
                          }
                        />
                        <label className="text-sm">Better</label>
                        <input
                          type="number"
                          className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                          value={refPrices.better}
                          onChange={(e) =>
                            setRefPrices((p) => ({
                              ...p,
                              better: Number(e.target.value),
                            }))
                          }
                        />
                        <label className="text-sm">Best</label>
                        <input
                          type="number"
                          className="col-span-2 border rounded px-2 py-1 h-9 w-full"
                          value={refPrices.best}
                          onChange={(e) =>
                            setRefPrices((p) => ({ ...p, best: Number(e.target.value) }))
                          }
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          className="border rounded-md px-3 py-1.5 text-xs bg-white hover:bg-gray-50"
                          onClick={setRefsFromCurrent}
                        >
                          Set from current prices
                        </button>
                        <span className="text-[11px] text-slate-600">Best paired with your current ladder or imported street prices.</span>
                      </div>
                    </Section>
                    </>
              )}
              {adjustSubTab === "segments" && (
          <Section
                      id="customer-segments"
                      title={
                        <span className="inline-flex items-center gap-2">
                          <span>Customer Segments</span>
                          <InfoTip
                            id="segments.mix"
                            ariaLabel="Adjust segment mix and review narratives"
                            align="right"
                          />
                        </span>
                      }
                      actions={
                        <button
                          className="text-xs border rounded px-2 py-1"
                          onClick={() => setSegments(normalizeWeights(segments))}
                        >
                          Normalize to 100%
                        </button>
                      } 
                      className="order-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {segments.map((seg, i) => {
                          const lines = describeSegment(seg);
                          return (
                            <div
                              key={seg.name}
                              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm space-y-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                    Segment
                                  </div>
                                  <div className="text-base font-semibold text-slate-900">
                                    {seg.name}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[11px] text-slate-500">Weight</div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {Math.round(seg.weight * 100)}%
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={seg.weight}
                                  onChange={(e) => {
                                    const w = Number(e.target.value);
                                    const next = segments.map((t, j) =>
                                      j === i ? { ...t, weight: w } : t
                                    );
                                    setSegments(normalizeWeights(next));
                                  }}
                                  className="flex-1"
                                  aria-label={`${seg.name} weight slider`}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={Math.round(seg.weight * 100)}
                                  onChange={(e) => {
                                    const pct = Number(e.target.value);
                                    if (!Number.isFinite(pct)) return;
                                    const clamped = Math.max(0, Math.min(100, pct));
                                    const w = clamped / 100;
                                    const next = segments.map((t, j) =>
                                      j === i ? { ...t, weight: w } : t
                                    );
                                    setSegments(normalizeWeights(next));
                                  }}
                                  className="w-16 border rounded px-2 py-1 text-right"
                                  aria-label={`${seg.name} weight percent`}
                                />
                              </div>

                              <div className="mt-2">
                                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Story
                                </div>
                                <ul className="mt-1 space-y-1 list-disc list-inside text-slate-600">
                                  {lines.map((line, idx) => (
                                    <li key={`${seg.name}-line-${idx}`}>{line}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>
              )}
            {adjustSubTab === "leakages" && (
              <WaterfallSection
                leak={leak}
                setLeak={setLeak}
                waterTier={waterTier}
                setWaterTier={setWaterTier}
                presetSel={presetSel}
                setPresetSel={setPresetSel}
                channelBlendApplied={channelBlendApplied}
                setChannelBlendApplied={setChannelBlendApplied}
                channelMix={channelMix}
                setChannelMix={setChannelMix}
                prices={prices}
                WaterfallComponent={Waterfall}
              />
            )}
            </div>
          )}

          {leftColumnTab === "save" && (
            <div role="tabpanel" id="tab-save-scenario" aria-labelledby="tab-btn-save" className="space-y-3 md:space-y-4 min-w-0">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                <div className="text-sm font-semibold text-slate-800">Review & export after an optimizer run</div>
                <div className="mt-1">
                  Freeze the latest ladder as a baseline, compare A/B/C saves, and share print/export links. Baselines auto-save on preset apply and before Optimize runs.
                </div>
              </div>
              <Section id="scenario-baseline" title="Scenario baseline">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      const snapshot = buildScenarioSnapshot({
                        prices,
                        costs,
                        features,
                        refPrices,
                        leak,
                        segments,
                        tornadoPocket,
                        tornadoPriceBump,
                        tornadoPctBump,
                        tornadoRangeMode,
                        tornadoMetric,
                        tornadoValueMode,
                        retentionPct,
                        retentionMonths,
                      kpiFloorAdj,
                      priceRange: priceRangeState,
                      optRanges,
                      optConstraints,
                      channelMix,
                      optimizerKind,
                    });
                      const meta = { label: "Pinned now", savedAt: Date.now() };
                      const kpis = currentKPIs;
                      if (kpis) {
                        const run = makeScenarioRun({
                          scenarioId: scenarioPresetId ?? "custom",
                          ladder: snapshot.prices,
                          costs: snapshot.costs ?? costs,
                          leak: snapshot.leak ?? leak,
                          refPrices: snapshot.refPrices ?? refPrices,
                          features: snapshot.features ?? features,
                          segments: snapshot.segments ? coerceSegmentsForCalc(snapshot.segments, segments) : segments,
                          basis: {
                            usePocketProfit: !!optConstraints.usePocketProfit,
                            usePocketMargins: !!optConstraints.usePocketMargins,
                          },
                          kpis,
                          uncertainty: scenarioUncertainty ?? undefined,
                          meta: { label: meta.label, savedAt: meta.savedAt, source: "baseline" },
                        });
                        setBaselineRun(run);
                        toast("success", "Saved scenario baseline");
                      } else {
                        toast("error", "Baseline not saved: KPIs unavailable");
                      }
                    }}
                  >
                    Re-pin baseline now
                  </button>
                  <div className="text-xs text-gray-600">
                    {baselineRun
                      ? `Baseline saved ${new Date(baselineRun.meta.savedAt).toLocaleString()}`
                      : "No scenario baseline saved yet."}
                  </div>
                  <p className="basis-full text-[11px] text-slate-600">
                    Baselines auto-save when you apply a preset and right before you run Optimize. Use this button after manual tweaks to set a new anchor.
                    </p>
                  </div>
                </Section>
              <Section
                id="export-summary"
                title="Export-ready summary"
                className="order-2"
              >
                {baselineKpis ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                      <div>
                        {(optimizedKpis ?? currentKPIs) && baselineKpis ? (
                          (() => {
                            const target = optimizedKpis ?? currentKPIs;
                            const label = optimizedKpis ? "Optimized" : "Current";
                            const profitDelta = target!.profit - baselineKpis.profit;
                            const activeBase = Math.round(N * (1 - baselineKpis.shares.none));
                            const activeNow = Math.round(N * (1 - target!.shares.none));
                            const activeDelta = activeNow - activeBase;
                            const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
                            const fmtSign = (n: number) => `${n >= 0 ? "+" : "-"}${fmtMoney(Math.abs(n))}`;
                            const fmtActive = (n: number) =>
                              `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString()} active`;
                            return (
                              <>
                                <span className="font-semibold">
                                  {label} vs baseline: {fmtSign(profitDelta)} profit, {fmtActive(activeDelta)}
                                </span>
                                <span className="text-[12px] text-slate-600">
                                  ARPU (active): {fmtSign(target!.arpuActive - baselineKpis.arpuActive)}
                                </span>
                              </>
                            );
                          })()
                        ) : (
                          <span className="text-[12px] text-slate-600">Baseline present; run optimizer or adjust scenario to populate deltas.</span>
                        )}
                      </div>
                      <RiskBadge note={riskNote} infoId="risk.badge" />
                    </div>
                    <ul className="list-disc pl-4 text-[13px] text-slate-700 space-y-1">
                      <li>
                        Executive headline: profit and active deltas above, basis follows the active pocket/list toggle in Optimize.
                      </li>
                      <li>
                        Price moves table below shows which tiers went up/down vs. pinned baseline; pair with the Compare Board for branches.
                      </li>
                      <li>
                        Confidence badge reflects uncertainty inputs; wide bands mean mixed moves warrant caution before rollout.
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600">
                    No baseline pinned yet. Apply a preset or use “Re-pin baseline now” to capture a reference ladder, then summary stats will appear here.
                  </div>
                )}
              </Section>
              <Section
                id="export-narrative"
                title="Narrative (copy-ready)"
                className="order-3"
              >
                {baselineKpis ? (
                  (() => {
                    const target = optimizedKpis ?? currentKPIs;
                    if (!target) {
                      return (
                        <div className="text-[11px] text-slate-600">
                          Baseline present; run optimizer or adjust scenario to populate narrative deltas.
                        </div>
                      );
                    }
                    const profitDelta = target.profit - baselineKpis.profit;
                    const revenueDelta = target.revenue - baselineKpis.revenue;
                    const activeBase = Math.round(N * (1 - baselineKpis.shares.none));
                    const activeNow = Math.round(N * (1 - target.shares.none));
                    const activeDelta = activeNow - activeBase;
                    const arpuDelta = target.arpuActive - baselineKpis.arpuActive;
                    const fmtSign = (n: number, money = true) =>
                      `${n >= 0 ? "+" : "-"}${money ? `$${Math.round(Math.abs(n)).toLocaleString()}` : Math.abs(n).toLocaleString()}`;
                    const driverLine = currentVsOptimizedVM?.topDriverLine;
                    const guardrailNote =
                      currentVsOptimizedVM?.binds && currentVsOptimizedVM.binds.length
                        ? `Guardrails binding: ${currentVsOptimizedVM.binds.join(", ")}.`
                        : "Guardrails slack in this run.";
                    return (
                      <ul className="list-disc pl-4 text-[13px] text-slate-700 space-y-1">
                        <li>
                          Executive: {optimizedKpis ? "Optimized" : "Current"} vs baseline = {fmtSign(profitDelta)} profit, {fmtSign(revenueDelta)} revenue, {fmtSign(activeDelta, false)} active, ARPU {fmtSign(arpuDelta)} (basis follows Optimize toggle).
                        </li>
                        <li>
                          Risk/confidence: <span className="inline-block align-middle"><RiskBadge note={riskNote} infoId="risk.badge" /></span> — wide bands mean mixed moves deserve caution before rollout.
                        </li>
                        <li>
                          Drivers: {driverLine ?? tornadoTopDriver ?? "Run optimizer or refresh tornado to populate top driver"}; {guardrailNote} Check leak assumptions in Waterfall. If bands are wide, test in-market first.
                        </li>
                        <li>
                          Customer impact: see take-rate deltas and price moves for who pays more/less; branch in Compare Board if you need multiple scenarios. Wide bands? Test in-market before rollout.
                        </li>
                      </ul>
                    );
                  })()
                ) : (
                  <div className="text-[11px] text-slate-600">
                    No baseline pinned yet. Apply a preset or use “Re-pin baseline now” to capture a reference ladder, then narrative bullets will appear here.
                  </div>
                )}
              </Section>
              <CompareBoardSection
                className="order-4"
                explanation={
                  <Explanation slot="chart.compareBoard">
                    Save the current ladder into A/B/C, branch your changes, then reload slots while narrating differences. KPIs auto-recompute; use the toggles to control whether saved or current segments/leak/refs are used so you know exactly what's being compared.
                </Explanation>
              }
              compareUseSavedSegments={compareUseSavedSegments}
              setCompareUseSavedSegments={setCompareUseSavedSegments}
              compareUseSavedLeak={compareUseSavedLeak}
              setCompareUseSavedLeak={setCompareUseSavedLeak}
              compareUseSavedRefs={compareUseSavedRefs}
              setCompareUseSavedRefs={setCompareUseSavedRefs}
              onSaveSlot={saveToSlot}
              onLoadSlot={(id) => loadFromSlot(id)}
              onClearSlot={(id) => {
                clearSlot(id);
                toast("info", `Cleared slot ${id}`);
                setJournal((j) => [...j]);
              }}
              slots={compareBoardData.slots}
              current={compareBoardData.current}
            />
            <ShareExportSection
              onExportJson={handleExportJson}
              onExportCsv={handleExportCsv}
              onSaveShortLink={saveScenarioShortLink}
              onCopyLink={handleCopyLink}
              onCopyLongUrl={handleCopyLongUrl}
              onTestBackend={handleTestBackend}
            />
            <RecentLinksSection
              recents={readRecents()}
              onReload={(id) => {
                navigateToShortLink(id, typeof window !== "undefined" ? window.location : undefined);
              }}
              onCopy={(id) => {
                copyShortLinkUrl(id, {
                  location: typeof window !== "undefined" ? window.location : undefined,
                  onSuccess: () => toast("success", "Short link copied"),
                  onError: (msg) => toast("error", msg ?? "Copy failed"),
                });
                pushJ(`[${now()}] Copied short link ${id}`);
              }}
              onClearAll={() => {
                clearRecents();
                pushJ(`[${now()}] Cleared recent short links`);
                location.reload();
              }}
            />
            <ScenarioJournalSection
              journal={journal}
              revenue={revenue}
              profit={profit}
              activeCustomers={activeCustomers}
              arpu={arpu}
              profitPerCustomer={profitPerCustomer}
              grossMarginPct={grossMarginPct}
              onClear={() => setJournal([])}
              onDownload={() => {
                downloadJournal(journal);
                pushJ?.(`[${now()}] Downloaded journal`);
              }}
              riskNote={riskNote ?? undefined}
            />
              </div>
            )}

            {leftColumnTab === "optimize" && (
              <div role="tabpanel" id="tab-global-optimizer" aria-labelledby="tab-btn-optimizer" className="col-span-12 lg:col-span-3 space-y-3 md:space-y-4 min-w-0 self-start md:text-[13px] pr-1">
                <OptimizerPanel
                  optRanges={optRanges}
                  setOptRanges={setOptRanges}
                  optConstraints={optConstraints}
                  setOptConstraints={setOptConstraints}
                  coverageUsePocket={coverageUsePocket}
                  setCoverageUsePocket={setCoverageUsePocket}
                  optError={optError}
                  optResult={optResult}
                  quickOptDiagnostics={quickOpt.diagnostics}
                  isOptRunning={isOptRunning}
                  optimizerWhyLines={optimizerWhyLines}
                  optimizerKind={optimizerKind}
                  setOptimizerKind={setOptimizerKind}
                  runOptimizer={runOptimizer}
                  applyOptimizedPrices={applyOptimizedPrices}
                  onQuickOptimize={runQuickOptimizeInline}
                  onResetOptimizer={resetOptimizer}
                  prices={prices}
                  costs={costs}
                  headline={
                    <Explanation slot="chart.optimizer">
                      Fast start: apply a preset then click Run. Set ranges, gaps, and margin floors, then run the grid optimizer (worker). Use pocket toggles to enforce floors and profit after leakages. Charm endings snap to .99 if applicable. If no feasible ladder is found, widen ranges or ease floors/gaps. Cite binding constraints when explaining results.
                    </Explanation>
                  }
                />
                <CoverageSection
                  coverageUsePocket={coverageUsePocket}
                  setCoverageUsePocket={setCoverageUsePocket}
                  kpiFloorAdj={kpiFloorAdj}
                  setKpiFloorAdj={setKpiFloorAdj}
                  coverageSnapshot={coverageSnapshot}
                  optConstraints={optConstraints}
                  optRanges={optRanges}
                  costs={costs}
                  leak={leak}
                  setOptConstraints={setOptConstraints}
                  toast={toast}
                />
                <CurrentVsOptimizedSection
                  vm={currentVsOptimizedVM}
                  canUndo={!!lastAppliedPricesRef.current}
                  canPinBaseline={Boolean(lastOptAt && (!baselineMeta || lastOptAt > baselineMeta.savedAt) && optResult?.kpis)}
                  onApplyOptimized={applyOptimizedLadder}
                  onUndoApply={undoAppliedLadder}
                  onPinBaseline={() => {
                    if (!optResult?.kpis) return;
                    const meta = { label: "Pinned from optimizer", savedAt: Date.now() };
                    const ctx = optResult.context;
                    const run = makeScenarioRun({
                      scenarioId: scenarioPresetId ?? "custom",
                      ladder: optResult.prices,
                      costs: ctx.costs,
                      leak: ctx.leak,
                      refPrices: ctx.refPrices,
                      features: ctx.features,
                      segments: ctx.segments,
                      basis: {
                        usePocketProfit: !!ctx.usePocketProfit,
                        usePocketMargins: !!ctx.usePocketMargins,
                      },
                      kpis: optResult.kpis,
                      uncertainty: scenarioUncertainty ?? undefined,
                      meta: { label: meta.label, savedAt: meta.savedAt, source: "baseline" },
                    });
                    setBaselineRun(run);
                    toast("success", "Baseline pinned from optimizer");
                  }}
                />
            <Section id="methods" title="Methods">
              <p className="text-sm text-gray-700 print-tight">
                MNL: U = b0(j) + bP*price + bA*featA + bB*featB; outside option
                intercept fixed at 0. Estimated by MLE on ~15k synthetic obs with
                ridge regularization.
              </p>
              {fitInfo && (
                <div className="text-xs text-gray-700 mt-2 space-y-1 bg-slate-50 border border-slate-200 rounded p-2">
                  <div className="font-semibold text-[11px] text-slate-800">Latest fit (sales import)</div>
                  <div>
                    Train/Test logLik: {Math.round(fitInfo.trainLogLik ?? fitInfo.logLik)} /{" "}
                    {fitInfo.testLogLik != null ? Math.round(fitInfo.testLogLik) : "n/a"}; iters {fitInfo.iters};{" "}
                    {fitInfo.converged ? "converged" : "not converged"}
                  </div>
                  {typeof fitInfo.pseudoR2 === "number" && (
                    <div>Pseudo R^2 (test): {(fitInfo.pseudoR2 * 100).toFixed(1)}%</div>
                  )}
                  {typeof fitInfo.accuracy === "number" && (
                    <div>Accuracy (test): {(fitInfo.accuracy * 100).toFixed(1)}%</div>
                  )}
                  {fitInfo.dataDiagnostics?.warnings?.length ? (
                    <div className="text-amber-800">
                      Warnings:
                      <ul className="list-disc ml-4 space-y-0.5">
                        {fitInfo.dataDiagnostics.warnings.slice(0, 4).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </Section>
            <RobustnessSection results={robustnessResults} />
            </div>
          )}
        </div>

      {/* Right: Charts */}
      <div className="col-span-12 lg:col-span-6 space-y-4 min-w-0">
          <ScorecardCallouts
            scorecardView={scorecardView}
            hasOptimized={!!optimizedKpis}
            onChangeView={setScorecardView}
            onPinBaseline={pinBaselineNow}
            scorecardVM={scorecardVM}
            scorecardBand={scorecardBand}
            priceDeltas={scorecardPriceDeltas ?? undefined}
              callouts={{
                hasResult: !!optResult,
                basisLabel: optConstraints.usePocketProfit ? "Pocket profit (after leakages)" : "List profit",
                ladderLabel: (() => {
                  if (!optResult) return "";
                  const ladderStr = `${optResult.prices.good}/${optResult.prices.better}/${optResult.prices.best}`;
                  if (baselineRun?.ladder) {
                    const deltas = (["good", "better", "best"] as const)
                      .map((tier) => {
                        const base = baselineRun.ladder![tier];
                        const cur = optResult.prices[tier];
                        const delta = cur - base;
                        const sign = delta >= 0 ? "+" : "-";
                        return `${tier[0].toUpperCase()}: ${sign}$${Math.abs(delta).toFixed(2)}`;
                      })
                      .join(" | ");
                    return `Ladder ${ladderStr} (vs baseline: ${deltas})`;
                  }
                  return `Ladder ${ladderStr}`;
                })(),
              delta: explainDeltaOptimized,
              fallbackNarrative: scorecardVM.explain,
              guardrails: guardrailsForOptimized,
              optimizerWhyLines,
              binds: currentVsOptimizedVM?.binds,
              topDriverLine: currentVsOptimizedVM?.topDriverLine,
              guardrailFloorLine: currentVsOptimizedVM?.guardrailFloorLine ?? guardrailsForOptimized.floorLine,
              validationNotes: currentVsOptimizedVM
                ? [
                    currentVsOptimizedVM.driftNote ?? undefined,
                    "Check guardrail feasibility in Pocket floor coverage.",
                    "Review leakages in Pocket waterfall.",
                    "Re-run optimizer after ladder or basis tweaks, then export/print.",
                  ].filter(Boolean) as string[]
                : undefined,
              riskNote: riskNote,
            }}
          />

          <FrontierSection
            frontierViewModel={frontierViewModel}
            frontierSummary={frontierSummary}
            frontierTier={frontierTier}
            setFrontierTier={setFrontierTier}
          frontierCompareCharm={frontierCompareCharm}
          setFrontierCompareCharm={setFrontierCompareCharm}
          usePocketProfit={!!optConstraints.usePocketProfit}
          frontierSweep={frontierSweep}
          actions={<ActionCluster chart="frontier" id="frontier-main" csv />}
          riskNote={riskNote}
          FrontierChartComponent={FrontierChartReal}
        />


          <TakeRateSection
            scenarios={takeRateScenarios}
            summary={takeRateSummary}
            segmentOptions={takeRateSegmentOptions}
            takeRateMode={takeRateMode}
            setTakeRateMode={setTakeRateMode}
            takeRateBaselineKey={takeRateBaselineKey}
            takeRateSegmentKey={takeRateSegmentKey}
            setTakeRateSegmentKey={setTakeRateSegmentKey}
            segmentBreakdownEnabled={showSegmentBreakdown}
            setSegmentBreakdownEnabled={setShowSegmentBreakdown}
            segmentBreakdownScenarioKey={segmentBreakdownScenarioKey}
          setSegmentBreakdownScenarioKey={setSegmentBreakdownScenarioKey}
          segmentBreakdownScenarios={segmentBreakdownScenarios}
          segmentScenarioOptions={takeRateContexts.map((c) => ({ key: c.key, label: c.label }))}
          selectedSegmentLabel={selectedSegmentLabel}
          riskNote={riskNote}
        />

        <CohortSection
          retentionPct={retentionPct}
          setRetentionPct={setRetentionPct}
          retentionMonths={retentionMonths}
          setRetentionMonths={setRetentionMonths}
          showAdvanced={showCohortAdvanced}
          setShowAdvanced={setShowCohortAdvanced}
          cohortSummaryCards={cohortSummaryCards}
          cohortScenarios={cohortScenarios}
          actions={<ActionCluster chart="cohort" id="cohort-curve" csv />}
          riskNote={riskNote}
        />

          <Section
            id="tornado"
            title="Tornado - what moves profit?"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="tornado" id="tornado-main" csv />}
          >
            <Explanation slot="chart.tornado">
              Tornado varies one factor at a time around the base ladder and shows profit or revenue sensitivity (low/high) as $ or % of base. Switch between Current and Optimized to see how drivers change. Pocket toggles leakages; leak bump stress-tests FX/refunds/payment assumptions.
            </Explanation>
            <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tornadoPocket}
                  onChange={(e) => setTornadoPocket(e.target.checked)}
                />
                Use <span className="font-medium">pocket</span> (after leakages)
              </label>

              <label className="flex items-center gap-1">
                KPI
                <select
                  className="border rounded px-2 h-7 bg-white"
                  value={tornadoMetric}
                  onChange={(e) => setTornadoMetric(e.target.value as TornadoMetric)}
                >
                  <option value="profit">Profit</option>
                  <option value="revenue">Revenue</option>
                </select>
              </label>

              <label className="flex items-center gap-1">
                Units
                <select
                  className="border rounded px-2 h-7 bg-white"
                  value={tornadoValueMode}
                  onChange={(e) => setTornadoValueMode(e.target.value as TornadoValueMode)}
                >
                  <option value="absolute">$ delta</option>
                  <option value="percent">% of base</option>
                </select>
              </label>

              <label className="flex items-center gap-1">
                Range basis
                <select
                  className="border rounded px-2 h-7 bg-white"
                  value={tornadoRangeMode}
                  onChange={(e) =>
                    setTornadoRangeMode(
                      e.target.value as "symmetric" | "data"
                    )
                  }
                >
                  <option value="symmetric">+/-{tornadoPriceBump}% symmetric</option>
                  <option value="data" disabled={!priceRangeState?.map}>
                    {dataRangeOptionLabel}
                  </option>
                </select>
              </label>

              {tornadoRangeMode === "symmetric" ? (
                <label className="flex items-center gap-1">
                  Span
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="40"
                    className="border rounded px-2 h-7 w-16"
                    value={tornadoPriceBump}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setTornadoPriceBump(Math.max(1, Math.min(40, v)));
                    }}
                  />
                  <span>%</span>
                </label>
              ) : (
                <div className="text-[11px] text-slate-600 min-w-48">
                  {dataRangeSummary
                    ? dataRangeSummary
                    : "No data-driven ranges yet. Import sales data to override the default span."}
                </div>
              )}

              <label className="flex items-center gap-1">
                Leak bump (FX/Refunds/Payment)
                <input
                  type="number"
                  step="0.5"
                  className="border rounded px-2 h-7 w-16"
                  value={tornadoPctBump}
                  onChange={(e) =>
                    setTornadoPctBump(Number(e.target.value) || 0)
                  }
                />
                <span>pp</span>
              </label>

              <div className="flex items-center gap-1">
                <span>View</span>
                <div className="inline-flex overflow-hidden rounded border">
                  <button
                    type="button"
                    className={`px-2 h-7 ${tornadoView === "current" ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => setTornadoView("current")}
                  >
                    Current
                  </button>
                  <button
                    type="button"
                    className={`px-2 h-7 ${
                      tornadoView === "optimized" && hasOptimizedTornado
                        ? "bg-gray-900 text-white"
                        : "bg-white"
                    } ${!hasOptimizedTornado ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => hasOptimizedTornado && setTornadoView("optimized")}
                    disabled={!hasOptimizedTornado}
                  >
                    Optimized
                  </button>
                </div>
                <InfoTip id="chart.tornado" ariaLabel="How to read tornado chart?" />
              </div>
            </div>

            <div className="text-[11px] text-slate-600 mb-2">
              {tornadoView === "optimized" && !hasOptimizedTornado
                ? "Run the optimizer to enable the Optimized view and compare driver magnitudes."
                : "Use the controls above (pocket/list, KPI, units, span) to stress assumptions and resize the span used for each driver."}
            </div>

            <div className="flex items-center justify-between mb-2 text-xs text-slate-600">
              <span>Showing: {tornadoViewLabel} ladder • {tornadoMetricLabel} • {tornadoUnitLabel}</span>
              <div className="flex items-center gap-2">
                <RiskBadge note={riskNote} infoId="risk.badge" />
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="chart.tornado"
                  ariaLabel="How should I use the tornado sensitivity chart?"
                />
              </div>
            </div>

            {!tornadoHasSignal && (
              <div className="mb-2 rounded border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Tornado deltas are near zero at this span/view. Try widening the span, switching range mode, toggling pocket/list, or swapping KPI/units to stress assumptions.
              </div>
            )}

            <Suspense
              fallback={
                <div className="text-xs text-gray-500 p-2">
                  Loading tornado...
                </div>
              }
            >
              <ErrorBoundary title="Tornado chart failed">
                <Tornado
                  chartId="tornado-main"
                  viewModel={tornadoViewModel}
                  riskNote={riskNote}
                />
              </ErrorBoundary>
            </Suspense>
          </Section>
        </div>
      </main>
      <StickyToolbelt />
      <Toasts />
      <OnboardingOverlay
        open={showOnboarding}
        stepIndex={onboardingStep}
        steps={ONBOARDING_STEPS}
        onBack={() => setOnboardingStep((s) => Math.max(0, s - 1))}
        onNext={() =>
          setOnboardingStep((s) =>
            Math.min(ONBOARDING_STEPS.length - 1, s + 1)
          )
        }
        onDismiss={handleTourDismiss}
        onJump={(id) => scrollToId(id)}
      />
    </div>
  );
}
