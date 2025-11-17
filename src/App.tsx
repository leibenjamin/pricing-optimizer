// src/App.tsx

import { Suspense, lazy, type ReactNode } from "react";
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
import { type SearchRanges } from "./lib/optimize";
import { runOptimizeInWorker } from "./lib/optWorker";

import { computePocketPrice, type Leakages, type Tier } from "./lib/waterfall";
import { LEAK_PRESETS } from "./lib/waterfallPresets";

import { gridOptimize } from "./lib/optQuick";
import { tornadoProfit } from "./lib/sensitivity";

import { simulateCohort } from "./lib/simCohort";
import MiniLine from "./components/MiniLine";
import SegmentCards from "./components/SegmentCards";

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

import { preflight, fetchWithRetry } from "./lib/net";

import CompareBoard from "./components/CompareBoard";
import { kpisFromSnapshot, type SnapshotKPIs } from "./lib/snapshots";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const approx = (n: number) => Math.round(n); // for prices
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

type PriceRangeState = {
  map: TierRangeMap;
  source: PriceRangeSource;
};

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
      <div className="mb-3 print:mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-lg print:text-base print-tight">{title}</h2>
        {/* Hide the action toolbar on print */}
        {actions ? <div className="shrink-0 no-print">{actions}</div> : null}
      </div>
      <div className="space-y-3 print-space">{children}</div>
    </section>
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

  // Baseline KPIs for the “Tell me what changed” panel
  const [baselineKPIs, setBaselineKPIs] = useState<SnapshotKPIs | null>(null);

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
                    ? "⚠️"
                    : t.kind === "success"
                    ? "✅"
                    : "ℹ️"}
                </div>
                <div className="flex-1">{t.msg}</div>
                <button
                  className="opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                  onClick={() =>
                    setToasts((ts) => ts.filter((x) => x.id !== t.id))
                  }
                >
                  ✕
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
      kind: "frontier" | "waterfall" | "tornado" | "takerate";
      sectionId: string;
      chartId: string;
      label: string; // short chip label
      aria: string;  // descriptive label
    }> = [
      { kind: "frontier",  sectionId: "profit-frontier",        chartId: "frontier-main",  label: "Frontier",  aria: "Export Profit Frontier" },
      { kind: "waterfall", sectionId: "pocket-price-waterfall", chartId: "waterfall-main", label: "Waterfall", aria: "Export Pocket Price Waterfall" },
      { kind: "tornado",   sectionId: "tornado",                chartId: "tornado-main",   label: "Tornado",   aria: "Export Tornado Sensitivity" },
      { kind: "takerate",  sectionId: "take-rate",              chartId: "takerate-main",  label: "Take-Rate", aria: "Export Take-Rate Bars" },
    ];

    // Dispatch helper (used by buttons and keyboard shortcuts)
    function dispatchExport(
      kind: "frontier" | "waterfall" | "tornado" | "takerate",
      id: string,
      type: "png" | "csv"
    ) {
      const ev = new CustomEvent(`export:${kind}`, { detail: { id, type } });
      window.dispatchEvent(ev);
    }

    // Keyboard shortcuts (Alt+1..4 = PNG, Shift+Alt+1..4 = CSV, Ctrl/Cmd+P = print)
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        // Respect native print with Ctrl/Cmd+P (don’t intercept)
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

    return (
      <div
        className="no-print fixed bottom-4 right-4 z-50 rounded-lg border bg-white/95 backdrop-blur shadow px-2 py-1"
        role="toolbar"
        aria-label="Quick export toolbar"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[90vw]">
          {GROUPS.map((g, i) => (
            <div
              key={g.chartId}
              className="flex items-center gap-1 border rounded-md px-1 py-0.5"
              aria-label={g.aria}
              title={`${g.label} • Alt+${i + 1} (PNG), Shift+Alt+${i + 1} (CSV)`}
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

  const [activeSection, setActiveSection] = useState<string>("profit-frontier");

  function labelFor(id: string) {
    switch (id) {
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
    const el = document.getElementById(id);
    if (!el) return;
    const stickyHeight = 100;
    const scrollParent = findScrollableParent(el);
    const docElement = document.scrollingElement || document.documentElement;

    if (!scrollParent || scrollParent === document.body || scrollParent === docElement) {
      const top = el.getBoundingClientRect().top + window.scrollY - stickyHeight;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }

    const parentRect = scrollParent.getBoundingClientRect();
    const elementRect = el.getBoundingClientRect();
    const targetTop = elementRect.top - parentRect.top + scrollParent.scrollTop - 12;
    if (typeof scrollParent.scrollTo === "function") {
      scrollParent.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      scrollParent.scrollTop = targetTop;
    }

    const containerRect = scrollParent.getBoundingClientRect();
    if (containerRect.top < stickyHeight) {
      const adjust = containerRect.top - stickyHeight;
      window.scrollBy({ top: adjust, behavior: "smooth" });
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
  } | null>(null);

  const [channelMix, setChannelMix] = useState([
    { preset: "Stripe (cards)", w: 70 },
    { preset: "App Store (est.)", w: 30 },
  ]);

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
            analysis?: {
              tornadoPocket?: boolean;
              tornadoPriceBump?: number;
              tornadoPctBump?: number;
              tornadoRangeMode?: "symmetric" | "data";
              retentionPct?: number;
              kpiFloorAdj?: number;
              priceRange?: TierRangeMap;
              priceRangeSource?: PriceRangeSource;
            };
          };
        };
        setPrices(scenario.prices);
        setCosts(scenario.costs);
        setFeatures(scenario.features);
        if (scenario.refPrices) setRefPrices(scenario.refPrices);
        if (scenario.leak) setLeak(scenario.leak);
        if (scenario.segments) setSegments(scenario.segments);

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
  const [optResult, setOptResult] = useState<{
    prices: { good: number; better: number; best: number };
    profit: number;
  } | null>(null);
  const [optimizerExplainer, setOptimizerExplainer] = useState<{
    lines: string[];
    appliedAt: number;
  } | null>(null);

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
        setOptResult({ prices: out.prices, profit: out.profit });
        pushJ(
          `[${now()}] Optimizer ✓ best ladder $${out.prices.good}/$${
            out.prices.better
          }/$${out.prices.best} (profit≈$${Math.round(out.profit)})`
        );
        toast("success", "Optimizer finished");
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
    setOptimizerExplainer(
      optimizerWhyLines.length
        ? { lines: optimizerWhyLines, appliedAt: Date.now() }
        : null
    );
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

  const lastAppliedPricesRef = useRef<{
    good: number;
    better: number;
    best: number;
  } | null>(null);
  const lastAppliedFloorsRef = useRef<{
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
    for (let p = 5; p <= 60; p += 1) {
      const pricesP = { good: prices.good, better: prices.better, best: p };
      const probsP = choiceShares(pricesP, features, segments, refPrices);
      const take_good = Math.round(N * probsP.good);
      const take_better = Math.round(N * probsP.better);
      const take_best = Math.round(N * probsP.best);
      const profitP =
        take_good * (prices.good - costs.good) +
        take_better * (prices.better - costs.better) +
        take_best * (p - costs.best);
      points.push({ bestPrice: p, profit: profitP });
    }
    if (points.length === 0)
      return {
        points,
        optimum: null as { bestPrice: number; profit: number } | null,
      };
    const optimum = points.reduce(
      (a, b) => (b.profit > a.profit ? b : a),
      points[0]
    );
    return { points, optimum };
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
  ]);

  const bestPriceOpt = frontier.optimum?.bestPrice ?? prices.best;
  const bestProfitOpt = frontier.optimum?.profit ?? 0;

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

  // Light-weight KPI bundle used by Compare Board and the “What changed” panel
  const currentKPIs = useMemo(
    () =>
      kpisFromSnapshot(
        { prices, costs, features, segments, refPrices, leak },
        N,
        false // use list prices for this explainer to match the top KPI strip
      ),
    [prices, costs, features, segments, refPrices, leak, N]
  );

  // Initialize baseline once on first render
  useEffect(() => {
    if (!baselineKPIs) {
      setBaselineKPIs(currentKPIs);
    }
  }, [baselineKPIs, currentKPIs]);

  const explainDelta = useMemo<ExplainDelta | null>(() => {
    if (!baselineKPIs || !segments.length) return null;

    const deltaProfit = currentKPIs.profit - baselineKPIs.profit;
    const deltaRevenue = currentKPIs.revenue - baselineKPIs.revenue;

    const currentActive = N * (1 - currentKPIs.shares.none);
    const baselineActive = N * (1 - baselineKPIs.shares.none);
    const deltaActive = currentActive - baselineActive;

    const deltaARPU = currentKPIs.arpuActive - baselineKPIs.arpuActive;

    // --- Main driver by tier (Good / Better / Best) ---
    const tiers: Array<"good" | "better" | "best"> = ["good", "better", "best"];
    const perTier = tiers.map((tier) => {
      const shareBase = baselineKPIs.shares[tier];
      const shareCur = currentKPIs.shares[tier];
      const qBase = N * shareBase;
      const qCur = N * shareCur;

      // Approximate unit margin from baseline list prices
      const marginBase = baselineKPIs.prices[tier] - costs[tier];

      const mixEffect = (qCur - qBase) * marginBase;
      const priceEffect =
        qBase * (currentKPIs.prices[tier] - baselineKPIs.prices[tier]);
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

    const segmentLine = `Most price-sensitive segment right now: “${mostPriceSensitive.name}” (β_price = ${mostPriceSensitive.betaPrice.toFixed(
      2
    )}). Price moves that help or hurt them will have outsized impact.`;

    // --- Simple suggestion sentence ---
    let suggestion: string;
    if (Math.abs(deltaProfit) < 1e-2) {
      suggestion =
        "You’re right on top of your baseline. Try a small $1–$2 nudge to the Better tier to explore profit vs. conversion trade-offs.";
    } else if (deltaProfit > 0) {
      suggestion = `You’re ahead of baseline. If you’re comfortable with the current active-customer level, consider testing a slightly higher price for the ${main.tier} tier to see if profit can rise further without losing too many buyers.`;
    } else {
      suggestion = `Profit is below baseline. Consider nudging the ${main.tier} tier back toward the baseline price, or improving its features, to regain mix from “None” or lower tiers.`;
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
  }, [baselineKPIs, currentKPIs, costs, N, segments]);

  // ---- Tornado sensitivity data ----
  const [tornadoPocket, setTornadoPocket] = useState(true);
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
    return `${prefix}: ${rows.join(" · " )}`;
  }, [priceRangeState]);

  const dataRangeOptionLabel =
    priceRangeState?.source === "imported"
      ? "Data-driven (CSV)"
      : priceRangeState?.source === "shared"
      ? "Data-driven (scenario)"
      : "Data-driven (default)";

  const scenarioForTornado = useMemo(
    () => ({
      N,
      prices,
      costs,
      features,
      segments,
      refPrices,
      leak,
    }),
    [N, prices, costs, features, segments, refPrices, leak]
  );

  const tornadoRows = useMemo(() => {
    const bumps = computePriceBumps(prices);
    const avgSpan = avgFromBumps(bumps);
    return tornadoProfit(scenarioForTornado, {
      usePocket: tornadoPocket,
      priceBump: avgSpan,
      priceBumps: bumps,
      costBump: 2,
      pctSmall: tornadoPctBump / 100,
      payPct: tornadoPctBump / 200, // half as aggressive as generic pct
      payFixed: 0.05,
      refBump: 2,
      segTilt: 0.1,
    }).map((r) => ({
      name: r.name,
      base: r.base,
      deltaLow: r.deltaLow,
      deltaHigh: r.deltaHigh,
    }));
  }, [
    scenarioForTornado,
    tornadoPocket,
    tornadoPctBump,
    computePriceBumps,
    avgFromBumps,
    prices,
  ]);

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
      usePocketForFloors: usePocketFloors,
    };

    return gridOptimize(
      N,
      ranges,
      costs,
      features,
      segments,
      refPrices,
      leak,
      C,
      /* usePocketForProfit: */ usePocketProfit
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
  const optimizerProfitDelta = useMemo(() => {
    if (!optResult) return null;
    const usePocket = !!optConstraints.usePocketProfit;
    const baseProfit = computeScenarioProfit(prices, usePocket);
    return { delta: optResult.profit - baseProfit, base: baseProfit };
  }, [optResult, optConstraints.usePocketProfit, prices, computeScenarioProfit]);
  const optimizerWhyLines = useMemo(() => {
    if (!optResult) return [];
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
    });
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
    if (!quickOpt.best) return [];
    const p = quickOpt.best;
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
    quickOpt,
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
  function buildScenarioSnapshot(args: {
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
  }) {
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
        ...(args.priceRange
          ? {
              priceRange: args.priceRange.map,
              priceRangeSource: args.priceRange.source,
            }
          : {}),
      },
    };
  }

  // --- Import guard for JSON ---
  type ScenarioImport = ReturnType<typeof buildScenarioSnapshot>;
  function isScenarioImport(x: unknown): x is ScenarioImport {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.prices === "object" &&
      typeof o.costs === "object" &&
      typeof o.features === "object"
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


  async function saveScenarioShortLink() {
    try {
      // 1) Cheap warmup — if it fails, we continue anyway
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
            if (bodyUnknown.error) detail += ` — ${bodyUnknown.error}`;
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
    const ids = [
      "profit-frontier",
      "pocket-price-waterfall",
      "compare-board",
      "cohort-rehearsal",
      "tornado",
      "global-optimizer",
    ];
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
        rootMargin: "-80px 0px -40% 0px", // top offset for the sticky KPI+nav
      }
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

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
                  v0.3 • Latent-class choice model (3 segments)
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Good/Better/Best ladder • pocket price waterfall • profit frontier •
                tornado sensitivity • cohorts
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
                  4 steps · highlights each key section
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

      {/* Sticky KPI bar (desktop & tablet) */}
      <div
        className="sticky top-0 z-40 hidden md:block bg-white/80 backdrop-blur border-b print:hidden"
        role="region"
        aria-label="Key metrics and quick navigation"
      >
        <div className="mx-auto max-w-7xl px-4">
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-4 py-2 text-sm">
            <div className="truncate">
              <div className="text-[11px] text-gray-500 flex items-center">
                Revenue (N=1000)
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="kpi.revenue"
                  ariaLabel="Why is Revenue computed this way?"
                />
              </div>
              <div className="font-medium">{fmtUSD(revenue)}</div>
            </div>

            <div className="truncate">
              <div className="text-[11px] text-gray-500 flex items-center">
                Profit (N=1000)
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="kpi.profit"
                  ariaLabel="How is Profit calculated here?"
                />
              </div>
              <div className="font-medium">{fmtUSD(profit)}</div>
            </div>

            <div className="truncate">
              <div className="text-[11px] text-gray-500 flex items-center">
                Active customers
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="kpi.active"
                  ariaLabel="What does Active customers mean?"
                />
              </div>
              <div className="font-medium">
                {activeCustomers.toLocaleString()}
              </div>
            </div>

            <div className="truncate">
              <div className="text-[11px] text-gray-500 flex items-center">
                ARPU (active)
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="kpi.arpu"
                  ariaLabel="What is ARPU (active)?"
                />
              </div>
              <div className="font-medium">{fmtUSD(arpu)}</div>
            </div>

            <div className="truncate">
              <div className="text-[11px] text-gray-500 flex items-center">
                Gross margin
                <InfoTip
                  className="ml-1"
                  align="right"
                  id="kpi.gm"
                  ariaLabel="How is Gross margin computed?"
                />
              </div>
              <div className="font-medium">{fmtPct(grossMarginPct)}</div>
            </div>
          </div>

          {/* Mini top-nav */}
          <nav className="pb-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar text-sm">
              {[
                "profit-frontier",
                "pocket-price-waterfall",
                "compare-board",
                "cohort-rehearsal",
                "tornado",
                "global-optimizer",
              ].map((id) => (
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

          {explainDelta && (
            <div className="border-t border-dashed border-slate-200 pt-1 pb-2 text-[11px] text-slate-700">
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11px] font-medium text-slate-800">
                  <span className="flex flex-wrap items-baseline gap-1">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold">
                      ?
                    </span>
                    <span>Tell me what changed</span>
                    <span className="ml-1 text-[10px] font-normal text-slate-500">
                      vs. your pinned baseline
                    </span>
                  </span>
                  {/* Keep the quick Profit delta visible in both open/closed states */}
                  <span className="text-[10px] text-slate-500">
                    Profit Δ {explainDelta.deltaProfit >= 0 ? "+" : "−"}$
                    {Math.abs(explainDelta.deltaProfit).toFixed(0)}
                  </span>
                </summary>

                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px]">
                      <span className="font-medium">Profit</span>{" "}
                      <span>
                        {explainDelta.deltaProfit >= 0 ? "▲" : "▼"} $
                        {Math.abs(explainDelta.deltaProfit).toFixed(0)} vs. baseline
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Revenue Δ ${explainDelta.deltaRevenue.toFixed(0)} · Active
                      customers Δ {explainDelta.deltaActive.toFixed(0)} · ARPU Δ $
                      {explainDelta.deltaARPU.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {explainDelta.mainDriver}
                  </div>
                </div>

                <div className="mt-1 text-[11px] text-slate-600">
                  <div>{explainDelta.segmentLine}</div>
                  <div className="mt-0.5">{explainDelta.suggestion}</div>
                </div>

                {optimizerExplainer && optimizerExplainer.lines.length > 0 && (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                      <span>
                        Optimizer applied at{" "}
                        {new Date(optimizerExplainer.appliedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] underline text-slate-500 hover:text-slate-700"
                        onClick={() => setOptimizerExplainer(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {optimizerExplainer.lines.map((line, idx) => (
                        <li key={`opt-explain-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span className="max-w-xl">
                    Baseline stays fixed until you reset it. Handy when you’re
                    exploring multiple what-if scenarios.
                  </span>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => setBaselineKPIs(currentKPIs)}
                  >
                    Set baseline to now
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-4 min-h-screen print-grid-1 print:gap-2">
        {/* Left: Scenario Panel */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 2xl:col-span-3 flex flex-col min-h-0 min-w-0 overflow-x-visible">
          <Section id="scenario" title="Scenario Panel" className="left-rail-scroll overflow-x-auto">
            <div className="shrink-0 space-y-4">
            </div>
            <div id="scenarioScroll" className="flex-1 min-h-0 overflow-y-auto pr-2">
              {(["good", "better", "best"] as const).map((tier) => (
                <div key={tier} className="space-y-1">
                  <label className="block text-sm font-medium capitalize">
                    {tier} price (${prices[tier].toLocaleString(undefined, { maximumFractionDigits: 2 })})
                  </label>
                  <div className="flex items-center gap-2">
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
                      className="flex-1"
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
                className="text-xs border px-2 py-1 rounded"
                onClick={saveScenarioShortLink}
                title="Create a short link (saved in Cloudflare KV)"
              >
                Save short link
              </button>

              <button
                className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast?.("success", "URL copied to clipboard");
                  } catch {
                    toast?.(
                      "error",
                      "Copy failed—select and copy the address bar"
                    );
                  }
                }}
              >
                Copy link
              </button>
              
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
                  setLeak({ promo: { good: 0.05, better: 0.05, best: 0.05 }, volume: { good: 0.03, better: 0.03, best: 0.03 }, paymentPct: 0.029, paymentFixed: 0.3, fxPct: 0, refundsPct: 0.02 });
                  setOptConstraints({ gapGB: 2, gapBB: 4, marginFloor: { good: 0.25, better: 0.25, best: 0.25 }, charm: false, usePocketProfit: false, usePocketMargins: false });
                }}
                aria-label="Reset all settings to defaults"
              >
                Reset defaults
              </button>

              <button
                className="text-xs border px-2 py-1 rounded"
              onClick={() => {
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
                }}
              >
                Export JSON
              </button>

              <label className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 cursor-pointer">
                Import JSON
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const text = await f.text();
                      const obj: unknown = JSON.parse(text);

                      if (!isScenarioImport(obj)) {
                        pushJ?.(`[${now()}] Import failed: missing core keys`);
                        toast(
                          "error",
                          "Import failed: invalid JSON (missing required fields)"
                        );
                        alert("Invalid JSON: missing required fields.");
                        e.currentTarget.value = "";
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
                          mapNormalizedToUI(
                            normalizeSegmentsForSave(sc.segments)
                          )
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
                        `Import failed: ${
                          err instanceof Error ? err.message : String(err)
                        }`
                      );
                      alert("Failed to import JSON.");
                    }
                    e.currentTarget.value = ""; // allow re-upload same file
                  }}
                />
              </label>

              {/* CSV Import + Template */}
              <DataImport
                onPaste={(obj) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  applyScenarioPartial(obj as any);
                  pushJ?.(`[${now()}] Imported scenario CSV`);
                  toast("success", "Scenario CSV applied");
                }}
                onToast={(kind, msg) => toast(kind, msg)}
              />

              {/* Sales data importer (opens modal) */}
              <div className="mt-2">
                <button
                  id="sales-import-trigger"
                  className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                  onClick={() => setShowSalesImport(true)}
                  title="Upload sales logs CSV and estimate latent-class segments"
                >
                  Import Sales CSV (estimate)
                </button>
              </div>

              <button
                className="text-xs border px-2 py-1 rounded"
                onClick={() => {
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
                  const longUrl = `${location.origin}${
                    location.pathname
                  }?${q.toString()}`;
                  navigator.clipboard.writeText(longUrl).catch(() => {});
                  pushJ(`[${now()}] Copied long URL state`);
                }}
              >
                Copy long URL
              </button>

              <button
                className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
                onClick={async () => {
                  const ok = await preflight("/api/get?s=ping");
                  if (ok) {
                    toast("success", "Backend OK (204)");
                    pushJ?.(`[${now()}] Backend OK (preflight 204)`);
                  } else {
                    toast("error", "Backend preflight failed");
                    pushJ?.(`[${now()}] Backend preflight failed`);
                  }
                }}
                aria-label="Test backend connectivity"
                title="Quick health check (HEAD /api/get?s=ping)"
              >
                Test backend
              </button>
            </div>

            <Modal
              open={showSalesImport}
              onClose={() => setShowSalesImport(false)}
              title="Import Sales CSV & Estimate Segments"
              size="xl"
              footer={
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-600">
                    The estimator runs in a Web Worker and won’t block the UI. Your CSV never leaves the browser.
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
                1) Upload your sales CSV &nbsp;→&nbsp; 2) Map columns &nbsp;→&nbsp; 3) Estimate.  
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
                }}
                onToast={(kind, msg) => toast(kind, msg)}
                onDone={() => setShowSalesImport(false)}
              />
            </Modal>
          </Section>

          <Section id="reference-prices" title="Reference prices">
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

          <Section id="methods" title="Methods">
            <p className="text-sm text-gray-700 print-tight">
              MNL: U = β₀(j) + βₚ·price + β_A·featA + β_B·featB; outside option
              intercept fixed at 0. Estimated by MLE on ~15k synthetic obs with
              ridge regularization.
            </p>
            {fitInfo && (
              <div className="text-xs text-gray-600 mt-2">
                logLik: {Math.round(fitInfo.logLik)} • iters: {fitInfo.iters} •{" "}
                {fitInfo.converged ? "converged" : "not converged"}
              </div>
            )}
          </Section>
        </div>

        {/* Center: Charts */}
        <div className="col-span-12 md:col-span-6 space-y-4 min-w-0">
          <Section
            id="profit-frontier"
            title="Profit Frontier"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="frontier" id="frontier-main" csv />}
          >
            <Suspense fallback={ <div className="text-xs text-gray-500 p-2"> Loading frontier… </div>}>
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
            <Suspense
              fallback={
                <div className="text-xs text-gray-500 p-2">Loading bars…</div>
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

          <Section id="cohort-rehearsal" title="Cohort rehearsal (12 months)">
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
                        (churn ≈ {(100 - retentionPct).toFixed(1)}%/mo)
                      </span>
                    </div>

                    <button
                      className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50"
                      onClick={() => {
                        const header = "month,margin\n";
                        const rows = pts
                          .map((p) => `${p.month},${p.margin.toFixed(4)}`)
                          .join("\n");
                        const blob = new Blob([header + rows], {
                          type: "text/csv",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `cohort_margin_12m_ret${retentionPct}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="mt-2">
                    <MiniLine
                      title={`Pocket margin by cohort month (retention ${retentionPct.toFixed(
                        1
                      )}%)`}
                      x={pts.map((p) => p.month)}
                      y={pts.map((p) => p.margin)}
                    />
                  </div>
                </>
              );
            })()}
          </Section>

          <Section
            id="tornado"
            title="Tornado — what moves profit?"
            className="overflow-hidden print:bg-white print:shadow-none print:h-auto"
            actions={<ActionCluster chart="tornado" id="tornado-main" csv />}
          >
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
                  <option value="symmetric">±{tornadoPriceBump}% symmetric</option>
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
                  {dataRangeSummary ??
                    "No data-driven ranges yet. Import sales data to override the default span."}
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
            </div>

            <Suspense
              fallback={
                <div className="text-xs text-gray-500 p-2">
                  Loading tornado…
                </div>
              }
            >
              <ErrorBoundary title="Tornado chart failed">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Tornado sensitivity</h3>
                  <InfoTip
                    className="ml-1"
                    align="right"
                    id="chart.tornado"
                    ariaLabel="Why is this called a tornado chart?"
                  />
                </div>
                <Tornado chartId="tornado-main" title="Tornado: Profit Sensitivity" rows={tornadoRows} />
              </ErrorBoundary>
            </Suspense>

            <p className="text-[11px] text-gray-600 mt-1 print-tight">
              One-way sensitivity on current scenario. Bars show change in
              profit when each driver is nudged down (left) or up (right).
              Toggle pocket to account for promos/fees/FX/refunds; adjust bump
              sizes to test robustness.
            </p>
          </Section>

          <Section id="current-vs-optimized" title="Current vs Optimized">
            {(() => {
              const curProfit = optConstraints.usePocketProfit
                ? // pocket profit using current prices
                  (() => {
                    const probs = choiceShares(
                      prices,
                      features,
                      segments,
                      refPrices
                    );
                    const take = {
                      good: Math.round(N * probs.good),
                      better: Math.round(N * probs.better),
                      best: Math.round(N * probs.best),
                    };
                    const pG = computePocketPrice(
                      prices.good,
                      "good",
                      leak
                    ).pocket;
                    const pB = computePocketPrice(
                      prices.better,
                      "better",
                      leak
                    ).pocket;
                    const pH = computePocketPrice(
                      prices.best,
                      "best",
                      leak
                    ).pocket;
                    return (
                      take.good * (pG - costs.good) +
                      take.better * (pB - costs.better) +
                      take.best * (pH - costs.best)
                    );
                  })()
                : // list profit
                  (() => {
                    const probs = choiceShares(
                      prices,
                      features,
                      segments,
                      refPrices
                    );
                    const take = {
                      good: Math.round(N * probs.good),
                      better: Math.round(N * probs.better),
                      best: Math.round(N * probs.best),
                    };
                    return (
                      take.good * (prices.good - costs.good) +
                      take.better * (prices.better - costs.better) +
                      take.best * (prices.best - costs.best)
                    );
                  })();

              const best = quickOpt.best;
              const bestProfit = quickOpt.profit;

              if (!best)
                return (
                  <div className="text-xs text-gray-600">
                    No feasible ladder in the current ranges & floors.
                  </div>
                );

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded border p-3">
                    <div className="font-semibold mb-1">Current</div>
                    <div>Good: ${prices.good}</div>
                    <div>Better: ${prices.better}</div>
                    <div>Best: ${prices.best}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      Profit: ${Math.round(curProfit).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="font-semibold mb-1">Optimized</div>
                    <div>Good: ${best.good}</div>
                    <div>Better: ${best.better}</div>
                    <div>Best: ${best.best}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      Profit: ${Math.round(bestProfit).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border p-3 flex flex-col gap-2">
                    <div className="font-semibold">Delta</div>
                    <div>
                      Δ Profit:{" "}
                      <span className="font-medium">
                        ${Math.round(bestProfit - curProfit).toLocaleString()}
                      </span>
                    </div>
                    <button
                      className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
                      onClick={() => {
                        lastAppliedPricesRef.current = { ...prices }; // stash
                        setPrices(best); // apply
                        pushJ?.(
                          `Applied optimized ladder: ${best.good}/${best.better}/${best.best}`
                        );
                      }}
                    >
                      Apply optimized ladder
                    </button>
                  </div>
                  <div className="mt-2">
                    <button
                      className="text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 disabled:opacity-50"
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
                  </div>
                  <div className="mt-3 text-xs">
                    <div className="font-medium mb-1">
                      Why this recommendation?
                    </div>
                    <ul className="list-disc ml-5 space-y-1">
                      {(() => {
                        const binds = explainGaps(best, {
                          gapGB: optConstraints.gapGB,
                          gapBB: optConstraints.gapBB,
                        });
                        return binds.length ? (
                          binds.map((b, i) => <li key={i}>{b}</li>)
                        ) : (
                          <li>No gap constraints binding.</li>
                        );
                      })()}
                      {(() => {
                        const td = topDriver(tornadoRowsOptim);
                        return (
                          <li>
                            Largest profit driver near optimum: {td ?? "n/a"}
                          </li>
                        );
                      })()}
                      <li>
                        Floors: pocket margin ≥{" "}
                        {Math.round(optConstraints.marginFloor.good * 100)}% /{" "}
                        {Math.round(optConstraints.marginFloor.better * 100)}% /{" "}
                        {Math.round(optConstraints.marginFloor.best * 100)}%
                        (G/B/Best).
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </Section>

          <div className="print-page" aria-hidden="true" />
          <Section id="compare-board" title="Scenario Compare (A/B/C)">
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
                usePocket
              );

              const objA = readSlot("A");
              const objB = readSlot("B");
              const objC = readSlot("C");

              const slots: Record<"A" | "B" | "C", SnapshotKPIs | null> = {
                A: objA
                  ? {
                      ...kpisFromSnapshot(
                        {
                          prices: objA.prices,
                          costs: objA.costs,
                          features: objA.features,
                          refPrices: objA.refPrices ?? refPrices,
                          leak: objA.leak ?? leak,
                          segments, // reuse current mix
                        },
                        N,
                        usePocket
                      ),
                      title: "Saved A",
                    }
                  : null,

                B: objB
                  ? {
                      ...kpisFromSnapshot(
                        {
                          prices: objB.prices,
                          costs: objB.costs,
                          features: objB.features,
                          refPrices: objB.refPrices ?? refPrices,
                          leak: objB.leak ?? leak,
                          segments,
                        },
                        N,
                        usePocket
                      ),
                      title: "Saved B",
                    }
                  : null,
                C: objC
                  ? {
                      ...kpisFromSnapshot(
                        {
                          prices: objC.prices,
                          costs: objC.costs,
                          features: objC.features,
                          refPrices: objC.refPrices ?? refPrices,
                          leak: objC.leak ?? leak,
                          segments,
                        },
                        N,
                        usePocket
                      ),
                      title: "Saved C",
                    }
                  : null,
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

          <Section
            id="tornado-compare"
            title="Sensitivity shift: Current vs Optimized"
          >
            {quickOpt.best ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium mb-1">Current ladder</div>
                  <Suspense                    
                    fallback={
                      <div className="text-xs text-gray-500 p-2">Loading…</div>
                    }
                  >
                    <ErrorBoundary title="Tornado chart failed">
                      <Tornado rows={tornadoRowsCurrent} />
                    </ErrorBoundary>
                  </Suspense>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">
                    Optimized ladder
                  </div>
                  <Suspense
                    fallback={
                      <div className="text-xs text-gray-500 p-2">Loading…</div>
                    }
                  >
                    <ErrorBoundary title="Tornado chart failed">
                      <Tornado rows={tornadoRowsOptim} />
                    </ErrorBoundary>
                  </Suspense>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">
                No feasible ladder to compare.
              </div>
            )}
          </Section>

          <div className="print-page" aria-hidden="true" />
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
            <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="w-28 text-xs text-gray-700">
                    Choose preset
                  </label>                  
                  <InfoTip className="ml-1" align="right" id="presets.waterfall" ariaLabel="About leak presets" />
                  <select
                    className="border rounded px-2 h-9 w-full md:w-64 bg-white"
                    value={presetSel}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPresetSel(v);
                      if (LEAK_PRESETS[v]) setLeak(LEAK_PRESETS[v]);
                    }}
                  >
                    <option value="" disabled>
                      Choose preset…
                    </option>
                    {Object.keys(LEAK_PRESETS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chart scope + quick help */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Chart shows tier:</span>
                  <div className="inline-flex overflow-hidden rounded border">
                    {(["good", "better", "best"] as const).map((t) => (
                      <button
                        key={t}
                        className={`px-2 py-1 capitalize ${
                          waterTier === t
                            ? "bg-gray-900 text-white"
                            : "bg-white"
                        }`}
                        onClick={() => setWaterTier(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 print-tight">
                  Tier discounts are per-tier (affect the selected tier’s
                  chart). Global leakages (payment, FX, refunds) apply to all
                  tiers.
                </p>

                <div className="font-semibold mt-2">Tier discounts (%)</div>
                {(["good", "better", "best"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-20 capitalize">{t} promo</span>
                    <input
                      type="number"
                      step={0.01}
                      className="border rounded px-1 py-0.5 w-20"
                      value={leak.promo[t]}
                      onChange={(e) =>
                        setLeak((L) => ({
                          ...L,
                          promo: {
                            ...L.promo,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }))
                      }
                    />
                    <span className="w-20">volume</span>
                    <input
                      type="number"
                      step={0.01}
                      className="border rounded px-1 py-0.5 w-20"
                      value={leak.volume[t]}
                      onChange={(e) =>
                        setLeak((L) => ({
                          ...L,
                          volume: {
                            ...L.volume,
                            [t]: clamp01(Number(e.target.value)),
                          },
                        }))
                      }
                    />
                  </div>
                ))}

                {/* Copy helper */}
                <div className="flex gap-2">
                  <button
                    className="border rounded px-2 py-1"
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
                    title="Copy the selected tier’s promo/volume to the other tiers"
                  >
                    Copy this tier → others
                  </button>
                </div>

                {/* Global leakages */}
                <div className="font-semibold mt-2">Global leakages</div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Payment %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.paymentPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        paymentPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Payment $</span>
                  <input
                    type="number"
                    step={0.01}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.paymentFixed}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        paymentFixed: Math.max(0, Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">FX %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.fxPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        fxPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-32">Refunds %</span>
                  <input
                    type="number"
                    step={0.001}
                    className="border rounded px-1 py-0.5 w-24"
                    value={leak.refundsPct}
                    onChange={(e) =>
                      setLeak((L) => ({
                        ...L,
                        refundsPct: clamp01(Number(e.target.value)),
                      }))
                    }
                  />
                </div>
              </div>

              {/* Chart */}
              <div className="min-w-0">
                <Suspense
                  fallback={
                    <div className="text-xs text-gray-500 p-2">
                      Loading waterfall…
                    </div>
                  }
                >
                  <ErrorBoundary title="Waterfall chart failed">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-700">Pocket Price Waterfall</h3>
                    </div>
                    <Waterfall
                      chartId="waterfall-main"
                      title="Pocket Price Waterfall"
                      subtitle={`${waterTier} • list $${listForWater.toFixed(2)}`}
                      listPrice={listForWater}
                      steps={water.steps}
                      colorMap={WATERFALL_COLOR_MAP}
                    />
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
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
                  </ErrorBoundary>
                </Suspense>
              </div>

              {/* ---- Compare all tiers (small multiples) ---- */}
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-xs font-medium">
                  Compare all tiers
                </summary>
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
                        {" "}
                        {/* added overflow-hidden */}
                        <Suspense
                          fallback={
                            <div className="text-xs text-gray-500 p-2">
                              Loading…
                            </div>
                          }
                        >
                          <ErrorBoundary title="Waterfal mini chart failed">
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
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-xs font-medium">
                  Channel blend (optional)
                </summary>
                <div className="mt-2 text-xs space-y-2">
                  {channelMix.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="w-16">Row {i + 1}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="border rounded px-2 h-8 w-20"
                        value={row.w}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            Math.min(100, Number(e.target.value))
                          );
                          setChannelMix((cur) =>
                            cur.map((r, j) => (j === i ? { ...r, w: v } : r))
                          );
                        }}
                      />
                      <span>%</span>
                      <select
                        className="border rounded px-2 h-8"
                        value={row.preset}
                        onChange={(e) =>
                          setChannelMix((cur) =>
                            cur.map((r, j) =>
                              j === i ? { ...r, preset: e.target.value } : r
                            )
                          )
                        }
                      >
                        {Object.keys(LEAK_PRESETS).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>

                      {/* remove row */}
                      <button
                        className="ml-2 border rounded px-2 h-8 bg-white hover:bg-gray-50"
                        onClick={() =>
                          setChannelMix((cur) => cur.filter((_, j) => j !== i))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* add row */}
                  <button
                    className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                    onClick={() =>
                      setChannelMix((cur) => [
                        ...cur,
                        { preset: Object.keys(LEAK_PRESETS)[0], w: 0 },
                      ])
                    }
                  >
                    Add row
                  </button>

                  {/* normalize & apply */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                      onClick={() =>
                        setChannelMix((cur) => {
                          const sum =
                            cur.reduce(
                              (s, r) => s + (isFinite(r.w) ? r.w : 0),
                              0
                            ) || 1;
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
                      className="border rounded px-3 h-8 bg-white hover:bg-gray-50"
                      onClick={() => {
                        const rows = channelMix.map((r) => ({
                          w: r.w,
                          preset: r.preset,
                        }));
                        const blended = blendLeaks(rows);
                        setLeak(blended); // apply to all tiers
                      }}
                    >
                      Blend now → apply to leakages
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </Section>
        </div>

        {/* Right: Journal */}
        <div
          className="col-span-12 md:col-span-3 space-y-3 md:space-y-4 min-w-0
                    md:sticky md:top-4 self-start md:text-[13px]
                    md:max-h-[calc(100vh-2rem)] md:overflow-auto pr-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <Section id="preset-scenarios" title="Preset scenarios">
            <PresetPicker
              presets={PRESETS}
              activeId={scenarioPresetId}
              onApply={applyScenarioPreset}
              infoId="presets.scenario"
              className="mt-1"
            />
          </Section>

          <Section id="scenario-journal" title="Scenario Journal">
            <ul className="text-xs text-gray-700 space-y-1 max-h-64 overflow-auto pr-1 wrap-break-word min-w-0">
              {journal.length === 0 ? (
                <li className="text-gray-400">
                  Adjust sliders/toggles to log changes…
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
                  const blob = new Blob(
                    [journal.slice().reverse().join("\n")],
                    { type: "text/plain" }
                  );
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

          <Section id="callouts" title="Callouts">
            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <strong>So what?</strong> Conversion ≈{" "}
                {Math.round((probs.good + probs.better + probs.best) * 100)}%.
              </div>
              <div className="text-xs text-gray-600">
                Best-price optimum ≈ <strong>${approx(bestPriceOpt)}</strong>{" "}
                (profit ≈ <strong>{fmtUSD(bestProfitOpt)}</strong>). Segments:
                Price-sens / Value / Premium.
              </div>
              {optResult && (
                <div className="mt-1 inline-block text-[11px] px-2 py-1 rounded bg-gray-100 border">
                  Opt best: ${optResult.prices.good}/{optResult.prices.better}/
                  {optResult.prices.best} • π≈${Math.round(optResult.profit)}
                </div>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-[11px] text-gray-600">
                  Why these numbers?
                </summary>
                <div className="space-y-1 mt-1 text-[11px] text-gray-600">
                  <div>
                    Frontier shows profit vs Best price with current Good/Better
                    fixed.
                  </div>
                  <div>
                    Pocket price ({waterTier}) ≈ ${water.pocket.toFixed(2)} from
                    list ${listForWater.toFixed(2)}.
                  </div>
                  <div>
                    Anchoring on refs ${refPrices.good}/${refPrices.better}/$
                    {refPrices.best}; loss aversion on increases.
                  </div>
                </div>
              </details>
            </div>
          </Section>

          <Section id="global-optimizer" title="Global Optimizer">
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
                  <span>–</span>
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
                  <span>–</span>
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
                  <span>–</span>
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
                  <span className="w-8">Step</span>
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
                    {isOptRunning ? "Running…" : "Run"}
                  </button>
                  <button
                    className="border rounded px-3 h-8 text-xs bg-white hover:bg-gray-50 disabled:opacity-50"
                    onClick={applyOptimizedPrices}
                    disabled={!optResult || isOptRunning}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Result line (one-liner) */}
              <div className="text-xs text-gray-700">
                {optError && (
                  <span className="text-red-600 mr-2">Error: {optError}</span>
                )}
                {optResult ? (
                  <span>
                    Best ladder $${optResult.prices.good}/$$
                    {optResult.prices.better}/$${optResult.prices.best} • Profit
                    ≈ ${Math.round(optResult.profit)}
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
                    <span className="w-28">Gap G→B</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-8 w-20"
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
                    <span className="w-28">Gap B→Best</span>
                    <input
                      type="number"
                      className="border rounded px-2 h-8 w-20"
                      value={optConstraints.gapBB}
                      onChange={(e) =>
                        setOptConstraints((c) => ({
                          ...c,
                          gapBB: Number(e.target.value),
                        }))
                      }
                    />
                  </label>

                  {(["good", "better", "best"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2">
                      <span className="w-28 capitalize">{t} margin ≥</span>
                      <input
                        type="number"
                        step={0.01}
                        className="border rounded px-2 h-8 w-20"
                        value={optConstraints.marginFloor[t]}
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

                  <label className="flex items-center gap-2 sm:col-span-2">
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

                  <label className="flex items-center gap-2 sm:col-span-2">
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
                  </label>
                </div>
              </details>
            </div>
          </Section>

          <Section id="kpi-pocket-coverage" title="KPI — Pocket floor coverage">
            {/* Sensitivity control */}
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
              // Baseline floors (no adjustment)
              const floors0 = optConstraints.marginFloor;

              // Adjusted floors (slider)
              const adj = (x: number) =>
                Math.max(0, Math.min(0.95, x + kpiFloorAdj / 100));
              const floors1 = {
                good: adj(floors0.good),
                better: adj(floors0.better),
                best: adj(floors0.best),
              };

              // Compute coverage
              const base = pocketCoverage(
                optRanges,
                costs,
                floors0,
                { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
                leak
              );
              const moved = pocketCoverage(
                optRanges,
                costs,
                floors1,
                { gapGB: optConstraints.gapGB, gapBB: optConstraints.gapBB },
                leak
              );

              const pct0 = Math.round(base.coverage * 100);
              const pct1 = Math.round(moved.coverage * 100);
              const delta = pct1 - pct0;

              const tone =
                pct1 >= 70
                  ? "text-green-700 bg-green-50 border-green-200"
                  : pct1 >= 40
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-red-700 bg-red-50 border-red-200";

              return (
                <>
                  {/* KPI number + explain line + apply button */}
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
                        baseline {pct0}% → {pct1}%{" "}
                        {delta >= 0 ? `(+${delta}pp)` : `(${delta}pp)`} •{" "}
                        {moved.tested.toLocaleString()} combos • step $
                        {optRanges.step}
                      </div>
                    </div>
                    <button
                      className="text-xs border rounded px-3 py-1 bg-white hover:bg-gray-50"
                      onClick={() => {
                        lastAppliedFloorsRef.current = {
                          ...optConstraints.marginFloor,
                        }; // stash
                        // Write adjusted floors back to constraints
                        setOptConstraints((prev) => ({
                          ...prev,
                          marginFloor: { ...floors1 },
                        }));
                        // Optional: log to journal if you use pushJ
                        if (typeof pushJ === "function") {
                          pushJ(
                            `Applied floors: good ${Math.round(
                              floors1.good * 100
                            )}% • better ${Math.round(
                              floors1.better * 100
                            )}% • best ${Math.round(floors1.best * 100)}%`
                          );
                        }
                      }}
                    >
                      Apply adjusted floors
                    </button>

                    <button
                      className="ml-2 text-xs border rounded px-2 py-1 bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={!lastAppliedFloorsRef.current}
                      onClick={() => {
                        const prev = lastAppliedFloorsRef.current;
                        if (!prev) return;
                        setOptConstraints((c) => ({
                          ...c,
                          marginFloor: { ...prev },
                        }));
                        lastAppliedFloorsRef.current = null;
                        pushJ?.("Undo: restored previous margin floors");
                      }}
                    >
                      Undo apply floors
                    </button>
                  </div>

                  {/* Mini heatmap (Good × Better slice) */}
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
                          leak
                        );
                      return (
                        <>
                          <details className="mb-1">
                            <summary className="cursor-pointer select-none text-[11px] text-gray-600">
                              What is this slice?
                            </summary>
                            <div className="text-[11px] text-gray-600 mt-1">
                              Good × Better feasibility with Best fixed near the
                              lower feasible bound (≈ ${bestUsed}).
                            </div>
                          </details>

                          <HeatmapMini
                            cells={cells}
                            gTicks={gTicks}
                            bTicks={bTicks}
                          />
                        </>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
          </Section>

          <Section id="segment-stories" title="Segment stories">
            <SegmentCards segments={segments} />
          </Section>

          <Section id="segments-mix" title="Segments (mix)">
            <details open className="text-xs">
              <summary className="cursor-pointer select-none font-medium mb-2">
                Adjust segment weights
              </summary>
              <div className="space-y-2 text-xs">
                {segments.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-28">{s.name}</div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={s.weight}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        const next = segments.map((t, j) =>
                          j === i ? { ...t, weight: w } : t
                        );
                        setSegments(normalizeWeights(next));
                      }}
                      className="flex-1"
                      aria-label={`${s.name} weight`}
                    />
                    <div className="w-10 text-right">
                      {Math.round(s.weight * 100)}%
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => setSegments(normalizeWeights(segments))}
                  >
                    Normalize
                  </button>
                </div>
              </div>
            </details>
          </Section>

          <Section id="recent-short-links" title="Recent short links">
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
