// src/App.tsx

import { Suspense, lazy, type ReactNode, type ChangeEvent } from "react";
// replace direct imports:
const FrontierChartReal = lazy(() => import("./components/FrontierChart"));
const Tornado = lazy(() => import("./components/Tornado"));
const Waterfall = lazy(() => import("./components/Waterfall"));
const TakeRateChart = lazy(() => import("./components/TakeRateChart"));

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
  type Segment,
  type Prices,
} from "./lib/segments";
import { choiceShares } from "./lib/choice";
import { type SearchRanges, type GridDiagnostics } from "./lib/optimize";
import { runOptimizeInWorker } from "./lib/optWorker";

import { computePocketPrice, type Leakages, type Tier } from "./lib/waterfall";
import { LEAK_PRESETS } from "./lib/waterfallPresets";

import { gridOptimize } from "./lib/optQuick";
import { tornadoProfit } from "./lib/sensitivity";

import { simulateCohort } from "./lib/simCohort";
import MiniLine from "./components/MiniLine";
import { describeSegment } from "./components/SegmentCards";

import { pocketCoverage } from "./lib/coverage";

import HeatmapMini from "./components/HeatmapMini";
import { feasibilitySliceGB } from "./lib/coverage";

import {
  collectPriceRange,
  hasMeaningfulRange,
  type PriceRangeSource,
  type TierRangeMap,
} from "./lib/priceRange";

import { PRESETS, type Preset } from "./lib/presets";
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
import { csvTemplate } from "./lib/csv";

import { preflight, fetchWithRetry } from "./lib/net";

import CompareBoard from "./components/CompareBoard";
import ScorecardToolbar from "./components/ScorecardToolbar";
import { kpisFromSnapshot, type SnapshotKPIs } from "./lib/snapshots";
import { runRobustnessScenarios, type UncertaintyScenario } from "./lib/robustness";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (x: number) => `${Math.round(x * 1000) / 10}%`;

const WATERFALL_LEGEND = [
  { key: "list", label: "List", color: "#0ea5e9", infoId: "waterfall.step.list", aria: "What is the list price starting point?" },
  { key: "promo", label: "Promo", color: "#f97316", infoId: "waterfall.step.promo", aria: "How do promo discounts work?" },
  { key: "volume", label: "Volume", color: "#fb923c", infoId: "waterfall.step.volume", aria: "What is the volume discount step?" },
  { key: "paymentPct", label: "Payment %", color: "#facc15", infoId: "waterfall.step.paymentPct", aria: "Why is there a payment % fee?" },
  { key: "paymentFixed", label: "Payment $", color: "#fde047", infoId: "waterfall.step.paymentFixed", aria: "Why is there a payment $ fee?" },
  { key: "fx", label: "FX", color: "#38bdf8", infoId: "waterfall.step.fx", aria: "What does the FX step represent?" },
  { key: "refunds", label: "Refunds", color: "#f87171", infoId: "waterfall.step.refunds", aria: "How are refunds handled?" },
  { key: "pocket", label: "Pocket", color: "#22c55e", infoId: "waterfall.step.pocket", aria: "What is pocket price?" },
] as const;

const WATERFALL_COLOR_MAP: Record<string, string> = WATERFALL_LEGEND.reduce(
  (acc, entry) => {
    acc[entry.label] = entry.color;
    return acc;
  },
  {} as Record<string, string>
);

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
function formatBaselineLabel(meta: BaselineMeta | null): string {
  if (!meta) return "Pinned on load";
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(meta.savedAt));
  return `${meta.label} - ${formatted}`;
}
const ROBUST_SCENARIOS: UncertaintyScenario[] = [
  { name: "Base", segmentScalePrice: 1 },
  { name: "More price sensitive", segmentScalePrice: 1.2, leakDeltaPct: 0.05 },
  { name: "Less price sensitive", segmentScalePrice: 0.8, leakDeltaPct: -0.05 },
];
const ONBOARDING_STEPS = [
  {
    id: "start-ladder",
    title: "Tune your Good/Better/Best ladder",
    body: "Use the Scenario panel to set list prices, feature levels, and leakages. KPIs update instantly so you can narrate what changes.",
    targetId: "scenario",
    helper: "Each slider change is logged inside the Scenario Journal.",
  },
  {
    id: "import",
    title: "Import sales logs & estimate segments",
    body: "Click the Import Sales CSV button to upload historical choice logs and fit latent-class segments without leaving the browser.",
    targetId: "sales-import-trigger",
    helper: "Need a dataset? Download the sample CSV inside the modal.",
  },
  {
    id: "optimize",
    title: "Run the Global Optimizer",
    body: "Set your margin floors and run the optimizer to see a recomputed ladder plus a micro-explainer for why those prices make sense.",
    targetId: "global-optimizer",
    helper: "Pocket vs list margin plus charm-price toggles live here.",
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
  "compare-board",
  "share-links",
  "recent-short-links",
  "scenario-journal",
] as const;
const OPTIMIZE_TAB_SECTION_IDS = [
  "global-optimizer",
  "reference-prices",
  "current-vs-optimized",
  "methods",
] as const;

type SaveError = {
  error?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
};
function isSaveError(x: unknown): x is SaveError {
  return !!x && typeof x === "object";
}

function Section({
  title,
  id,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  id?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 md:scroll-mt-32 rounded-2xl shadow p-3 md:p-4 border border-gray-200 bg-white print-avoid print-card print-pad ${className}`}
    >
      <div className="mb-3 print:mb-2 flex flex-wrap items-start gap-3 md:items-center md:justify-between">
        <h2 className="font-semibold text-lg print:text-base print-tight">{title}</h2>
        {/* Hide the action toolbar on print */}
        {actions ? (
          <div className="no-print flex-1 min-w-60 md:min-w-0 flex flex-wrap justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 print-space">{children}</div>
    </section>
  );
}

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

// --- Segments: typed normalizer (no `any`) ---
type SegmentNested = {
  weight: number;
  beta: { price: number; featA: number; featB: number; refAnchor?: number };
};
type SegmentFlat = {
  weight: number;
  price: number;
  featA: number;
  featB: number;
  refAnchor?: number;
};
type SegmentNormalized = SegmentNested;

type ExplainDelta = {
  deltaProfit: number;
  deltaRevenue: number;
  deltaARPU: number;
  deltaActive: number;
  mainDriver: string;
  segmentLine: string;
  suggestion: string;
};

function toFinite(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

function isSegmentNested(s: unknown): s is SegmentNested {
  if (!s || typeof s !== "object") return false;
  const ss = s as Record<string, unknown>;
  const b = ss["beta"];
  if (!b || typeof b !== "object") return false;
  const bb = b as Record<string, unknown>;
  return (
    toFinite(ss["weight"]) !== null &&
    toFinite(bb["price"]) !== null &&
    toFinite(bb["featA"]) !== null &&
    toFinite(bb["featB"]) !== null
  );
}

function isSegmentFlat(s: unknown): s is SegmentFlat {
  if (!s || typeof s !== "object") return false;
  const ss = s as Record<string, unknown>;
  return (
    toFinite(ss["weight"]) !== null &&
    toFinite(ss["price"]) !== null &&
    toFinite(ss["featA"]) !== null &&
    toFinite(ss["featB"]) !== null
  );
}

function normalizeSegmentsForSave(segs: unknown): SegmentNormalized[] {
  if (!Array.isArray(segs)) return [];
  const out: SegmentNormalized[] = [];
  for (const s of segs) {
    if (isSegmentNested(s)) {
      const weight = toFinite(s.weight)!;
      const price = toFinite(s.beta.price)!;
      const featA = toFinite(s.beta.featA)!;
      const featB = toFinite(s.beta.featB)!;
      const refAnchor = toFinite(s.beta.refAnchor);
      out.push({
        weight,
        beta: {
          price,
          featA,
          featB,
          ...(refAnchor !== null ? { refAnchor } : {}),
        },
      });
    } else if (isSegmentFlat(s)) {
      const weight = toFinite(s.weight)!;
      const price = toFinite(s.price)!;
      const featA = toFinite(s.featA)!;
      const featB = toFinite(s.featB)!;
      const refAnchor = toFinite(s.refAnchor);
      out.push({
        weight,
        beta: {
          price,
          featA,
          featB,
          ...(refAnchor !== null ? { refAnchor } : {}),
        },
      });
    }
    // invalid rows are skipped
  }
  return out;
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

export default function App() {
  const [journal, setJournal] = useState<string[]>([]);
  const [showSalesImport, setShowSalesImport] = useState(false);
  const [leftColumnTab, setLeftColumnTab] = useState<
    "load" | "adjust" | "save" | "optimize"
  >("load");
  const [adjustSubTab, setAdjustSubTab] = useState<
    "sliders" | "segments" | "leakages"
  >("sliders");
  const [scenarioBaseline, setScenarioBaseline] = useStickyState<
    {
      snapshot: ReturnType<typeof buildScenarioSnapshot>;
      kpis: SnapshotKPIs;
      basis: { usePocketProfit: boolean; usePocketMargins: boolean };
      meta: BaselineMeta;
    } | null
  >("po:scenario-baseline-v2", null);

  // Baseline KPIs for the "Tell me what changed" panel (derived from scenarioBaseline for backward compatibility)
  const [baselineKPIs, setBaselineKPIs] = useState<SnapshotKPIs | null>(null);
  const [baselineMeta, setBaselineMeta] = useState<BaselineMeta | null>(null);
  const [scorecardView, setScorecardView] = useState<"current" | "optimized">("current");

  // --- Toasts ---
  type Toast = {
    id: number;
    kind: "error" | "success" | "info";
    msg: string;
    ttl?: number;
  };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (kind: Toast["kind"], msg: string, ttl = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, kind, msg, ttl }]);
  };

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
              : "border-slate-300 bg-white text-slate-800";
          return (
            <div
              key={t.id}
              className={`w-72 max-w-[90vw] rounded-md border shadow px-3 py-2 text-sm ${tone}`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {t.kind === "error"
                    ? "??"
                    : t.kind === "success"
                    ? "?"
                    : "??"}
                </div>
                <div className="flex-1">{t.msg}</div>
                <button
                  className="opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                  onClick={() =>
                    setToasts((ts) => ts.filter((x) => x.id !== t.id))
                  }
                >
                  ?
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
        // Respect native print with Ctrl/Cmd+P (don�t intercept)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") return;

        const idx = Number(e.key) - 1; // '1' -> 0
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
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[90vw]">
              {GROUPS.map((g, i) => (
                <div
                  key={g.chartId}
                  className="flex items-center gap-1 border rounded-md px-1 py-0.5"
                  aria-label={g.aria}
                  title={`${g.label} � Alt+${i + 1} (PNG), Shift+Alt+${i + 1} (CSV)`}
                >
                  {/* Chip label scrolls to the section */}
                  <button
                    type="button"
                    className="px-1 text-[11px] text-slate-700 hover:underline"
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

  // Apply a scenario preset: sets prices, costs, refPrices, and leak
  // NOTE: Preset type is from src/lib/presets
  const applyScenarioPreset = useCallback((p: Preset) => {
    setPrices(p.prices);
    setCosts(p.costs);
    setRefPrices(p.refPrices);
    setLeak(p.leak);
    setChannelBlendApplied(false);
    setScenarioPresetId(p.id);
    pushJ(`Loaded preset: ${p.name}`);
  }, [setPrices, setCosts, setRefPrices, setLeak, pushJ]);

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
  const defaults = {
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
  };
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
  type RecentItem = { id: string; t: number };
  const RECENT_KEY = "po_recent_ids_v1";
  const readRecents = (): RecentItem[] => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      return [];
    }
  };
  const writeRecents = (arr: RecentItem[]) => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 5)));
  };
  const rememberId = (id: string) => {
    const now = Date.now();
    const seen = readRecents().filter((r) => r.id !== id);
    writeRecents([{ id, t: now }, ...seen]);
  };
  const [compareUseSavedSegments, setCompareUseSavedSegments] = useState(true);
  const [compareUseSavedLeak, setCompareUseSavedLeak] = useState(true);
  const [compareUseSavedRefs, setCompareUseSavedRefs] = useState(true);

  type SlotId = "A" | "B" | "C";
  const SLOT_KEYS: Record<SlotId, string> = {
    A: "po_compare_A_v1",
    B: "po_compare_B_v1",
    C: "po_compare_C_v1",
  };

  function readSlot(id: SlotId): ReturnType<typeof buildScenarioSnapshot> | null {
    try {
      const raw = localStorage.getItem(SLOT_KEYS[id]);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return isScenarioImport(obj) ? obj : null;
    } catch {
      return null;
    }
  }
  function writeSlot(id: SlotId, data: ReturnType<typeof buildScenarioSnapshot>) {
    localStorage.setItem(SLOT_KEYS[id], JSON.stringify(data));
  }
  function clearSlot(id: SlotId) {
    localStorage.removeItem(SLOT_KEYS[id]);
  }


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
        const res = await fetch(`/api/get?s=${encodeURIComponent(sid)}`);
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
              kpiFloorAdj?: number;
              priceRange?: TierRangeMap;
              priceRangeSource?: PriceRangeSource;
              optRanges?: typeof optRanges;
              optConstraints?: typeof optConstraints;
            };
          };
        };
        setPrices(scenario.prices);
        setCosts(scenario.costs);
        setFeatures(scenario.features);
        if (scenario.refPrices) setRefPrices(scenario.refPrices);
        if (scenario.leak) setLeak(scenario.leak);
        if (scenario.segments) setSegments(scenario.segments);
        if (scenario.channelMix) {
          setChannelMix(scenario.channelMix);
          setChannelBlendApplied(true);
        }
        if (scenario.channelMix) setChannelMix(scenario.channelMix);

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
  const [optConstraints, setOptConstraints] = useStickyState("po:constraints", {
    gapGB: 2,
    gapBB: 3,
    marginFloor: { good: 0.25, better: 0.25, best: 0.25 },
    charm: false,
    usePocketMargins: false,
    usePocketProfit: false,
  });

  // Demand scale for demo math
  const N = 1000;

  // Result of last run
  const [optimizerKind, setOptimizerKind] = useState<OptimizerKind>("grid-worker");
  const [optResult, setOptResult] = useState<{
    prices: { good: number; better: number; best: number };
    profit: number;
    kpis: SnapshotKPIs;
    diagnostics?: GridDiagnostics;
  } | null>(null);
  const [lastOptAt, setLastOptAt] = useState<number | null>(null);

  const computeScenarioProfit = useCallback(
    (ladder: Prices, usePocket: boolean) => {
      const probs = choiceShares(ladder, features, segments, refPrices);
      const qty = {
        good: Math.round(N * probs.good),
        better: Math.round(N * probs.better),
        best: Math.round(N * probs.best),
      };

      if (!usePocket) {
        return (
          qty.good * (ladder.good - costs.good) +
          qty.better * (ladder.better - costs.better) +
          qty.best * (ladder.best - costs.best)
        );
      }

      const pocketGood = computePocketPrice(ladder.good, "good", leak).pocket;
      const pocketBetter = computePocketPrice(ladder.better, "better", leak).pocket;
      const pocketBest = computePocketPrice(ladder.best, "best", leak).pocket;

      return (
        qty.good * (pocketGood - costs.good) +
        qty.better * (pocketBetter - costs.better) +
        qty.best * (pocketBest - costs.best)
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
    setIsOptRunning(true);
    setOptError(null);
    const runId = ++runIdRef.current;

    const { promise, cancel } = runOptimizeInWorker({
      runId,
      ranges: optRanges,
      costs,
      feats: features,
      segs: segments,
      refPrices,
      N,
      C: optConstraints,
      leak,
    });
    cancelRef.current = cancel;

    promise
      .then((out) => {
        // ignore if a newer run started
        if (runIdRef.current !== runId) return;
        setLastOptAt(Date.now());
        const resultKPIs = kpisFromSnapshot(
          { prices: out.prices, costs, features, segments, refPrices, leak },
          N,
          !!optConstraints.usePocketProfit,
          optConstraints.usePocketMargins ?? !!optConstraints.usePocketProfit
        );
        setOptResult({ prices: out.prices, profit: out.profit, kpis: resultKPIs, diagnostics: out.diagnostics });
        pushJ(
          `[${now()}] Optimizer best ladder $${out.prices.good}/$${out.prices.better}/$${out.prices.best} (profit $${Math.round(out.profit)})`
        );
        toast("success", "Optimizer finished");
        toast("info", "Optimizer done. Pin as baseline for clean deltas.");
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

  const [kpiFloorAdj, setKpiFloorAdj] = useState(0); // -10..+10 (pp)
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

  const lastAppliedPricesRef = useRef<{
    good: number;
    better: number;
    best: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  const [waterTier, setWaterTier] = useState<Tier>("good");

  const listForWater =
    waterTier === "good"
      ? prices.good
      : waterTier === "better"
      ? prices.better
      : prices.best;
  const water = useMemo(
    () => computePocketPrice(listForWater, waterTier, leak),
    [listForWater, waterTier, leak]
  );

  // which preset is currently selected in the dropdown (for UI only)
  const [presetSel, setPresetSel] = useState<string>("");

  function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }

  // Weighted blend of leakage presets (percent terms weighted linearly; fixed fee weighted avg)
  function blendLeaks(rows: { w: number; preset: string }[]): Leakages {
    // guard
    const safeRows = rows.filter((r) => LEAK_PRESETS[r.preset] && r.w > 0);
    if (safeRows.length === 0)
      return LEAK_PRESETS[Object.keys(LEAK_PRESETS)[0]];

    // start with a deep copy of the first preset
    const init = JSON.parse(
      JSON.stringify(LEAK_PRESETS[safeRows[0].preset])
    ) as Leakages;
    const acc = init;
    let total = safeRows[0].w;

    for (let i = 1; i < safeRows.length; i++) {
      const { w, preset } = safeRows[i];
      const L = LEAK_PRESETS[preset];
      total += w;
      (["promo", "volume"] as const).forEach((k) => {
        (["good", "better", "best"] as const).forEach((t) => {
          acc[k][t] = acc[k][t] * ((total - w) / total) + L[k][t] * (w / total);
        });
      });
      acc.paymentPct =
        acc.paymentPct * ((total - w) / total) + L.paymentPct * (w / total);
      acc.paymentFixed =
        acc.paymentFixed * ((total - w) / total) + L.paymentFixed * (w / total);
      acc.fxPct = acc.fxPct * ((total - w) / total) + L.fxPct * (w / total);
      acc.refundsPct =
        acc.refundsPct * ((total - w) / total) + L.refundsPct * (w / total);
    }
    return acc;
  }

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

  // Profit frontier: sweep Best price; keep Good/Better fixed (latent-class mix)
  const frontier = useMemo(() => {
    const points: { bestPrice: number; profit: number }[] = [];
    const feasible: { bestPrice: number; profit: number }[] = [];
    const infeasible: { bestPrice: number; profit: number }[] = [];
    const usePocketProfit = !!optConstraints.usePocketProfit;
    const usePocketMargins = !!(optConstraints.usePocketMargins ?? optConstraints.usePocketProfit);
    const floors = optConstraints.marginFloor;
    for (let p = 5; p <= 60; p += 1) {
      const pricesP = { good: prices.good, better: prices.better, best: p };
      const probsP = choiceShares(pricesP, features, segments, refPrices);
      const take_good = Math.round(N * probsP.good);
      const take_better = Math.round(N * probsP.better);
      const take_best = Math.round(N * probsP.best);
      const effGoodProfit = usePocketProfit
        ? computePocketPrice(prices.good, "good", leak).pocket
        : prices.good;
      const effBetterProfit = usePocketProfit
        ? computePocketPrice(prices.better, "better", leak).pocket
        : prices.better;
      const effBestProfit = usePocketProfit
        ? computePocketPrice(p, "best", leak).pocket
        : p;
      const profitP =
        take_good * (effGoodProfit - costs.good) +
        take_better * (effBetterProfit - costs.better) +
        take_best * (effBestProfit - costs.best);
      points.push({ bestPrice: p, profit: profitP });

      // Feasibility based on margin floors
      const effGoodFloor = usePocketMargins ? computePocketPrice(prices.good, "good", leak).pocket : prices.good;
      const effBetterFloor = usePocketMargins ? computePocketPrice(prices.better, "better", leak).pocket : prices.better;
      const effBestFloor = usePocketMargins ? computePocketPrice(p, "best", leak).pocket : p;
      const mG = (effGoodFloor - costs.good) / Math.max(effGoodFloor, 1e-6);
      const mB = (effBetterFloor - costs.better) / Math.max(effBetterFloor, 1e-6);
      const mH = (effBestFloor - costs.best) / Math.max(effBestFloor, 1e-6);
      const ok = mG >= floors.good && mB >= floors.better && mH >= floors.best;
      (ok ? feasible : infeasible).push({ bestPrice: p, profit: profitP });
    }
    if (points.length === 0)
      return {
        points,
        feasiblePoints: feasible,
        infeasiblePoints: infeasible,
        optimum: null as { bestPrice: number; profit: number } | null,
      };
    const optimum = points.reduce(
      (a, b) => (b.profit > a.profit ? b : a),
      points[0]
    );
    return { points, feasiblePoints: feasible, infeasiblePoints: infeasible, optimum };
  }, [
    N,
    prices.good,
    prices.better,
    costs.good,
    costs.better,
    costs.best,
    features,
    segments,
    refPrices,
    leak,
    optConstraints.usePocketProfit,
    optConstraints.usePocketMargins,
    optConstraints.marginFloor,
  ]);


  // Expected profit (current slider scenario)
  const take = {
    none: Math.round(N * probs.none),
    good: Math.round(N * probs.good),
    better: Math.round(N * probs.better),
    best: Math.round(N * probs.best),
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
    () => {
      if (!optResult) return null;
      return optResult.kpis;
    },
    [optResult]
  );

  const buildExplainDelta = useCallback(
    (target: SnapshotKPIs | null): ExplainDelta | null => {
      if (!baselineKPIs || !segments.length || !target) return null;

      const deltaProfit = target.profit - baselineKPIs.profit;
      const deltaRevenue = target.revenue - baselineKPIs.revenue;

      const currentActive = N * (1 - target.shares.none);
      const baselineActive = N * (1 - baselineKPIs.shares.none);
      const deltaActive = currentActive - baselineActive;

      const deltaARPU = target.arpuActive - baselineKPIs.arpuActive;

      // --- Main driver by tier (Good / Better / Best) ---
      const tiers: Array<"good" | "better" | "best"> = ["good", "better", "best"];
      const perTier = tiers.map((tier) => {
        const shareBase = baselineKPIs.shares[tier];
        const shareCur = target.shares[tier];
        const qBase = N * shareBase;
        const qCur = N * shareCur;

        // Approximate unit margin from baseline list prices
        const marginBase = baselineKPIs.prices[tier] - costs[tier];

        const mixEffect = (qCur - qBase) * marginBase;
        const priceEffect =
          qBase * (target.prices[tier] - baselineKPIs.prices[tier]);
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
    [baselineKPIs, costs, N, segments]
  );

  const explainDeltaCurrent = useMemo(
    () => buildExplainDelta(currentKPIs),
    [buildExplainDelta, currentKPIs]
  );
  const explainDeltaOptimized = useMemo(
    () => buildExplainDelta(optimizedKPIs),
    [buildExplainDelta, optimizedKPIs]
  );

  const scorecardKPIs =
    scorecardView === "optimized" && optimizedKPIs
      ? optimizedKPIs
      : currentKPIs;
  const scorecardExplainDelta =
    scorecardView === "optimized" && optimizedKPIs
      ? explainDeltaOptimized
      : explainDeltaCurrent;

  const baselineActiveCustomers =
    baselineKPIs ? Math.round(N * (1 - baselineKPIs.shares.none)) : null;
  const scorecardActiveFromShares = Math.round(
    N * (1 - scorecardKPIs.shares.none)
  );
  const marginDeltaPP =
    baselineKPIs != null
      ? scorecardKPIs.grossMarginPct - baselineKPIs.grossMarginPct
      : null;
  const scorecardMarginRatio = scorecardKPIs.grossMarginPct / 100;
  const baselineMarginRatio =
    baselineKPIs != null ? baselineKPIs.grossMarginPct / 100 : null;

  useEffect(() => {
    if (scorecardView === "optimized" && !optimizedKPIs) {
      setScorecardView("current");
    }
  }, [scorecardView, optimizedKPIs]);

  // ---- Tornado sensitivity data ----
  // ---- Tornado sensitivity data ----
  const [tornadoPocket, setTornadoPocket] = useState(true);
  const [tornadoView, setTornadoView] = useState<"current" | "optimized">("current");
  const [tornadoPriceBump, setTornadoPriceBump] = useState(10); // percent span for symmetric mode
  const [tornadoRangeMode, setTornadoRangeMode] = useState<"symmetric" | "data">("symmetric");
  const [tornadoPctBump, setTornadoPctBump] = useState(2); // pp

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

  const robustnessResults = useMemo(
    () =>
      optResult
        ? runRobustnessScenarios({
            scenarios: ROBUST_SCENARIOS,
            baseRanges: optRanges,
            baseConstraints: optConstraints,
            baseSegments: segments,
            baseFeatures: features,
            baseRefPrices: refPrices,
            baseCosts: costs,
            baseLeak: leak,
            N,
            baseLadder: optResult.prices,
          })
        : [],
    [optResult, optRanges, optConstraints, segments, features, refPrices, costs, leak, N]
  );
  useEffect(() => {
    if (!optResult?.prices && !quickOpt.best && tornadoView === "optimized") {
      setTornadoView("current");
    }
  }, [optResult?.prices, quickOpt.best, tornadoView]);

  const optimizerProfitDelta = useMemo(() => {
    if (!optResult) return null;
    const usePocket = !!optConstraints.usePocketProfit;
    const baseProfit = computeScenarioProfit(prices, usePocket);
    return { delta: optResult.profit - baseProfit, base: baseProfit };
  }, [optResult, optConstraints.usePocketProfit, prices, computeScenarioProfit]);
  const optimizerWhyLines = useMemo(() => {
    if (!optResult) return [];
    const stale =
      prices.good !== optResult.prices.good ||
      prices.better !== optResult.prices.better ||
      prices.best !== optResult.prices.best;
    return explainOptimizerResult({
      basePrices: prices,
      optimizedPrices: optResult.prices,
      costs,
      leak,
      constraints: {
        gapGB: optConstraints.gapGB,
        gapBB: optConstraints.gapBB,
        marginFloor: optConstraints.marginFloor,
        usePocketMargins: optConstraints.usePocketMargins,
        usePocketProfit: optConstraints.usePocketProfit,
      },
      profitDelta: optimizerProfitDelta?.delta ?? 0,
    }).concat(
      stale ? ["Optimizer run is based on an earlier ladder; rerun to refresh with current state."] : []
  );
  }, [optResult, prices, costs, leak, optConstraints, optimizerProfitDelta]);

  // ---- Tornado data (current & optimized) ----
  const tornadoRowsCurrent = useMemo(() => {
    const bumps = computePriceBumps(prices);
    const avgSpan = avgFromBumps(bumps);
    return tornadoProfit(
      { N, prices, costs, features, segments, refPrices, leak },
      {
        usePocket: tornadoPocket,
        priceBump: avgSpan,
        priceBumps: bumps,
        pctSmall: tornadoPctBump / 100,
        payPct: tornadoPctBump / 200,
      }
    ).map((r) => ({
      name: r.name,
      base: r.base,
      deltaLow: r.deltaLow,
      deltaHigh: r.deltaHigh,
    }));
  }, [
    N,
    prices,
    costs,
    features,
    segments,
    refPrices,
    leak,
    tornadoPocket,
    tornadoPctBump,
    computePriceBumps,
    avgFromBumps,
  ]);

  const tornadoRowsOptim = useMemo(() => {
    const bestLadder = optResult?.prices ?? quickOpt.best;
    if (!bestLadder) return [];
    const p = bestLadder;
    const bumps = computePriceBumps(p);
    const avgSpan = avgFromBumps(bumps);
    return tornadoProfit(
      { N, prices: p, costs, features, segments, refPrices, leak },
      {
        usePocket: tornadoPocket,
        priceBump: avgSpan,
        priceBumps: bumps,
        pctSmall: tornadoPctBump / 100,
        payPct: tornadoPctBump / 200,
      }
    ).map((r) => ({
      name: r.name,
      base: r.base,
      deltaLow: r.deltaLow,
      deltaHigh: r.deltaHigh,
    }));
  }, [
    optResult,
    quickOpt.best,
    N,
    costs,
    features,
    segments,
    refPrices,
    leak,
    tornadoPocket,
    tornadoPctBump,
    computePriceBumps,
    avgFromBumps,
  ]);

  const hasOptimizedTornado = Boolean(optResult?.prices ?? quickOpt.best);
  const activeTornadoRows =
    tornadoView === "optimized" && hasOptimizedTornado
      ? tornadoRowsOptim
      : tornadoRowsCurrent;
  const tornadoViewLabel =
    tornadoView === "optimized" && hasOptimizedTornado ? "Optimized" : "Current";

  // Cohort retention (percent, per-month). Default 92%.
  const [retentionPct, setRetentionPct] = useState<number>(() => {
    const saved = localStorage.getItem("cohort_retention_pct");
    const v = saved ? Number(saved) : 92;
    return Number.isFinite(v) ? Math.min(99.9, Math.max(70, v)) : 92;
  });
  useEffect(() => {
    localStorage.setItem("cohort_retention_pct", String(retentionPct));
  }, [retentionPct]);

  // --- UI adapter: nested -> your UI's flattened segment shape ---
  function mapNormalizedToUI(norm: SegmentNested[]): typeof segments {
    const ui = norm.map((s) => ({
      name: "" as string,
      weight: s.weight,
      betaPrice: s.beta.price,
      betaFeatA: s.beta.featA,
      betaFeatB: s.beta.featB,
      ...(s.beta.refAnchor !== undefined
        ? { betaRefAnchor: s.beta.refAnchor }
        : {}),
    }));
    return ui as unknown as typeof segments;
  }

  // --- JSON snapshot (portable) ---
  const buildScenarioSnapshot = useCallback((args: {
    prices: typeof prices;
    costs: typeof costs;
    features: typeof features;
    refPrices: typeof refPrices;
    leak: typeof leak;
    segments: typeof segments;
    tornadoPocket: boolean;
    tornadoPriceBump: number;
    tornadoPctBump: number;
    tornadoRangeMode: "symmetric" | "data";
    retentionPct: number;
    kpiFloorAdj: number;
    priceRange: PriceRangeState | null;
    optRanges: typeof optRanges;
    optConstraints: typeof optConstraints;
    channelMix?: typeof channelMix;
    optimizerKind?: OptimizerKind;
  }) => {
    const segs = normalizeSegmentsForSave(args.segments);
    return {
      prices: args.prices,
      costs: args.costs,
      features: args.features,
      refPrices: args.refPrices,
      leak: args.leak,
      ...(segs.length ? { segments: segs } : {}),
      analysis: {
        tornadoPocket: args.tornadoPocket,
        tornadoPriceBump: args.tornadoPriceBump,
        tornadoPctBump: args.tornadoPctBump,
        tornadoRangeMode: args.tornadoRangeMode,
        retentionPct: args.retentionPct,
        kpiFloorAdj: args.kpiFloorAdj,
        optRanges: args.optRanges,
        optConstraints: args.optConstraints,
        optimizerKind: args.optimizerKind ?? "grid-worker",
        ...(args.priceRange
          ? {
              priceRange: args.priceRange.map,
              priceRangeSource: args.priceRange.source,
            }
          : {}),
      },
      ...(args.channelMix ? { channelMix: args.channelMix } : {}),
    };
  }, []);

  // --- Import guard for JSON ---
  type ScenarioImport = ReturnType<typeof buildScenarioSnapshot>;
  function isScenarioImport(x: unknown): x is ScenarioImport {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.prices === "object" &&
      typeof o.costs === "object"
    );
  }

  // Apply a (partial) scenario object into state
  function applyScenarioPartial(obj: {
    prices?: typeof prices;
    costs?: typeof costs;
    refPrices?: typeof refPrices;
    leak?: typeof leak;
    segments?: typeof segments | Array<{ weight:number; beta:{price:number; featA:number; featB:number; refAnchor?:number} }>;
  }) {
    if (obj.prices) setPrices(obj.prices);
    if (obj.costs) setCosts(obj.costs);
    if (obj.refPrices) setRefPrices(obj.refPrices);
    if (obj.leak) setLeak(obj.leak);

    // Accept both your UI-shape segments and the nested CSV shape
    if (obj.segments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anySegs = obj.segments as any[];
      const looksNested = anySegs.length && anySegs[0]?.beta && typeof anySegs[0].beta === "object";
      if (looksNested) {
        const mapped = anySegs.map(s => ({
          name: "",
          weight: Number(s.weight) || 0,
          betaPrice: Number(s.beta.price) || 0,
          betaFeatA: Number(s.beta.featA) || 0,
          betaFeatB: Number(s.beta.featB) || 0,
          ...(s.beta.refAnchor !== undefined ? { betaRefAnchor: Number(s.beta.refAnchor) } : {}),
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSegments(normalizeWeights(mapped as any));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSegments(normalizeWeights(obj.segments as any));
      }
    }
  }

  // Initialize baseline once on first render (after helpers are defined)
  useEffect(() => {
    if (scenarioBaseline && scenarioBaseline.kpis && !baselineKPIs) {
      setBaselineKPIs(scenarioBaseline.kpis);
      setBaselineMeta(scenarioBaseline.meta);
      return;
    }
    if (!baselineKPIs && currentKPIs) {
      const meta = { label: "Pinned on load", savedAt: Date.now() };
      const snap = buildScenarioSnapshot({
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
        retentionPct,
      kpiFloorAdj,
      priceRange: priceRangeState,
      optRanges,
      optConstraints,
      channelMix,
      optimizerKind,
    });
      setBaselineKPIs(currentKPIs);
      setBaselineMeta(meta);
      setScenarioBaseline({
        snapshot: snap,
        kpis: currentKPIs,
        basis: {
          usePocketProfit: !!optConstraints.usePocketProfit,
          usePocketMargins: !!optConstraints.usePocketMargins,
        },
        meta,
      });
    }
  }, [baselineKPIs, currentKPIs, scenarioBaseline, buildScenarioSnapshot, prices, costs, features, refPrices, leak, segments, tornadoPocket, tornadoPriceBump, tornadoPctBump, tornadoRangeMode, retentionPct, kpiFloorAdj, priceRangeState, optRanges, optConstraints, channelMix, setScenarioBaseline, optimizerKind]);


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
          sc.analysis.tornadoRangeMode === "symmetric" ||
          sc.analysis.tornadoRangeMode === "data"
        ) {
          setTornadoRangeMode(sc.analysis.tornadoRangeMode);
        }
        if (typeof sc.analysis.retentionPct === "number")
          setRetentionPct(sc.analysis.retentionPct);
        if (typeof sc.analysis.kpiFloorAdj === "number")
          setKpiFloorAdj(sc.analysis.kpiFloorAdj);
        if (sc.analysis.optRanges) setOptRanges(sc.analysis.optRanges);
        if (sc.analysis.optConstraints) setOptConstraints(sc.analysis.optConstraints);
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
      if (sc.channelMix) {
        setChannelMix(sc.channelMix as typeof channelMix);
        setChannelBlendApplied(true);
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
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast?.("success", "URL copied to clipboard");
    } catch {
      toast?.("error", "Copy failed - select and copy the address bar");
    }
  }

  function handleCopyLongUrl() {
    const q = new URLSearchParams({
      p: [prices.good, prices.better, prices.best].join(","),
      c: [costs.good, costs.better, costs.best].join(","),
      fa: [
        features.featA.good,
        features.featA.better,
        features.featA.best,
      ].join(","),
      fb: [
        features.featB.good,
        features.featB.better,
        features.featB.best,
      ].join(","),
    });
    const longUrl = `${location.origin}${location.pathname}?${q.toString()}`;
    navigator.clipboard.writeText(longUrl).catch(() => {});
    pushJ(`[${now()}] Copied long URL state`);
  }

  function handleExportJson() {
    const snap = buildScenarioSnapshot({
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
      retentionPct,
      kpiFloorAdj,
      priceRange: priceRangeState,
      optRanges,
      optConstraints,
      channelMix,
      optimizerKind,
    });
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricing_scenario.json";
    a.click();
    URL.revokeObjectURL(url);
    pushJ?.(`[${now()}] Exported scenario JSON`);
  }

  function handleExportCsv() {
    const header = csvTemplate().split(/\r?\n/)[0]?.split(",") ?? [];
    const setValue = (
      row: string[],
      key: string,
      value: string | number | null | undefined
    ) => {
      const idx = header.findIndex(
        (h) => h.toLowerCase() === key.toLowerCase()
      );
      if (idx >= 0) {
        row[idx] = value === undefined || value === null ? "" : String(value);
      }
    };
    const makeRow = (
      seg:
        | {
            name?: string;
            weight: number;
            beta: {
              price: number;
              featA: number;
              featB: number;
              refAnchor?: number;
            };
          }
        | null,
      includeGlobals: boolean
    ) => {
      const row = Array(header.length).fill("");
      if (includeGlobals) {
        setValue(row, "prices.good", prices.good);
        setValue(row, "prices.better", prices.better);
        setValue(row, "prices.best", prices.best);
        setValue(row, "costs.good", costs.good);
        setValue(row, "costs.better", costs.better);
        setValue(row, "costs.best", costs.best);
        setValue(row, "ref.good", refPrices.good);
        setValue(row, "ref.better", refPrices.better);
        setValue(row, "ref.best", refPrices.best);
        setValue(row, "promo.good", leak.promo.good);
        setValue(row, "promo.better", leak.promo.better);
        setValue(row, "promo.best", leak.promo.best);
        setValue(row, "volume.good", leak.volume.good);
        setValue(row, "volume.better", leak.volume.better);
        setValue(row, "volume.best", leak.volume.best);
        setValue(row, "leak.paymentPct", leak.paymentPct);
        setValue(row, "leak.paymentFixed", leak.paymentFixed);
        setValue(row, "leak.fxPct", leak.fxPct);
        setValue(row, "leak.refundsPct", leak.refundsPct);
      }
      if (seg) {
        setValue(row, "name", seg.name ?? "");
        setValue(row, "weight", seg.weight);
        setValue(row, "beta.price", seg.beta.price);
        setValue(row, "beta.featA", seg.beta.featA);
        setValue(row, "beta.featB", seg.beta.featB);
        setValue(row, "beta.refAnchor", seg.beta.refAnchor);
      }
      return row.join(",");
    };

    const segRows = segments.map((seg) => ({
      name: seg.name,
      weight: seg.weight,
      beta: {
        price: seg.betaPrice,
        featA: seg.betaFeatA,
        featB: seg.betaFeatB,
        ...(seg.betaRefAnchor !== undefined
          ? { refAnchor: seg.betaRefAnchor }
          : {}),
      },
    }));

    const lines: string[] = [];
    if (segRows.length) {
      segRows.forEach((seg, idx) => {
        lines.push(makeRow(seg, idx === 0));
      });
    } else {
      lines.push(makeRow(null, true));
    }
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricing_scenario.csv";
    a.click();
    URL.revokeObjectURL(url);
    pushJ?.(`[${now()}] Exported scenario CSV`);
  }

  async function saveScenarioShortLink() {
    try {
      // 1) Cheap warmup - if it fails, we continue anyway
      const ok = await preflight("/api/get?s=ping");
      if (!ok) {
        pushJ(`[${now()}] Preflight failed (continuing to save)`);
      }

      // 2) Build EXACT payload your /api/save expects (matches zod in save.ts)
      const payload = buildScenarioSnapshot({
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
        retentionPct,
        kpiFloorAdj,
        priceRange: priceRangeState,
        optRanges,
        optConstraints,
        channelMix,
        optimizerKind,
      });

      // 3) POST with retries/backoff for 5xx/429 + per-request timeout
      const res = await fetchWithRetry(
        "/api/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        { attempts: 3, baseDelayMs: 300, timeoutMs: 5000, jitter: true }
      );

      // 4) Handle server responses
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        const url = new URL(window.location.href);
        url.searchParams.set("s", id);
        window.history.replaceState({}, "", url.toString());
        rememberId(id);
        pushJ(`[${now()}] Saved scenario ${id}`);
        toast("success", `Saved: ${id}`);
        return;
      }

      // Show 4xx reasons (validation, etc.)
      if (res.status >= 400 && res.status < 500) {
        let detail = `HTTP ${res.status}`;
        try {
          const bodyUnknown: unknown = await res.json();
          if (isSaveError(bodyUnknown)) {
            if (bodyUnknown.error) detail += ` - ${bodyUnknown.error}`;
            if (Array.isArray(bodyUnknown.issues) && bodyUnknown.issues.length) {
              const i0 = bodyUnknown.issues[0];
              const at = i0?.path ? ` at ${i0.path.join(".")}` : "";
              detail += `${at}: ${i0?.message ?? ""}`;
            }
          }
        } catch { /* ignore parse errors */ }
        pushJ(`[${now()}] Save failed: ${detail}`);
        toast("error", `Save failed: ${detail}`);
        return;
      }

      // Rare: non-ok after retries
      pushJ(`[${now()}] Save failed: HTTP ${res.status}`);
      toast("error", `Save failed: HTTP ${res.status}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushJ(`[${now()}] Save failed: ${msg}`);
      toast("error", `Save failed: ${msg}`);
    }
  }

  function saveToSlot(id: SlotId) {
    const snap = buildScenarioSnapshot({
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
      retentionPct,
      kpiFloorAdj,
      priceRange: priceRangeState,
      optRanges,
      optConstraints,
      channelMix,
      optimizerKind,
    });
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
      setSegments(
        mapNormalizedToUI(normalizeSegmentsForSave(sc.segments))
      );
    if (sc.channelMix) setChannelMix(sc.channelMix as typeof channelMix);
    if (sc.analysis) {
      if (typeof sc.analysis.tornadoPocket === "boolean")
        setTornadoPocket(sc.analysis.tornadoPocket);
      if (typeof sc.analysis.tornadoPriceBump === "number")
        setTornadoPriceBump(sc.analysis.tornadoPriceBump);
      if (typeof sc.analysis.tornadoPctBump === "number")
        setTornadoPctBump(sc.analysis.tornadoPctBump);
      if (sc.analysis.optRanges) setOptRanges(sc.analysis.optRanges);
      if (sc.analysis.optConstraints) setOptConstraints(sc.analysis.optConstraints);
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

  const renderDeltaBadge = (
    delta: number | null | undefined,
    formatter: (n: number) => string,
    suffix = "",
    pct: number | null | undefined = null
  ) => {
    if (delta === null || delta === undefined || !Number.isFinite(delta)) {
      return <span className="text-[11px] text-slate-400">Pin a baseline</span>;
    }
    const positive = delta >= 0;
    const pctText =
      pct !== null && pct !== undefined && Number.isFinite(pct)
        ? ` (${pct >= 0 ? "+" : "-"}${Math.abs(pct as number).toFixed(1)}%)`
        : "";
    return (
      <span
        className={
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
          (positive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700")
        }
      >
        <span>{positive ? "+" : "-"}</span>
        <span>
          {formatter(Math.abs(delta))}
          {pctText}
          {suffix} vs baseline
        </span>
      </span>
    );
  };

  const buildGuardrailSummary = useCallback(
    (activePrices: Prices) => {
      const gapNotes = explainGaps(activePrices, {
        gapGB: optConstraints.gapGB,
        gapBB: optConstraints.gapBB,
      });
      const gapLine = gapNotes.length
        ? gapNotes[0]
        : `Gaps slack: ${(activePrices.better - activePrices.good - optConstraints.gapGB).toFixed(2)} / ${(activePrices.best - activePrices.better - optConstraints.gapBB).toFixed(2)} (G/B, B/Best)`;
      const floorLine = `Floors: Good ${Math.round(optConstraints.marginFloor.good * 100)}% | Better ${Math.round(
        optConstraints.marginFloor.better * 100
      )}% | Best ${Math.round(optConstraints.marginFloor.best * 100)}%`;
      const optimizerReady = Boolean(optResult?.prices);
      const optimizerLine = optimizerReady
        ? `Optimizer ready - ranges ${optRanges.good[0]}-${optRanges.good[1]} / ${optRanges.better[0]}-${optRanges.better[1]} / ${optRanges.best[0]}-${optRanges.best[1]}`
        : "Set ranges and floors, then run the optimizer";
      return { gapLine, floorLine, optimizerLine };
    },
    [optConstraints, optRanges, optResult]
  );

  const guardrailsForCurrent = useMemo(
    () => buildGuardrailSummary(prices),
    [buildGuardrailSummary, prices]
  );
  const guardrailsForOptimized = useMemo(
    () => buildGuardrailSummary(optResult?.prices ?? prices),
    [buildGuardrailSummary, optResult, prices]
  );

  const scorecardBaselineText = formatBaselineLabel(baselineMeta);
  const scorecardPinnedBasis = scenarioBaseline?.basis
    ? scenarioBaseline.basis.usePocketProfit
      ? "Pocket (after leakages)"
      : "List (before leakages)"
    : "Not pinned yet";
  const scorecardActiveBasis = optConstraints.usePocketProfit
    ? "Pocket profit (after leakages)"
    : "List profit (before leakages)";

  const pinBaselineNow = () => {
    const kpis = scorecardKPIs;
    const meta = { label: "Pinned now", savedAt: Date.now() };
    if (kpis) {
      setBaselineKPIs(kpis);
      setBaselineMeta(meta);
      setScenarioBaseline({
        snapshot: buildScenarioSnapshot({
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
          retentionPct,
          kpiFloorAdj,
          priceRange: priceRangeState,
          optRanges,
          optConstraints,
          channelMix,
          optimizerKind,
        }),
        kpis,
        basis: {
          usePocketProfit: !!optConstraints.usePocketProfit,
          usePocketMargins: !!optConstraints.usePocketMargins,
        },
        meta,
      });
      toast("success", "Baseline pinned");
    } else {
      toast("error", "Baseline not pinned: KPIs unavailable");
    }
  };


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
                Save Scenario
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
                          Presets set prices/costs/reference prices and leakages; features and optimizer constraints stay as-is so you can mix/match.
                        </div>
                        <div className="text-[11px] text-slate-600 mb-1">
                          Tip: after applying a preset, set refs from current or import JSON/CSV to layer on constraints.
                        </div>
                        <PresetPicker
                          presets={PRESETS}
                          activeId={scenarioPresetId}
                          onApply={applyScenarioPreset}
                          infoId="presets.scenario"
                        className="mt-1"
                      />
                    </Section>
              <Section id="scenario-imports" title="Import & health checks">
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  <label className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 cursor-pointer">
                    Import Scenario Parameters JSON
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={handleImportJson}
                    />
                  </label>
                  <InfoTip id="import.resetAll" ariaLabel="Reset all settings to defaults" />
                  <InfoTip id="import.clearAll" ariaLabel="Clear all settings to blank" />
                  <button
                    className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                    onClick={resetAllSettings}
                    title="Reset all fields to sensible defaults"
                  >
                    Reset all settings to defaults
                  </button>
                  <button
                    className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                    onClick={clearAllSettings}
                    title="Clear all fields (set to zero/blank)"
                  >
                    Clear all settings
                  </button>

                  <DataImport
                    onPaste={(obj) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      applyScenarioPartial(obj as any);
                      pushJ?.(`[${now()}] Imported scenario CSV`);
                      toast("success", "Scenario CSV applied");
                    }}
                    onToast={(kind, msg) => toast(kind, msg)}
                  />

                  <button
                    id="sales-import-trigger"
                    className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                    onClick={() => setShowSalesImport(true)}
                    title="Upload sales logs CSV and estimate latent-class segments"
                  >
                    Import Sales Data CSV (estimate)
                  </button>

                  <button
                    className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                    onClick={handleTestBackend}
                    aria-label="Test backend connectivity"
                    title="Quick health check (HEAD /api/get?s=ping)"
                  >
                    Test backend
                  </button>
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
                      The estimator runs in a Web Worker and won�t block the UI. Your CSV never leaves the browser.
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
                    toast("info", "Segments updated. Pin a new baseline for meaningful deltas.");
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
          <Section
                      id="pocket-price-waterfall"
                      title={
                        <span className="inline-flex items-center gap-2">
                          <span>Pocket Price Waterfall</span>
                          <InfoTip
                            className="ml-1"
                            align="right"
                            id="chart.waterfall"
                            ariaLabel="How does the pocket price waterfall work?"
                          />
                        </span>
                      }
                      className="print:bg-white print:shadow-none print:h-auto"
                      actions={
                        <ActionCluster chart="waterfall" id="waterfall-main" csv={true} />
                      }
                    >
                      <Explanation slot="chart.waterfall" className="px-3 py-1.5 text-[11px] leading-snug">
                        Start with list price, subtract tier discounts (promo/volume), then payment/FX/refunds to land on pocket. Use tier sliders for promo/volume, global inputs for fees, and channel blend if you sell through multiple processors. Pocket matters most in high-fee channels (e.g., app stores); compare all tiers to sanity-check leak assumptions across the ladder.
                      </Explanation>
                      <div className="grid gap-4 md:grid-cols-2 items-start text-xs">
                        {/* Controls */}
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs font-semibold text-slate-800">
                              <span>Choose preset</span>
                              <InfoTip className="ml-1" align="right" id="presets.waterfall" ariaLabel="About leak presets" />
                            </div>
                            <select
                              className="h-9 w-full border rounded px-2 bg-white"
                              value={presetSel}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPresetSel(v);
                                if (LEAK_PRESETS[v]) {
                                  setLeak(LEAK_PRESETS[v]);
                                  setChannelBlendApplied(false);
                                }
                              }}
                            >
                              <option value="" disabled>
                                Choose preset...
                              </option>
                              {Object.keys(LEAK_PRESETS).map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <span className="font-semibold text-slate-800">Chart shows tier</span>
                            <div className="inline-flex overflow-hidden rounded border">
                              {(["good", "better", "best"] as const).map((t) => (
                                <button
                                  key={t}
                                  className={`px-3 py-1 capitalize ${waterTier === t ? "bg-gray-900 text-white" : "bg-white"}`}
                                  onClick={() => setWaterTier(t)}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-gray-600 leading-snug">
                              Tier discounts are per-tier (affect the selected tier's chart). Global leakages (payment, FX, refunds) apply to all tiers.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800">Tier discounts (%)</span>
                              <span className="text-[11px] text-slate-500">Per selected tier</span>
                              <InfoTip id="waterfall.step.promo" ariaLabel="What are tier discounts?" />
                            </div>
                            <div className="space-y-1">
                              {(["good", "better", "best"] as const).map((t) => (
                                <div key={t} className="grid grid-cols-2 gap-2 sm:grid-cols-4 items-center">
                                  <span className="capitalize text-slate-700">{t} promo</span>
                                  <input
                                    type="number"
                                    step={0.01}
                                    className="h-9 w-full border rounded px-2 bg-white"
                                    value={leak.promo[t]}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      promo: {
                                        ...L.promo,
                                        [t]: clamp01(Number(e.target.value)),
                                      },
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                                  <span className="text-slate-700">Volume</span>
                                  <input
                                    type="number"
                                    step={0.01}
                                    className="h-9 w-full border rounded px-2 bg-white"
                                    value={leak.volume[t]}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      volume: {
                                        ...L.volume,
                                        [t]: clamp01(Number(e.target.value)),
                                      },
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              className="w-full md:w-auto border rounded px-3 py-2 bg-white hover:bg-gray-50"
                              onClick={() =>
                                setLeak((L) => {
                                  const t = waterTier;
                                  return {
                                    ...L,
                                    promo: {
                                      good: L.promo[t],
                                      better: L.promo[t],
                                      best: L.promo[t],
                                    },
                                    volume: {
                                      good: L.volume[t],
                                      better: L.volume[t],
                                      best: L.volume[t],
                                    },
                                  };
                                })
                              }
                              title="Copy the selected tier's promo/volume to the other tiers"
                            >
                              Copy this tier to others
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div className="font-semibold text-slate-800">Global leakages</div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                                <span>Payment %</span>
                                <input
                                  type="number"
                                  step={0.001}
                                  className="h-9 w-full border rounded px-2 bg-white"
                                  value={leak.paymentPct}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      paymentPct: clamp01(Number(e.target.value)),
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                                <span>Payment $</span>
                                <input
                                  type="number"
                                  step={0.01}
                                  className="h-9 w-full border rounded px-2 bg-white"
                                  value={leak.paymentFixed}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      paymentFixed: Math.max(0, Number(e.target.value)),
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                                <span>FX %</span>
                                <input
                                  type="number"
                                  step={0.001}
                                  className="h-9 w-full border rounded px-2 bg-white"
                                  value={leak.fxPct}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      fxPct: clamp01(Number(e.target.value)),
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 font-semibold text-slate-800">
                                <span>Refunds %</span>
                                <input
                                  type="number"
                                  step={0.001}
                                  className="h-9 w-full border rounded px-2 bg-white"
                                  value={leak.refundsPct}
                                  onChange={(e) => {
                                    setLeak((L) => ({
                                      ...L,
                                      refundsPct: clamp01(Number(e.target.value)),
                                    }));
                                    setChannelBlendApplied(false);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Chart + optional views */}
                        <div className="space-y-3 min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-700">Pocket Price Waterfall</div>
                              <div className="text-[11px] text-slate-600">
                                Showing {waterTier} tier - list ${listForWater.toFixed(2)}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
                              {WATERFALL_LEGEND.map((entry) => (
                                <span
                                  key={entry.key}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1"
                                  aria-label={`${entry.label} legend item`}
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                    aria-hidden="true"
                                  />
                                  <span className="font-semibold text-slate-800">{entry.label}</span>
                                  <InfoTip
                                    id={entry.infoId}
                                    ariaLabel={entry.aria}
                                    align="left"
                                    className="text-slate-500"
                                  />
                                </span>
                              ))}
                            </div>
                          </div>
                          <Suspense
                            fallback={
                              <div className="text-xs text-gray-500 p-2">
                                Loading waterfall...
                              </div>
                            }
                          >
                            <ErrorBoundary title="Waterfall chart failed">
                              <Waterfall
                                chartId="waterfall-main"
                                title="Pocket Price Waterfall"
                                subtitle={`${waterTier} - list $${listForWater.toFixed(2)}`}
                                listPrice={listForWater}
                                steps={water.steps}
                                colorMap={WATERFALL_COLOR_MAP}
                              />
                            </ErrorBoundary>
                          </Suspense>

                          {/* ---- Compare all tiers (small multiples) ---- */}
                          <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                            <summary className="cursor-pointer select-none text-xs font-semibold">
                              Compare all tiers
                            </summary>
                            <div className="text-[11px] text-slate-600">
                              Small multiples let you sanity-check pocket math across Good/Better/Best simultaneously.
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                              {(["good", "better", "best"] as const).map((t) => {
                                const list =
                                  t === "good"
                                    ? prices.good
                                    : t === "better"
                                    ? prices.better
                                    : prices.best;
                                const wf = computePocketPrice(list, t, leak);
                                return (
                                  <div key={t} className="min-w-0 h-56 overflow-hidden print:h-48">
                                    <Suspense
                                      fallback={
                                        <div className="text-xs text-gray-500 p-2">
                                          Loading...
                                        </div>
                                      }
                                    >
                                      <ErrorBoundary title="Waterfall mini chart failed">
                                        <Waterfall
                                          title={t}
                                          subtitle={`list $${list.toFixed(2)}`}
                                          listPrice={list}
                                          steps={wf.steps}
                                          variant="mini"
                                          colorMap={WATERFALL_COLOR_MAP}
                                        />
                                      </ErrorBoundary>
                                    </Suspense>
                                  </div>
                                );
                              })}
                            </div>
                          </details>

                          {/* ---- Channel blend (optional) ---- */}
                          <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                            <summary className="cursor-pointer select-none text-xs font-semibold">
                              Channel blend (optional)
                            </summary>
                            <div className="text-[11px] text-slate-600 mb-1">
                              Blend leak presets by channel; applied to leakages and saved in JSON/links. CSV export does not include blends.
                            </div>
                            {channelBlendApplied && (
                              <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 mb-2">
                                Blend applied to leakages
                              </div>
                            )}
                            <div className="text-[11px] text-slate-600 mb-1">
                              Each row weights a leak preset; normalize % then blend to see a composite fee/discount profile.
                            </div>
                            <div className="mt-2 space-y-2">
                              {channelMix.map((row, i) => (
                                <div key={i} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2">
                                  <span className="text-[11px] text-slate-600">Row {i + 1}</span>
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="border rounded px-2 h-8 w-20"
                                      value={row.w}
                                      onChange={(e) => {
                                        const v = Math.max(0, Math.min(100, Number(e.target.value)));
                                        setChannelMix((cur) => cur.map((r, j) => (j === i ? { ...r, w: v } : r)));
                                      }}
                                    />
                                    <span>%</span>
                                  </div>
                                  <select
                                    className="border rounded px-2 h-8 w-full"
                                    value={row.preset}
                                    onChange={(e) =>
                                      setChannelMix((cur) =>
                                        cur.map((r, j) => (j === i ? { ...r, preset: e.target.value } : r))
                                      )
                                    }
                                  >
                                    {Object.keys(LEAK_PRESETS).map((k) => (
                                      <option key={k} value={k}>
                                        {k}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    className="border rounded px-2 h-8 bg-white hover:bg-gray-50"
                                    onClick={() => setChannelMix((cur) => cur.filter((_, j) => j !== i))}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                                  onClick={() =>
                                    setChannelMix((cur) => [
                                      ...cur,
                                      { preset: Object.keys(LEAK_PRESETS)[0], w: 0 },
                                    ])
                                  }
                                >
                                  Add row
                                </button>
                                <div className="inline-flex flex-wrap items-center gap-2">
                                  <button
                                    className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                                    onClick={() =>
                                      setChannelMix((cur) => {
                                        const sum = cur.reduce((s, r) => s + (isFinite(r.w) ? r.w : 0), 0) || 1;
                                        return cur.map((r) => ({
                                          ...r,
                                          w: Math.round((r.w / sum) * 100),
                                        }));
                                      })
                                    }
                                  >
                                    Normalize %
                                  </button>
                                  <button
                                    className="border rounded px-3 py-2 bg-white hover:bg-gray-50"
                                    onClick={() => {
                                      const rows = channelMix.map((r) => ({
                                        w: r.w,
                                        preset: r.preset,
                                      }));
                                      const blended = blendLeaks(rows);
                                      setLeak(blended);
                                      setChannelBlendApplied(true);
                                    }}
                                  >
                                    Blend now -&gt; apply to leakages
                                  </button>
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </Section>
              )}
            </div>
          )}

          {leftColumnTab === "save" && (
            <div role="tabpanel" id="tab-save-scenario" aria-labelledby="tab-btn-save" className="space-y-3 md:space-y-4 min-w-0">
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
                        retentionPct,
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
                        setScenarioBaseline({
                          snapshot,
                          kpis,
                          basis: {
                            usePocketProfit: !!optConstraints.usePocketProfit,
                            usePocketMargins: !!optConstraints.usePocketMargins,
                          },
                          meta,
                        });
                        setBaselineKPIs(kpis);
                        setBaselineMeta(meta);
                        toast("success", "Saved scenario baseline");
                      } else {
                        toast("error", "Baseline not saved: KPIs unavailable");
                      }
                    }}
                  >
                    Set current scenario to baseline now
                  </button>
                  <div className="text-xs text-gray-600">
                    {scenarioBaseline
                      ? `Baseline saved ${new Date(scenarioBaseline.meta.savedAt).toLocaleString()}`
                      : "No scenario baseline saved yet."}
                  </div>
                </div>
              </Section>
          <Section id="compare-board" title="Scenario Compare (A/B/C)" className="order-3">
                      <Explanation slot="chart.compareBoard">
                        Save the current ladder into A/B/C, branch your changes, then reload slots while narrating differences. KPIs auto-recompute; use the toggles to control whether saved or current segments/leak/refs are used so you know exactly what's being compared.
                      </Explanation>
                      <div className="text-[11px] text-slate-600 mb-1">
                        Slots use saved prices/costs/refs/leak/segments and the saved pocket/list basis if present; Current uses live state.
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-1">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={compareUseSavedSegments}
                            onChange={(e) => setCompareUseSavedSegments(e.target.checked)}
                          />
                          Use saved segments for slots
                        </label>
                        <InfoTip id="compare.toggles" ariaLabel="How compare toggles work" />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-2">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={compareUseSavedLeak}
                            onChange={(e) => setCompareUseSavedLeak(e.target.checked)}
                          />
                          Use saved leak for slots
                        </label>
                        <InfoTip id="compare.leak" ariaLabel="Use saved leak?" />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-3">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={compareUseSavedRefs}
                            onChange={(e) => setCompareUseSavedRefs(e.target.checked)}
                          />
                          Use saved reference prices for slots
                        </label>
                        <InfoTip id="compare.refs" ariaLabel="Use saved reference prices?" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="text-gray-600">Save current to:</span>
                        {(["A", "B", "C"] as const).map((id) => (
                          <button
                            key={id}
                            className="border rounded px-2 py-1 bg-white hover:bg-gray-50"
                            onClick={() => saveToSlot(id)}
                          >
                            Save to {id}
                          </button>
                        ))}
                      </div>

                      {(() => {
                        // derive KPIs for the board
                        const usePocket = !!optConstraints.usePocketProfit;
                        const curKPIs = kpisFromSnapshot(
                          { prices, costs, features, refPrices, leak, segments },
                          N,
                          usePocket,
                          optConstraints.usePocketMargins ?? usePocket
                        );

                        const objA = readSlot("A");
                        const objB = readSlot("B");
                        const objC = readSlot("C");

                        const slotKpis = (
                          obj: ReturnType<typeof readSlot>,
                          fallbackTitle: string
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
                            obj.analysis?.optConstraints?.usePocketProfit ??
                            usePocket;
                          const slotUsePocketMargins =
                            obj.analysis?.optConstraints?.usePocketMargins ??
                            slotUsePocket;
                          return {
                            ...kpisFromSnapshot(
                              {
                                prices: obj.prices,
                                costs: obj.costs,
                                features: slotFeats,
                                refPrices: slotRef,
                                leak: slotLeak,
                                segments: slotSegments,
                              },
                              N,
                              slotUsePocket,
                              slotUsePocketMargins
                            ),
                            title: `${fallbackTitle} (${slotUsePocket ? "pocket" : "list"})`,
                            subtitle: `Basis: ${slotUsePocket ? "pocket" : "list"} | Segments: ${compareUseSavedSegments && obj.segments ? "saved" : "current"} | Leak: ${compareUseSavedLeak && obj.leak ? "saved" : "current"} | Refs: ${compareUseSavedRefs && obj.refPrices ? "saved" : "current"}`,
                          };
                        };

                        const slots: Record<"A" | "B" | "C", SnapshotKPIs | null> = {
                          A: slotKpis(objA, "Saved A"),
                          B: slotKpis(objB, "Saved B"),
                          C: slotKpis(objC, "Saved C"),
                        };

                        return (
                          <CompareBoard
                            slots={slots}
                            current={curKPIs}
                            onLoad={(id: "A" | "B" | "C") => loadFromSlot(id)}
                            onClear={(id: "A" | "B" | "C") => {
                              clearSlot(id);
                              toast("info", `Cleared slot ${id}`);
                              setJournal((j) => [...j]);
                            }}
                          />
                        );
                      })()}
                    </Section>
              <Section id="share-links" title="Share & export">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    className="text-xs border px-2 py-1 rounded"
                    onClick={saveScenarioShortLink}
                    title="Create a short link (saved in Cloudflare KV)"
                  >
                    Save short link
                  </button>
                  <button
                    className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
                    onClick={handleCopyLink}
                    title="Copy URL with current short link id if present"
                  >
                    Copy link
                  </button>
                  <button
                    className="text-xs border px-2 py-1 rounded"
                    onClick={handleCopyLongUrl}
                    title="Lightweight URL with ladder + features only"
                  >
                    Copy long URL
                  </button>
                  <button
                    className="text-xs border px-2 py-1 rounded"
                    onClick={handleExportJson}
                    title="Full snapshot JSON (including constraints and analysis knobs)"
                  >
                    Export JSON
                  </button>
                  <button
                    className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                    onClick={handleExportCsv}
                    title="CSV of ladder/leak/segments (no constraints/features/analysis)"
                  >
                    Export Sales Parameters CSV
                  </button>
                </div>
                <div className="text-[11px] text-slate-600">
                  JSON/short link includes prices/costs/features/refs/leak/segments + optimizer ranges/constraints, tornado/retention, price ranges, channel blend, and optimizer engine. CSV/long URL are lighter: CSV carries ladder/leak/segments only (no constraints/features/analysis), long URL carries ladder + feature flags only.
                </div>
              </Section>
          <Section id="recent-short-links" title="Recent short links" className="order-5">
                      <details className="text-xs">
                        <summary className="cursor-pointer select-none font-medium mb-2">
                          Show recents
                        </summary>

                        <ul className="text-xs space-y-1">
                          {readRecents().length === 0 ? (
                            <li className="text-gray-500">None yet</li>
                          ) : (
                            readRecents().map((r) => (
                              <li
                                key={r.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <button
                                  className="underline"
                                  title={new Date(r.t).toLocaleString()}
                                  onClick={() => {
                                    const url = `${location.origin}${location.pathname}?s=${r.id}`;
                                    location.assign(url); // reload page with this id
                                  }}
                                >
                                  {r.id}
                                </button>
                                <button
                                  className="border rounded px-2 py-0.5"
                                  onClick={() => {
                                    const url = `${location.origin}${location.pathname}?s=${r.id}`;
                                    navigator.clipboard.writeText(url).catch(() => {});
                                    pushJ(`[${now()}] Copied short link ${r.id}`);
                                  }}
                                >
                                  Copy
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                        <div className="mt-2">
                          <button
                            className="text-xs border rounded px-2 py-1"
                            onClick={() => {
                              localStorage.removeItem(RECENT_KEY);
                              pushJ(`[${now()}] Cleared recent short links`);
                              location.reload();
                            }}
                          >
                            Clear recents
                          </button>
                        </div>
                      </details>
                    </Section>
          <Section id="scenario-journal" title="Scenario Journal" className="order-4">
                      <ul className="text-xs text-gray-700 space-y-1 max-h-64 overflow-auto pr-1 wrap-break-word min-w-0">
                        {journal.length === 0 ? (
                          <li className="text-gray-400">
                            Adjust sliders/toggles to log changes...
                          </li>
                        ) : (
                          journal.map((line, i) => <li key={i}>{line}</li>)
                        )}
                        <li>
                          Revenue (N=1000): <strong>{fmtUSD(revenue)}</strong>
                        </li>
                        <li>
                          Profit (N=1000): <strong>{fmtUSD(profit)}</strong>
                        </li>
                        <li>
                          Active customers:{" "}
                          <strong>{activeCustomers.toLocaleString()}</strong>
                        </li>
                        <li>
                          ARPU (active only): <strong>{fmtUSD(arpu)}</strong>
                        </li>
                        <li>
                          Profit / customer (all N):{" "}
                          <strong>{fmtUSD(profitPerCustomer)}</strong>
                        </li>
                        <li>
                          Gross margin: <strong>{fmtPct(grossMarginPct)}</strong>
                        </li>
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="text-xs border px-2 py-1 rounded"
                          onClick={() => setJournal([])}
                        >
                          Clear
                        </button>
                        <button
                          className="text-xs border px-2 py-1 rounded"
                          onClick={() => {
                            const blob = new Blob([journal.slice().reverse().join("\n")], {
                              type: "text/plain",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "scenario-journal.txt";
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download .txt
                        </button>
                      </div>
                    </Section>
            </div>
          )}

          {leftColumnTab === "optimize" && (
            <div role="tabpanel" id="tab-global-optimizer" aria-labelledby="tab-btn-optimizer" className="col-span-12 lg:col-span-3 space-y-3 md:space-y-4 min-w-0 self-start md:text-[13px] pr-1">
          <Section id="global-optimizer" title="Global Optimizer">
                      <Explanation slot="chart.optimizer">
                        Set ranges, gaps, and margin floors, then run the grid optimizer (worker). Use pocket toggles to enforce floors and profit after leakages. Charm endings snap to .99 if applicable. If no feasible ladder is found, widen ranges or ease floors/gaps. Cite binding constraints when explaining results.
                      </Explanation>
                      {/* Compact header: inline ranges + actions */}
                      <div className="flex flex-col gap-3">
                        {/* Header row wraps nicely on small screens */}
                        <div className="flex flex-wrap items-end gap-3 text-xs">
                          <span className="font-semibold mr-2 basis-full sm:basis-auto">
                            Ranges ($)
                          </span>

                          {/* Good */}
                          <label className="flex items-center gap-1">
                            <span className="w-12">Good</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Good min"
                              value={optRanges.good[0]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  good: [Number(e.target.value), r.good[1]] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                            <span>-</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Good max"
                              value={optRanges.good[1]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  good: [r.good[0], Number(e.target.value)] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                          </label>

                          {/* Better */}
                          <label className="flex items-center gap-1">
                            <span className="w-12">Better</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Better min"
                              value={optRanges.better[0]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  better: [Number(e.target.value), r.better[1]] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                            <span>-</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Better max"
                              value={optRanges.better[1]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  better: [r.better[0], Number(e.target.value)] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                          </label>

                          {/* Best */}
                          <label className="flex items-center gap-1">
                            <span className="w-12">Best</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Best min"
                              value={optRanges.best[0]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  best: [Number(e.target.value), r.best[1]] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                            <span>-</span>
                            <input
                              type="number"
                              className="border rounded px-2 h-8 w-16"
                              aria-label="Best max"
                              value={optRanges.best[1]}
                              onChange={(e) =>
                                setOptRanges((r) => ({
                                  ...r,
                                  best: [r.best[0], Number(e.target.value)] as [
                                    number,
                                    number
                                  ],
                                }))
                              }
                            />
                          </label>

                          {/* Step */}
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

                          {/* Actions */}
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

                          {(optResult?.diagnostics || quickOpt.diagnostics) && (() => {
                            const diag: GridDiagnostics | undefined = optResult?.diagnostics ?? (quickOpt.diagnostics as GridDiagnostics | undefined);
                            if (!diag) return null;
                            const guardrailNote =
                              diag.skippedGuardrails > 0
                                ? `${diag.skippedGuardrails.toLocaleString()} ladders skipped by guardrails (none-share/take-rate/floors). `
                                : "";
                            const coarsenNote = diag.coarsened ? "Grid auto-coarsened for performance. " : "";
                            return (
                              <div className="text-[11px] text-slate-600 mt-2">
                                Tested {diag.tested.toLocaleString()} ladders; coarse step ${diag.coarseStep.toFixed(2)} →
                                refine ${diag.refinementStep.toFixed(2)}. {coarsenNote}
                                {guardrailNote}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Result line (one-liner) */}
                        <div className="text-xs text-gray-700">
                          {optError && (
                            <span className="text-red-600 mr-2">Error: {optError}</span>
                          )}
                          {optResult ? (
                            <span>
                              Best ladder ${optResult.prices.good}/$
                              {optResult.prices.better}/${optResult.prices.best} — Profit
                              delta ${Math.round(optResult.profit)}
                            </span>
                          ) : (
                            <span className="text-gray-500">No result yet</span>
                          )}
                        </div>
                        {optResult && optimizerWhyLines.length > 0 && (
                          <div className="mt-2 rounded border border-dashed border-gray-200 bg-slate-50 p-3">
                            <div className="text-xs font-semibold text-slate-700 mb-1">
                              Why these prices?
                            </div>
                            <ul className="list-disc ml-4 space-y-1 text-[11px] text-gray-700">
                              {optimizerWhyLines.map((line, idx) => (
                                <li key={idx}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <details className="text-[11px] text-gray-600">
                          <summary className="cursor-pointer select-none">
                            How ranges & floors work
                          </summary>
                          <div className="mt-1 print-tight">
                            Optimizer searches the grid defined by ranges and step. Gap
                            constraints keep ladder spacing consistent. Floors can be
                            checked on list or <em>pocket</em> margin. Use Apply to write
                            prices back to the Scenario Panel.
                          </div>
                        </details>

                        {/* Advanced constraints (collapsible) */}
                        <details className="rounded border border-gray-200 p-3 bg-gray-50/60">
                          <summary className="cursor-pointer select-none text-xs font-medium">
                            Advanced constraints
                          </summary>

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
                              <div className="text-[11px] font-semibold mb-1">
                                Margin floors
                              </div>
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
                                <option value="future" disabled>Future (coming)</option>
                              </select>
                            </label>

                            <p className="text-[11px] text-gray-500 sm:col-span-2 print-tight">
                              When enabled, margins are checked on pocket (after
                              promo/payment/FX/refunds) instead of list.
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
                          </div>
                        </details>

                        <details className="mt-4 rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
                          <summary className="cursor-pointer select-none font-medium">
                            Field guide (copy placeholder)
                          </summary>
                          <div
                            data-copy-slot="waterfall.fieldGuide"
                            className="space-y-2 text-slate-600 mt-2"
                          >
                            <div>
                              <span className="font-semibold">Tier discounts</span>: Promo/volume discounts shave list down to pocket. Prioritize heavier discounts on tiers where you need mix or where payment fees bite less (higher-ticket tiers).
                            </div>
                            <div>
                              <span className="font-semibold">Global leakages</span>: Payment %/fixed fees, FX, and refunds vary by channel. Low-ticket/high-fee businesses feel payment %; cross-border sales feel FX; high-return categories feel refunds.
                            </div>
                            <div>
                              <span className="font-semibold">Compare all tiers</span>: Mini waterfalls help defend Good/Better/Best deltas-ensure pocket spreads match your positioning and guardrails.
                            </div>
                            <div>
                              <span className="font-semibold">Channel blend</span>: Blend presets (e.g., Stripe vs. marketplace) to see a composite leak profile; narrate how channel mix shifts pocket and floors.
                            </div>
                          </div>
                        </details>
                      </div>
                    </Section>
          <Section id="reference-prices" title="Reference prices for Optimizer">
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

                      <div className="mt-3">
                        <button
                          className="border rounded-md px-3 py-1.5 text-xs bg-white hover:bg-gray-50"
                          onClick={setRefsFromCurrent}
                        >
                          Set from current prices
                        </button>
                      </div>
                    </Section>
          <Section id="current-vs-optimized" title="Current vs Optimized">
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 text-sm">How to read this card</span>
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">Demo aid</span>
                        </div>
                        <p className="mt-1 leading-snug">
                          Use this to narrate "before vs after." Apply the optimized ladder to push prices back to Scenario Panel,
                          undo to revert, then call out the delta and which constraints or drivers mattered most.
                        </p>
                        <p className="mt-1 text-slate-600">
                          Basis: {optConstraints.usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}.
                        </p>
                      </div>
                      {(() => {
                        const curProfit = optConstraints.usePocketProfit
                          ? (() => {
                              const probs = choiceShares(prices, features, segments, refPrices);
                              const take = {
                                good: Math.round(N * probs.good),
                                better: Math.round(N * probs.better),
                                best: Math.round(N * probs.best),
                              };
                              const pG = computePocketPrice(prices.good, "good", leak).pocket;
                              const pB = computePocketPrice(prices.better, "better", leak).pocket;
                              const pH = computePocketPrice(prices.best, "best", leak).pocket;
                              return take.good * (pG - costs.good) + take.better * (pB - costs.better) + take.best * (pH - costs.best);
                            })()
                          : (() => {
                              const probs = choiceShares(prices, features, segments, refPrices);
                              const take = {
                                good: Math.round(N * probs.good),
                                better: Math.round(N * probs.better),
                                best: Math.round(N * probs.best),
                              };
                              return take.good * (prices.good - costs.good) + take.better * (prices.better - costs.better) + take.best * (prices.best - costs.best);
                            })();

                        const best = optResult?.prices;
                        const bestProfit = optResult?.profit ?? null;

                        if (!best || bestProfit === null)
                          return <div className="text-xs text-gray-600">Run the optimizer to populate the optimized ladder.</div>;

                        const deltaProfit = (optimizerProfitDelta?.delta ?? bestProfit - curProfit) || 0;
                        const revenueDeltaCurrent =
                          optimizedKPIs && currentKPIs ? optimizedKPIs.revenue - currentKPIs.revenue : null;
                        const activeDeltaCurrent =
                          optimizedKPIs && currentKPIs
                            ? Math.round(N * (1 - optimizedKPIs.shares.none)) -
                              Math.round(N * (1 - currentKPIs.shares.none))
                            : null;
                        const arpuDeltaCurrent =
                          optimizedKPIs && currentKPIs
                            ? optimizedKPIs.arpuActive - currentKPIs.arpuActive
                            : null;
                        const guardrails = guardrailsForOptimized;
                        const binds = explainGaps(best, {
                          gapGB: optConstraints.gapGB,
                          gapBB: optConstraints.gapBB,
                        });
                        const topDriverLine = topDriver(tornadoRowsOptim);

                        return (
                          <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 text-sm">How to read this card</span>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Demo aid</span>
                              </div>
                              <p className="mt-1 leading-snug">
                                Narrate the “before vs after.” Apply the optimized ladder to push prices back to Scenario Panel, undo to revert, then call out the delta and which constraints or drivers mattered most.
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] uppercase tracking-wide text-slate-600">
                                  Basis: {optConstraints.usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}
                                </span>
                                <a className="text-sky-600 hover:underline" href="#callouts">
                                  Jump to Callouts for the narrative
                                </a>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-sm">
                              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                                <div className="font-semibold mb-1">Current</div>
                                <div>Good: ${prices.good}</div>
                                <div>Better: ${prices.better}</div>
                                <div>Best: ${prices.best}</div>
                                <div className="mt-2 text-xs text-gray-600">Profit: ${Math.round(curProfit).toLocaleString()}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                                <div className="font-semibold mb-1">Optimized</div>
                                <div>Good: ${best.good}</div>
                                <div>Better: ${best.better}</div>
                                <div>Best: ${best.best}</div>
                                <div className="mt-2 text-xs text-gray-600">Profit: ${Math.round(bestProfit).toLocaleString()}</div>
                              </div>
                              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 lg:col-span-2 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wide text-slate-600">Delta</div>
                                    <div className="text-xl font-bold leading-tight">
                                      {deltaProfit >= 0 ? "+" : "-"}${Math.abs(Math.round(deltaProfit)).toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-slate-600">vs current profit</div>
                                  </div>
                                  <div className="text-right text-[11px] text-slate-600">
                                    <div>Revenue {revenueDeltaCurrent != null ? `${revenueDeltaCurrent >= 0 ? "+" : "-"}$${Math.abs(revenueDeltaCurrent).toLocaleString()}` : "n/a"}</div>
                                    <div>Active {activeDeltaCurrent != null ? `${activeDeltaCurrent >= 0 ? "+" : "-"}${Math.abs(activeDeltaCurrent)}` : "n/a"}</div>
                                    <div>ARPU {arpuDeltaCurrent != null ? `${arpuDeltaCurrent >= 0 ? "+" : "-"}$${Math.abs(arpuDeltaCurrent).toFixed(2)}` : "n/a"}</div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <button
                                    className="w-full border rounded px-3 py-2 text-sm font-semibold bg-white hover:bg-gray-50"
                                    onClick={() => {
                                      lastAppliedPricesRef.current = { ...prices };
                                      setPrices(best as typeof prices);
                                      pushJ?.(`Applied optimized ladder: ${(best as typeof prices).good}/${(best as typeof prices).better}/${(best as typeof prices).best}`);
                                    }}
                                  >
                                    Apply optimized ladder
                                  </button>
                                  <button
                                    className="w-full text-sm border rounded px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50"
                                    disabled={!lastAppliedPricesRef.current}
                                    onClick={() => {
                                      const prev = lastAppliedPricesRef.current;
                                      if (!prev) return;
                                      setPrices(prev);
                                      lastAppliedPricesRef.current = null;
                                      pushJ?.("Undo: restored ladder to previous prices");
                                    }}
                                  >
                                    Undo apply ladder
                                  </button>
                                  {lastOptAt && (!baselineMeta || lastOptAt > baselineMeta.savedAt) ? (
                                    <button
                                      className="w-full text-xs border rounded px-3 py-2 bg-white hover:bg-gray-50"
                                      onClick={() => {
                                        if (!optResult?.kpis) return;
                                        const meta = { label: "Pinned from optimizer", savedAt: Date.now() };
                                        setBaselineKPIs(optResult.kpis);
                                        setBaselineMeta(meta);
                                        setScenarioBaseline({
                                          snapshot: buildScenarioSnapshot({
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
                                            retentionPct,
                                            kpiFloorAdj,
                                            priceRange: priceRangeState,
                                            optRanges,
                                            optConstraints,
                                            channelMix,
                                            optimizerKind,
                                          }),
                                          kpis: optResult.kpis,
                                          basis: {
                                            usePocketProfit: !!optConstraints.usePocketProfit,
                                            usePocketMargins: !!optConstraints.usePocketMargins,
                                          },
                                          meta,
                                        });
                                        toast("success", "Baseline pinned from optimizer");
                                      }}
                                    >
                                      Pin this as baseline
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div className="rounded-lg border border-slate-200 bg-white/70 p-3 space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                                  Why this recommendation?
                                </div>
                                <ul className="list-disc ml-4 space-y-1 text-slate-700 leading-snug">
                                  {binds.length ? binds.map((b, i) => <li key={i}>{b}</li>) : <li>No gap constraints binding.</li>}
                                  <li>Largest profit driver near optimum: {topDriverLine ? topDriverLine : "n/a"}.</li>
                                  <li>{guardrails.floorLine}</li>
                                </ul>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                                  Validation & follow-ups
                                </div>
                                <ul className="list-disc ml-4 space-y-1 text-slate-700 leading-snug">
                                  <li>Check guardrail feasibility in <a className="text-sky-600 hover:underline" href="#kpi-pocket-coverage">Pocket floor coverage</a>.</li>
                                  <li>Review leakages in <a className="text-sky-600 hover:underline" href="#pocket-price-waterfall">Pocket waterfall</a>.</li>
                                  <li>Compare narrative in <a className="text-sky-600 hover:underline" href="#callouts">Callouts snapshot</a> and export/print.</li>
                                </ul>
                                <p className="text-[11px] text-slate-600">
                                  Need to rerun? Adjust ranges, floors, or basis, then trigger the optimizer again to refresh this card.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </Section>
          <Section id="methods" title="Methods">
                      <p className="text-sm text-gray-700 print-tight">
                        MNL: U = ß0(j) + ß?·price + ß_A·featA + ß_B·featB; outside option
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
          <Section id="optimizer-robustness" title="Optimizer robustness">
                      <div className="text-[11px] text-slate-700 bg-slate-50 border border-dashed border-slate-200 rounded px-3 py-2">
                        Stress scenarios scale price sensitivity and leakages to show how fragile the recommendation is.
                        We re-run the grid under each scenario and compare profits at your optimized ladder vs the per-scenario optimum.
                      </div>
                      {robustnessResults.length === 0 ? (
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
                              {robustnessResults.map((r) => (
                                <tr key={r.name} className="odd:bg-white even:bg-slate-50">
                                  <td className="px-2 py-1 font-semibold text-slate-800">{r.name}</td>
                                  <td className="px-2 py-1">
                                    {r.profitAtBase != null ? fmtUSD(r.profitAtBase) : "n/a"}
                                  </td>
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
            </div>
          )}
        </div>

      {/* Right: Charts */}
      <div className="col-span-12 lg:col-span-6 space-y-4 min-w-0">
          <Section
            id="scorecard"
            title="Scorecard"
            actions={
              <ScorecardToolbar
                baselineText={scorecardBaselineText}
                pinnedBasisText={scorecardPinnedBasis}
                activeBasisText={scorecardActiveBasis}
                onPinBaseline={pinBaselineNow}
                view={scorecardView}
                onChangeView={setScorecardView}
                hasOptimized={!!optimizedKPIs}
              />
            }
          >
            {(() => {
              const baselineFallback = "Pin a baseline to compare.";
              const metrics = [
                {
                  key: "revenue",
                  label: "Revenue (N=1000)",
                  infoId: "kpi.revenue",
                  aria: "Why is Revenue computed this way?",
                  value: fmtUSD(scorecardKPIs.revenue),
                  baselineLabel: baselineKPIs
                    ? `Baseline ${fmtUSD(baselineKPIs.revenue)}`
                    : baselineFallback,
                  delta: baselineKPIs
                    ? scorecardKPIs.revenue - baselineKPIs.revenue
                    : null,
                  deltaPct:
                    baselineKPIs && baselineKPIs.revenue
                      ? ((scorecardKPIs.revenue - baselineKPIs.revenue) /
                          Math.max(baselineKPIs.revenue, 1e-9)) * 100
                      : null,
                  formatter: (v: number) => fmtUSD(v),
                },
                {
                  key: "profit",
                  label: "Profit (N=1000)",
                  infoId: "kpi.profit",
                  aria: "How is Profit calculated here?",
                  value: fmtUSD(scorecardKPIs.profit),
                  baselineLabel: baselineKPIs
                    ? `Baseline ${fmtUSD(baselineKPIs.profit)}`
                    : baselineFallback,
                  delta: baselineKPIs
                    ? scorecardKPIs.profit - baselineKPIs.profit
                    : null,
                  deltaPct:
                    baselineKPIs && baselineKPIs.profit
                      ? ((scorecardKPIs.profit - baselineKPIs.profit) /
                          Math.max(baselineKPIs.profit, 1e-9)) * 100
                      : null,
                  formatter: (v: number) => fmtUSD(v),
                },
                {
                  key: "active",
                  label: "Active customers",
                  infoId: "kpi.active",
                  aria: "What does Active customers mean?",
                  value: scorecardActiveFromShares.toLocaleString(),
                  baselineLabel:
                    baselineActiveCustomers !== null
                      ? `Baseline ${baselineActiveCustomers.toLocaleString()}`
                      : baselineFallback,
                  delta:
                    baselineActiveCustomers !== null
                      ? scorecardActiveFromShares - baselineActiveCustomers
                      : null,
                  deltaPct:
                    baselineActiveCustomers && baselineActiveCustomers > 0
                      ? ((scorecardActiveFromShares - baselineActiveCustomers) /
                          baselineActiveCustomers) * 100
                      : null,
                  formatter: (v: number) => Math.round(v).toLocaleString(),
                },
                {
                  key: "arpu",
                  label: "ARPU (active)",
                  infoId: "kpi.arpu",
                  aria: "What is ARPU (active)?",
                  value: `$${scorecardKPIs.arpuActive.toFixed(2)}`,
                  baselineLabel: baselineKPIs
                    ? `Baseline $${baselineKPIs.arpuActive.toFixed(2)}`
                    : baselineFallback,
                  delta: baselineKPIs
                    ? scorecardKPIs.arpuActive - baselineKPIs.arpuActive
                    : null,
                  deltaPct:
                    baselineKPIs && baselineKPIs.arpuActive
                      ? ((scorecardKPIs.arpuActive - baselineKPIs.arpuActive) /
                          Math.max(baselineKPIs.arpuActive, 1e-9)) * 100
                      : null,
                  formatter: (v: number) => `$${v.toFixed(2)}`,
                },
                {
                  key: "margin",
                  label: "Gross margin",
                  infoId: "kpi.gm",
                  aria: "How is Gross margin computed?",
                  value: fmtPct(scorecardMarginRatio),
                  baselineLabel:
                    baselineMarginRatio !== null
                      ? `Baseline ${fmtPct(baselineMarginRatio)}`
                      : baselineFallback,
                  delta: marginDeltaPP,
                  deltaPct: null,
                  formatter: (v: number) => `${v.toFixed(1)} pp`,
                },
              ];

              const summaryPills = baselineKPIs
                ? [
                    {
                      label: "Profit vs baseline",
                      value: scorecardKPIs.profit - baselineKPIs.profit,
                      format: fmtUSD,
                    },
                    {
                      label: "Active vs baseline",
                      value:
                        baselineActiveCustomers !== null
                          ? scorecardActiveFromShares - baselineActiveCustomers
                          : null,
                      format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}`,
                    },
                    {
                      label: "Gross margin delta",
                      value: marginDeltaPP,
                      format: (v: number) => `${v.toFixed(1)} pp`,
                    },
                  ]
                : [];

              const guardrails =
                scorecardView === "optimized" && optResult
                  ? guardrailsForOptimized
                  : guardrailsForCurrent;

              const tierColors: Record<"good" | "better" | "best", string> = {
                good: "bg-sky-500",
                better: "bg-indigo-500",
                best: "bg-fuchsia-500",
              };

              return (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">Quick read</span>
                      <a className="text-sky-600 hover:underline" href="#callouts">
                        Jump to Callouts for the narrative
                      </a>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {summaryPills.length === 0 ? (
                        <span className="text-[11px] text-slate-500">Pin a baseline to see deltas.</span>
                      ) : (
                        summaryPills.map((pill) =>
                          pill.value === null ? null : (
                            <div
                              key={pill.label}
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                pill.value >= 0
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              }`}
                            >
                              {pill.label}: {pill.value >= 0 ? "+" : "-"}
                              {pill.format(Math.abs(pill.value))}
                            </div>
                          )
                        )
                      )}
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] text-slate-600 border border-slate-200">
                        Basis: {scorecardActiveBasis}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {metrics.map((card) => (
                      <div
                        key={card.key}
                        className="rounded-xl border border-slate-200 bg-white/60 p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span className="flex items-center gap-1">
                            {card.label}
                            {card.infoId && (
                              <InfoTip
                                className="ml-1"
                                align="right"
                                id={card.infoId}
                                ariaLabel={card.aria}
                              />
                            )}
                          </span>
                          {renderDeltaBadge(
                            card.delta,
                            card.formatter as (n: number) => string,
                            "",
                            card.deltaPct
                          )}
                        </div>
                        <div className="text-xl font-semibold text-slate-900">
                          {card.value}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {card.baselineLabel}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>Choice mix at this ladder</span>
                      <span className="text-slate-500">
                        Pair with Callouts to narrate who is buying and why.
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {["good", "better", "best"].map((tier) => {
                        const share = Math.max(
                          0,
                          Math.round(scorecardKPIs.shares[tier as "good" | "better" | "best"] * 1000) / 10
                        );
                        const baselineShare = baselineKPIs
                          ? Math.round(baselineKPIs.shares[tier as "good" | "better" | "best"] * 1000) / 10
                          : null;
                        const delta =
                          baselineShare !== null ? share - baselineShare : null;
                        const barWidth = Math.min(100, Math.max(4, share));
                        const tone =
                          delta === null
                            ? "text-slate-500"
                            : delta >= 0
                            ? "text-emerald-700"
                            : "text-rose-700";
                        return (
                          <div
                            key={tier}
                            className="rounded-lg border border-slate-200 bg-white/70 p-3"
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-600">
                              <span className="capitalize">{tier}</span>
                              <span className="font-semibold text-slate-900">
                                {share}%
                              </span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                              <div
                                className={`h-full rounded-full ${tierColors[tier as "good" | "better" | "best"]}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <div className={`mt-1 text-[11px] ${tone}`}>
                              {delta === null
                                ? "Baseline to see mix deltas."
                                : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp vs baseline`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-600">
                        Driver snapshot
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {scorecardExplainDelta?.mainDriver || "Pin a baseline to see driver story."}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {scorecardExplainDelta?.segmentLine || "Narrate which segment is winning or losing once deltas are available."}
                      </p>
                      {scorecardExplainDelta?.suggestion && (
                        <p className="text-[11px] text-slate-600 mt-1">
                          {scorecardExplainDelta.suggestion}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-linear-to-br from-slate-50 to-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-slate-600">
                        <span>Guardrails & optimizer</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {guardrails.gapLine}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{guardrails.floorLine}</p>
                      <p className="text-[11px] text-slate-600 mt-1">{guardrails.optimizerLine}</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </Section>

          <Section id="callouts" title="Callouts snapshot">
            {optResult ? (
              <>
                <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
                  <span>Basis: {optConstraints.usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}.</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                    Ladder {optResult.prices.good}/${optResult.prices.better}/${optResult.prices.best}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 shadow-sm">
                    <div className="text-[11px] uppercase text-slate-600">Lift vs baseline</div>
                    <div className="text-2xl font-semibold text-slate-900">
                      {explainDeltaOptimized
                        ? `${explainDeltaOptimized.deltaProfit >= 0 ? "+" : "-"}$${Math.abs(
                            explainDeltaOptimized.deltaProfit
                          ).toLocaleString()}`
                        : "Pin a baseline"}
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                      {explainDeltaOptimized ? (
                        <>
                          <li>Revenue {explainDeltaOptimized.deltaRevenue >= 0 ? "+" : "-"}${Math.abs(explainDeltaOptimized.deltaRevenue).toLocaleString()}</li>
                          <li>Active {explainDeltaOptimized.deltaActive >= 0 ? "+" : "-"}{Math.abs(explainDeltaOptimized.deltaActive).toFixed(0)}</li>
                          <li>ARPU {explainDeltaOptimized.deltaARPU >= 0 ? "+" : "-"}${Math.abs(explainDeltaOptimized.deltaARPU).toFixed(2)}</li>
                        </>
                      ) : (
                        <li>Use "Set baseline to now" so deltas have context.</li>
                      )}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 shadow-sm">
                    <div className="text-[11px] uppercase text-slate-600">Main driver</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {explainDeltaOptimized?.mainDriver || scorecardExplainDelta?.mainDriver || "Drivers appear here once a baseline is set."}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                      {explainDeltaOptimized?.segmentLine || scorecardExplainDelta?.segmentLine || "Narrate which segment is winning or losing once deltas are available."}
                    </p>
                    {scorecardExplainDelta?.suggestion && (
                      <p className="text-[11px] text-slate-600 mt-1">{scorecardExplainDelta.suggestion}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-purple-100 bg-purple-50/50 px-3 py-3 shadow-sm">
                    <div className="text-[11px] uppercase text-slate-600">Guardrails & outlook</div>
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {guardrailsForOptimized.gapLine}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{guardrailsForOptimized.floorLine}</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {optimizerWhyLines.length > 0
                        ? optimizerWhyLines[0]
                        : "Optimizer ready - rerun if you change ranges, floors, or basis."}
                    </p>
                    {optimizerWhyLines.length > 1 && (
                      <p className="text-[11px] text-slate-600 mt-1">{optimizerWhyLines[1]}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 shadow-sm">
                    <div className="text-[11px] uppercase text-slate-600">Next steps</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-700 leading-snug">
                      <li>Validate guardrails in <a className="text-sky-600 hover:underline" href="#kpi-pocket-coverage">Pocket floor coverage</a>.</li>
                      <li>Review leakages in <a className="text-sky-600 hover:underline" href="#pocket-price-waterfall">Pocket waterfall</a>.</li>
                      <li>Rerun optimizer after ladder or basis tweaks, then export/print the summary.</li>
                      <li>Pin this run as a baseline to compare future tweaks.</li>
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
                Run the optimizer to populate these callouts with lift, drivers, and guardrail notes.
              </div>
            )}
          </Section>
          <Section
            id="kpi-pocket-coverage"
            title="KPI - Pocket floor coverage"
            actions={<ActionCluster chart="coverage" id="coverage-heatmap" csv />}
          >
            <div className="text-[11px] text-slate-600 mb-1">
              Basis: {coverageUsePocket ? "Pocket margins (after leakages)" : "List margins (before leakages)"}.
              <InfoTip id="coverage.basis" ariaLabel="How is coverage basis used?" />
            </div>
            <div className="flex items-center gap-3 text-xs mb-2">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={coverageUsePocket}
                  onChange={(e) => setCoverageUsePocket(e.target.checked)}
                />
                Use pocket margins for coverage
              </label>
              <span className="text-[11px] text-slate-500">
                Toggle to inspect list vs pocket feasibility; optimizer runs use the pocket toggle above.
              </span>
            </div>
            <Explanation slot="kpi.pocketCoverage">
              <div className="font-semibold text-[11px] text-slate-700">
                How to read pocket floor coverage
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  Coverage is the share of Good/Better/Best ladders inside the search grid that clear pocket-margin floors
                  after promo/FX/refund leakages.
                </li>
                <li>
                  The sensitivity slider bumps every floor up or down (in percentage points) to stress-test how fragile feasibility is
                  before you run the optimizer.
                </li>
                <li>
                  Apply floors pushes the adjusted floors into the optimizer guardrails so the global search aligns with what you are validating here.
                </li>
              </ul>
            </Explanation>
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className="text-gray-600">Floor sensitivity:</span>
              <input
                type="range"
                min={-10}
                max={10}
                value={kpiFloorAdj}
                onChange={(e) => setKpiFloorAdj(Number(e.target.value))}
              />
              <span className="w-10 text-right">{kpiFloorAdj} pp</span>
            </div>

            {(() => {
              const pct0 = coverageSnapshot.pct0;
              const pct1 = coverageSnapshot.pct1;
              const delta = coverageSnapshot.delta;
              const tone =
                pct1 >= 70
                  ? "text-green-700 bg-green-50 border-green-200"
                  : pct1 >= 40
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-red-700 bg-red-50 border-red-200";
              const floors1 = coverageSnapshot.floors;
              return (
                <>
                  <div
                    className={`rounded border px-4 py-3 inline-flex items-center gap-4 ${tone}`}
                  >
                    <div>
                      <div className="text-2xl font-semibold leading-tight">
                        {pct1}%
                      </div>
                      <div className="text-xs">
                        feasible ladders (pocket floors)
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1">
                        baseline {pct0}% -&gt; {pct1}% -{" "}
                        {delta >= 0 ? `+${delta}pp` : `${delta}pp`} -{" "}
                        {coverageSnapshot.tested.toLocaleString()} combos - step $
                        {coverageSnapshot.step}
                      </div>
                    </div>
                    <button
                      className="text-xs border rounded px-3 py-1 bg-white hover:bg-gray-50"
                      onClick={() => {
                        setOptConstraints((c) => ({
                          ...c,
                          marginFloor: { ...floors1 },
                        }));
                        toast(
                          "success",
                          `Applied floors: Good ${Math.round(
                            floors1.good * 100
                          )}%, Better ${Math.round(
                            floors1.better * 100
                          )}%, Best ${Math.round(floors1.best * 100)}%`
                        );
                      }}
                    >
                      Apply floors
                    </button>
                  </div>
                  <div className="text-[11px] text-gray-700 mt-2 space-y-1">
                    <div>
                      <span className="font-semibold text-gray-800">Floors tested:</span>{" "}
                      Good {Math.round(floors1.good * 100)}% | Better {Math.round(floors1.better * 100)}% | Best{" "}
                      {Math.round(floors1.best * 100)}% ({kpiFloorAdj} pp sensitivity applied).
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800">Grid and gaps:</span>{" "}
                      Good -&gt; Better gap {optConstraints.gapGB}, Better -&gt; Best gap {optConstraints.gapBB}; step $
                      {optRanges.step} across {coverageSnapshot.tested.toLocaleString()} ladder combinations.
                    </div>
                  </div>

                  <div className="mt-3">
                    {(() => {
                        const { cells, gTicks, bTicks, bestUsed } =
                          feasibilitySliceGB(
                            optRanges,
                            costs,
                            floors1,
                            {
                              gapGB: optConstraints.gapGB,
                              gapBB: optConstraints.gapBB,
                            },
                            leak,
                            coverageUsePocket
                          );
                      return (
                        <>
                          <details className="mb-1">
                            <summary className="cursor-pointer select-none text-[11px] text-gray-600">
                              How to read this heatmap
                            </summary>
                            <div className="text-[11px] text-gray-600 mt-1 space-y-1">
                              <div>
                                Best is pinned near the lowest feasible price (about {bestUsed}) so we can see the Good
                                vs Better feasibility wedge.
                              </div>
                              <div>
                                Green cells = Good/Better price pairs that clear the pocket floors and respect the required gaps; gray cells fail a gap or a margin floor.
                              </div>
                              <div>
                                If the green band collapses as you raise floors, either ease the floors, widen the gap guardrails, or broaden the search ranges before running the optimizer.
                              </div>
                            </div>
                          </details>


                          <HeatmapMini
                            cells={cells}
                            gTicks={gTicks}
                            bTicks={bTicks}
                            title="Feasible region (Good on X, Better on Y)"
                            chartId="coverage-heatmap"
                            exportKind="coverage"
                          />
                        </>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
          </Section>

          <Section
            id="profit-frontier"
            title="Profit Frontier"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="frontier" id="frontier-main" csv />}
          >
            <Explanation slot="chart.profitFrontier">
              Frontier sweeps Best while holding Good/Better fixed and computes profit at each step. Look for the peak, check which points are infeasible (gray) due to floors/gaps, and use this to answer quick "what if we nudged premium $X?" before running the full optimizer.
            </Explanation>
            <div className="text-[11px] text-slate-600">
              Basis: {optConstraints.usePocketProfit ? "Pocket profit (after leakages)" : "List profit"}; Good/Better fixed, sweep Best.
              Constraints (gaps/floors) are shown as feasible (green) vs infeasible (gray).
              <InfoTip id="frontier.overlay" ariaLabel="About frontier feasibility overlay" />
            </div>
            <Suspense fallback={ <div className="text-xs text-gray-500 p-2"> Loading frontier... </div>} >
              <ErrorBoundary title="Frontier chart failed">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Profit frontier</h3>
                  <InfoTip
                    className="ml-1"
                    align="right"
                    id="chart.frontier"
                    ariaLabel="What does the Profit Frontier chart show?"
                  />
                </div>
                <FrontierChartReal
                  chartId="frontier-main"
                  points={frontier.points}
                  overlay={{
                    feasiblePoints: frontier.feasiblePoints,
                    infeasiblePoints: frontier.infeasiblePoints,
                  }}
                  optimum={frontier.optimum}
                />
              </ErrorBoundary>
            </Suspense>
          </Section>

          <Section
            id="take-rate"
            title="Take-Rate Bars"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="takerate" id="takerate-main" csv />}
          >
            <Explanation slot="chart.takeRate">
              Take-rate bars show predicted mix across None/Good/Better/Best given current prices, features, segments, and reference prices. Use them to narrate how mix shifts when prices/features change; "None" is the outside option.
            </Explanation>
            <div className="text-[11px] text-slate-600">
              Demand-only view: leakages and margin floors are not applied here.
            </div>
            <InfoTip id="takeRate.bars" ariaLabel="How take-rate bars are computed" />
            <Suspense
              fallback={
                <div className="text-xs text-gray-500 p-2">Loading bars...</div>
              }
            >
              <ErrorBoundary title="Take-Rate chart failed">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Take-rate mix</h3>
                  <InfoTip
                    className="ml-1"
                    align="right"
                    id="chart.takeRate"
                    ariaLabel="How should I read take-rate bars?"
                  />
                </div>                
                <TakeRateChart chartId="takerate-main" data={probs} />
              </ErrorBoundary>
            </Suspense>
          </Section>

          <Section
            id="cohort-rehearsal"
            title="Cohort rehearsal (12 months)"
          actions={<ActionCluster chart="cohort" id="cohort-curve" csv />}
          >
            <Explanation slot="chart.cohort">
              Cohort rehearsal simulates 12 months of pocket margin on a shrinking cohort. Adjust monthly retention to stress churn vs. contribution and narrate sustainability beyond a single period.
            </Explanation>
            {(() => {
              const probsNow = choiceShares(
                prices,
                features,
                segments,
                refPrices
              );
              const pts = simulateCohort(
                prices,
                probsNow,
                leak,
                costs,
                12,
                retentionPct / 100 // <- slider drives retention
              );

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <label className="font-medium">Monthly retention</label>
                      <InfoTip id="cohort.retention" ariaLabel="What does monthly retention do?" />
                      <input
                        type="range"
                        min={70}
                        max={99.9}
                        step={0.1}
                        value={retentionPct}
                        onChange={(e) =>
                          setRetentionPct(Number(e.target.value))
                        }
                      />
                      <input
                        type="number"
                        step={0.1}
                        min={70}
                        max={99.9}
                        value={retentionPct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          setRetentionPct(Math.min(99.9, Math.max(70, v)));
                        }}
                        className="w-16 h-7 border rounded px-2"
                      />
                      <span>%</span>
                      <span className="text-gray-500 ml-2">
                        (churn ~ {(100 - retentionPct).toFixed(1)}%/mo)
                      </span>
                    </div>

                  </div>

                  <div className="mt-2">
                    <MiniLine
                      title={`Pocket margin by cohort month (retention ${retentionPct.toFixed(
                        1
                      )}%)`}
                      x={pts.map((p) => p.month)}
                      y={pts.map((p) => p.margin)}
                      chartId="cohort-curve"
                      exportKind="cohort"
                    />
                  </div>
                </>
              );
            })()}
          </Section>

          <Section
            id="tornado"
            title="Tornado - what moves profit?"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="tornado" id="tornado-main" csv />}
          >
            <Explanation slot="chart.tornado">
              Tornado varies one factor at a time around the base ladder and shows profit sensitivity (low/high). Switch between Current and Optimized to see how drivers change. Pocket toggle includes leakages; leak bump stress-tests FX/refunds/payment assumptions.
            </Explanation>
            <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tornadoPocket}
                  onChange={(e) => setTornadoPocket(e.target.checked)}
                />
                Compute using <span className="font-medium">pocket</span> margin
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
                              <InfoTip id="chart.tornado" ariaLabel="How to read tornado chart?" />
                            </div>
                          </div>
            </div>

            <div className="text-[11px] text-slate-600 mb-2">
              {tornadoView === "optimized" && !hasOptimizedTornado
                ? "Run the optimizer to enable the Optimized view and compare driver magnitudes."
                : "Use the controls above to test pocket/list assumptions and to resize the span used for each driver."}
            </div>

            <div className="flex items-center justify-between mb-2 text-xs text-slate-600">
              <span>Showing: {tornadoViewLabel} ladder</span>
              <InfoTip
                className="ml-1"
                align="right"
                id="chart.tornado"
                ariaLabel="How should I use the tornado sensitivity chart?"
              />
            </div>

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
                  title={`Tornado: ${tornadoViewLabel} profit sensitivity`}
                  rows={activeTornadoRows}
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



