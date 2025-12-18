// src/lib/share.ts

import { buildScenarioSnapshot, type SnapshotBuildArgs } from "./snapshots";
import type { Constraints, SearchRanges } from "./optimize";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import type { Features, Prices, Segment } from "./segments";
import type { Leakages } from "./waterfall";
import type { TornadoMetric, TornadoValueMode } from "./tornadoView";
import type { ChannelMix, Scenario, ScenarioUncertainty } from "./domain";
import type { RetryConfig } from "./net";
import { csvTemplate } from "./csv";
import { downloadBlob, sanitizeSpreadsheetCell } from "./download";

export type SharePayloadArgs = {
  prices: Prices;
  costs: Prices;
  features: Features;
  refPrices: Prices;
  leak: Leakages;
  segments: Segment[];
  tornadoPocket: boolean;
  tornadoPriceBump: number;
  tornadoPctBump: number;
  tornadoRangeMode: "symmetric" | "data";
  tornadoMetric: TornadoMetric;
  tornadoValueMode: TornadoValueMode;
  retentionPct: number;
  retentionMonths: number;
  kpiFloorAdj: number;
  priceRange: { map: TierRangeMap; source: PriceRangeSource } | null;
  optRanges: SearchRanges;
  optConstraints: Constraints;
  channelMix?: ChannelMix;
  optimizerKind?: "grid-worker" | "grid-inline" | "future";
  uncertainty?: ScenarioUncertainty | null;
};

/**
 * Single place to construct the share/export payload so short-link POST, JSON export,
 * and other serializers stay in sync with the snapshot schema.
 */
export function buildSharePayload(args: SharePayloadArgs) {
  return buildScenarioSnapshot({
    prices: args.prices,
    costs: args.costs,
    features: args.features,
    refPrices: args.refPrices,
    leak: args.leak,
    segments: args.segments,
    tornadoPocket: args.tornadoPocket,
    tornadoPriceBump: args.tornadoPriceBump,
    tornadoPctBump: args.tornadoPctBump,
    tornadoRangeMode: args.tornadoRangeMode,
    tornadoMetric: args.tornadoMetric,
    tornadoValueMode: args.tornadoValueMode,
    retentionPct: args.retentionPct,
    retentionMonths: args.retentionMonths,
    kpiFloorAdj: args.kpiFloorAdj,
    priceRange: args.priceRange,
    optRanges: args.optRanges,
    optConstraints: args.optConstraints,
    channelMix: args.channelMix,
    optimizerKind: args.optimizerKind,
    uncertainty: args.uncertainty ?? undefined,
  } satisfies SnapshotBuildArgs);
}

export type SharePayload = ReturnType<typeof buildSharePayload>;

type SavedSegment = {
  name?: string;
  weight: number;
  beta: { price: number; featA: number; featB: number; refAnchor?: number };
};

export function downloadScenarioJson(payload: SharePayload, opts?: { filename?: string }) {
  const name = opts?.filename ?? "pricing_scenario.json";
  downloadBlob(JSON.stringify(payload, null, 2), name, "application/json");
}

type CsvOptions = { includeMeta?: boolean };

export function buildScenarioCsv(
  payload: SharePayload,
  template: string = csvTemplate(),
  opts: CsvOptions = { includeMeta: true }
): string {
  const header = template.split(/\r?\n/)[0]?.split(",") ?? [];
    const setValue = (
      row: string[],
      key: string,
      value: string | number | boolean | null | undefined
    ) => {
      const idx = header.findIndex((h) => h.toLowerCase() === key.toLowerCase());
      if (idx >= 0) {
        if (value === undefined || value === null) {
          row[idx] = "";
        } else if (typeof value === "boolean") {
          row[idx] = value ? "true" : "false";
        } else {
          const s = typeof value === "string" ? sanitizeSpreadsheetCell(value) : String(value);
          // Quote fields that contain commas, quotes, or newlines to avoid column shifts on parse.
          row[idx] = /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }
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
    includeScenario: boolean
  ) => {
    const row = Array.from({ length: header.length }, () => "");
    if (includeScenario) {
      setValue(row, "prices.good", payload.prices.good);
      setValue(row, "prices.better", payload.prices.better);
      setValue(row, "prices.best", payload.prices.best);
      if (payload.costs) {
        setValue(row, "costs.good", payload.costs.good);
        setValue(row, "costs.better", payload.costs.better);
        setValue(row, "costs.best", payload.costs.best);
      }
      if (payload.refPrices) {
        setValue(row, "ref.good", payload.refPrices.good);
        setValue(row, "ref.better", payload.refPrices.better);
        setValue(row, "ref.best", payload.refPrices.best);
      }
      if (payload.leak) {
        setValue(row, "promo.good", payload.leak.promo.good);
        setValue(row, "promo.better", payload.leak.promo.better);
        setValue(row, "promo.best", payload.leak.promo.best);
        setValue(row, "volume.good", payload.leak.volume.good);
        setValue(row, "volume.better", payload.leak.volume.better);
        setValue(row, "volume.best", payload.leak.volume.best);
        setValue(row, "leak.paymentPct", payload.leak.paymentPct);
        setValue(row, "leak.paymentFixed", payload.leak.paymentFixed);
        setValue(row, "leak.fxPct", payload.leak.fxPct);
        setValue(row, "leak.refundsPct", payload.leak.refundsPct);
      }
      const oc = payload.analysis?.optConstraints;
      if (oc) {
        setValue(row, "constraints.gapGB", oc.gapGB);
        setValue(row, "constraints.gapBB", oc.gapBB);
        setValue(row, "constraints.charm", oc.charm);
        setValue(row, "constraints.usePocketProfit", oc.usePocketProfit);
        setValue(row, "constraints.usePocketMargins", oc.usePocketMargins);
        setValue(row, "constraints.maxNoneShare", oc.maxNoneShare);
        setValue(row, "constraints.minTakeRate", oc.minTakeRate);
        if (oc.marginFloor) {
          setValue(row, "constraints.margin.good", oc.marginFloor.good);
          setValue(row, "constraints.margin.better", oc.marginFloor.better);
          setValue(row, "constraints.margin.best", oc.marginFloor.best);
        }
      }
      const rng = payload.analysis?.optRanges;
      if (rng) {
        setValue(row, "ranges.good.min", rng.good?.[0]);
        setValue(row, "ranges.good.max", rng.good?.[1]);
        setValue(row, "ranges.better.min", rng.better?.[0]);
        setValue(row, "ranges.better.max", rng.better?.[1]);
        setValue(row, "ranges.best.min", rng.best?.[0]);
        setValue(row, "ranges.best.max", rng.best?.[1]);
        setValue(row, "ranges.step", rng.step);
      }
      const pr = payload.analysis?.priceRange;
      if (pr) {
        setValue(row, "priceRange.good.min", pr.good?.min);
        setValue(row, "priceRange.good.max", pr.good?.max);
        setValue(row, "priceRange.better.min", pr.better?.min);
        setValue(row, "priceRange.better.max", pr.better?.max);
        setValue(row, "priceRange.best.min", pr.best?.min);
        setValue(row, "priceRange.best.max", pr.best?.max);
        setValue(row, "priceRange.source", payload.analysis?.priceRangeSource);
      }
      if (payload.channelMix?.length) {
        setValue(row, "channelMix", JSON.stringify(payload.channelMix));
      }
      if (payload.uncertainty) {
        setValue(row, "uncertainty", JSON.stringify(payload.uncertainty));
      }
      if (payload.analysis?.optimizerKind) {
        setValue(row, "optimizerKind", payload.analysis.optimizerKind);
      }
    }
    if (seg) {
      setValue(row, "name", seg.name ?? "");
      setValue(row, "weight", seg.weight);
      setValue(row, "beta.price", seg.beta.price);
      setValue(row, "beta.featA", seg.beta.featA);
      setValue(row, "beta.featB", seg.beta.featB);
      setValue(row, "beta.refAnchor", seg.beta.refAnchor ?? "");
    }
    return row;
  };

  const segs: SavedSegment[] =
    Array.isArray(payload.segments) ? (payload.segments as SavedSegment[]) : [];
  const rows: string[] = [];
  const add = (r: string[]) => rows.push(r.join(","));

  if (segs.length) {
    segs.forEach((seg, idx) => add(makeRow(seg, idx === 0)));
  } else {
    add(makeRow(null, true));
  }

  if (opts.includeMeta !== false) {
    rows.push(""); // spacer
    if (payload.channelMix && payload.channelMix.length) {
      rows.push("# channelMix (preset: weight)");
      payload.channelMix.forEach((m) => rows.push(`# ${m.preset}: ${m.w}`));
    }
    if (payload.uncertainty) {
      rows.push("# uncertainty (JSON)");
      rows.push(`# ${JSON.stringify(payload.uncertainty)}`);
    }
    if (payload.analysis?.optConstraints) {
      rows.push("# constraints");
      rows.push(
        `# gapGB=${payload.analysis.optConstraints.gapGB ?? ""}, gapBB=${payload.analysis.optConstraints.gapBB ?? ""},` +
          ` charm=${payload.analysis.optConstraints.charm ?? ""}, usePocketProfit=${payload.analysis.optConstraints.usePocketProfit ?? ""},` +
          ` usePocketMargins=${payload.analysis.optConstraints.usePocketMargins ?? ""}, maxNoneShare=${payload.analysis.optConstraints.maxNoneShare ?? ""}, minTakeRate=${payload.analysis.optConstraints.minTakeRate ?? ""}`
      );
      if (payload.analysis.optConstraints.marginFloor) {
        const mf = payload.analysis.optConstraints.marginFloor;
        rows.push(`# marginFloor good=${mf.good ?? ""}, better=${mf.better ?? ""}, best=${mf.best ?? ""}`);
      }
    }
    if (payload.analysis?.optRanges) {
      const r = payload.analysis.optRanges;
      const fmt = (t?: [number, number]) => (t ? `${t[0]}-${t[1]}` : "");
      rows.push("# ranges");
      rows.push(
        `# good=${fmt(r.good)}, better=${fmt(r.better)}, best=${fmt(r.best)}, step=${r.step ?? ""}`
      );
    }
    if (payload.analysis?.priceRange) {
      rows.push("# priceRange (if provided)");
      const pr = payload.analysis.priceRange;
      rows.push(`# good=${JSON.stringify(pr.good ?? null)}, better=${JSON.stringify(pr.better ?? null)}, best=${JSON.stringify(pr.best ?? null)}, source=${payload.analysis.priceRangeSource ?? ""}`);
    }
    if (payload.analysis?.optimizerKind) {
      rows.push(`# optimizerKind=${payload.analysis.optimizerKind}`);
    }
  }

  const headerLine = header.join(",");
  return [headerLine, ...rows].join("\n");
}

export function downloadScenarioCsv(payload: SharePayload, opts?: { filename?: string }) {
  const name = opts?.filename ?? "pricing_scenario.csv";
  const csv = buildScenarioCsv(payload);
  downloadBlob(csv, name, "text/csv");
}

export function downloadJournal(entries: string[], opts?: { filename?: string }) {
  const name = opts?.filename ?? "scenario-journal.txt";
  const text = entries.slice().reverse().join("\n");
  downloadBlob(text, name, "text/plain");
}

// -------- Short-link + URL helpers --------

export type SaveShortLinkDeps = {
  preflight: (url: string) => Promise<boolean>;
  fetchWithRetry: (
    input: RequestInfo | URL,
    init: RequestInit,
    cfg?: RetryConfig
  ) => Promise<Response>;
  onLog?: (msg: string) => void;
  onToast?: (kind: "success" | "error" | "info", msg: string) => void;
};

export type SaveShortLinkResult = {
  id: string | null;
  url: string | null;
};

export async function saveShortLink(
  payload: SharePayload,
  deps: SaveShortLinkDeps
): Promise<SaveShortLinkResult> {
  const { preflight, fetchWithRetry, onLog, onToast } = deps;
  try {
    const ok = await preflight("/api/get?s=ping");
    if (!ok) onLog?.("Preflight failed (continuing to save)");

    const res = await fetchWithRetry("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      onLog?.(`Save failed: HTTP ${res.status}`);
      onToast?.("error", `Save failed (HTTP ${res.status})`);
      return { id: null, url: null };
    }
    const body = (await res.json()) as { id?: string; error?: string };
    if (!body.id) {
      onToast?.("error", body.error ?? "Save failed: missing id");
      return { id: null, url: null };
    }
    const url = buildShortLinkUrl({
      origin: window.location.origin,
      pathname: window.location.pathname,
      id: body.id,
    });
    onToast?.("success", "Short link created");
    return { id: body.id, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onLog?.(`Save failed: ${msg}`);
    onToast?.("error", `Save failed: ${msg}`);
    return { id: null, url: null };
  }
}

export type ShortLinkDeps = SaveShortLinkDeps & {
  rememberId: (id: string) => void;
  pushJournal?: (msg: string) => void;
  toast: (kind: "success" | "error" | "info" | "warning", msg: string) => void;
  buildUrl?: (id: string) => string;
};

export type ShortLinkFlowDeps = ShortLinkDeps & { location?: Location | null };

export async function saveShortLinkWithUi(
  payload: SharePayload,
  deps: ShortLinkDeps
): Promise<SaveShortLinkResult> {
  const { pushJournal, rememberId, toast, buildUrl } = deps;
  const { id, url } = await saveShortLink(payload, deps);
  if (id && url) {
    rememberId(id);
    const finalUrl =
      buildUrl?.(id) ?? url ?? buildShortLinkUrl({ origin: window.location.origin, pathname: window.location.pathname, id });
    window.history.replaceState({}, "", finalUrl);
    pushJournal?.(`[${new Date().toLocaleTimeString()}] Saved short link ${id}`);
    toast("success", `Saved: ${id}`);
    return { id, url: finalUrl };
  }
  return { id, url };
}

export async function saveShortLinkFlow(
  payload: SharePayload,
  deps: ShortLinkFlowDeps
): Promise<SaveShortLinkResult> {
  const loc = deps.location ?? (typeof window !== "undefined" ? window.location : null);
  const buildUrl =
    deps.buildUrl ??
    (loc
      ? (id: string) => buildShortLinkUrl({ origin: loc.origin, pathname: loc.pathname, id })
      : undefined);
  return saveShortLinkWithUi(payload, { ...deps, buildUrl });
}

export function buildLongUrl(args: {
  origin: string;
  pathname: string;
  prices: Prices;
  costs: Prices;
  features: Features;
}): string {
  const q = new URLSearchParams({
    p: [args.prices.good, args.prices.better, args.prices.best].join(","),
    c: [args.costs.good, args.costs.better, args.costs.best].join(","),
    fa: [
      args.features.featA.good,
      args.features.featA.better,
      args.features.featA.best,
    ].join(","),
    fb: [
      args.features.featB.good,
      args.features.featB.better,
      args.features.featB.best,
    ].join(","),
  });
  return `${args.origin}${args.pathname}?${q.toString()}`;
}

export async function copyToClipboard(
  text: string,
  opts?: { onSuccess?: () => void; onError?: (msg: string) => void }
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    opts?.onError?.("Clipboard not available");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    opts?.onSuccess?.();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opts?.onError?.(msg);
    return false;
  }
}

export function buildShortLinkUrl(args: { origin: string; pathname: string; id: string }) {
  return `${args.origin}${args.pathname}?s=${encodeURIComponent(args.id)}`;
}

export function buildShortLinkUrlFromLocation(
  id: string,
  loc?: Location | null
): string | null {
  const target = loc ?? (typeof window !== "undefined" ? window.location : null);
  if (!target) return null;
  return buildShortLinkUrl({ origin: target.origin, pathname: target.pathname, id });
}

export function navigateToShortLink(id: string, loc?: Location | null): string | null {
  const url = buildShortLinkUrlFromLocation(id, loc);
  if (!url) return null;
  const target = loc ?? (typeof window !== "undefined" ? window.location : null);
  target?.assign(url);
  return url;
}

export function copyPageUrl(
  loc: Location,
  opts?: { onSuccess?: () => void; onError?: (msg: string) => void }
) {
  return copyToClipboard(loc.href, opts);
}

export function copyShortLinkUrl(
  id: string,
  opts?: { location?: Location | null; onSuccess?: () => void; onError?: (msg: string) => void }
) {
  const url = buildShortLinkUrlFromLocation(id, opts?.location);
  if (!url) {
    opts?.onError?.("No location available");
    return Promise.resolve(false);
  }
  return copyToClipboard(url, opts);
}

export function copyScenarioLongUrl(
  args: {
    origin: string;
    pathname: string;
    prices: Prices;
    costs: Prices;
    features: Features;
  },
  opts?: { onSuccess?: () => void; onError?: (msg: string) => void }
) {
  const longUrl = buildLongUrl({
    origin: args.origin,
    pathname: args.pathname,
    prices: args.prices,
    costs: args.costs,
    features: args.features,
  });
  return copyToClipboard(longUrl, opts);
}

// Simple round-trip validation to catch missing fields after JSON serialization
export function roundTripValidate(payload: SharePayload): { ok: boolean; issues: string[] } {
  const parsed = JSON.parse(JSON.stringify(payload)) as SharePayload;
  const issues: string[] = [];

  const check = <K extends keyof SharePayload>(key: K) => {
    const before = payload[key];
    const after = parsed[key];
    if (before === undefined && after === undefined) return;
    if (Array.isArray(before)) {
      if (!Array.isArray(after) || before.length !== after.length) {
        issues.push(`Field ${String(key)} length changed`);
      }
      return;
    }
    if (before === undefined || after === undefined) {
      issues.push(`Field ${String(key)} missing after round-trip`);
    }
  };

  ["prices", "costs", "features", "refPrices", "leak", "segments", "channelMix", "uncertainty"].forEach((k) =>
    check(k as keyof SharePayload)
  );

  const beforeAnalysis = payload.analysis;
  const afterAnalysis = parsed.analysis;
  if (beforeAnalysis || afterAnalysis) {
    if (!afterAnalysis) issues.push("analysis missing after round-trip");
    else {
      if (beforeAnalysis?.optConstraints && !afterAnalysis.optConstraints)
        issues.push("optConstraints missing after round-trip");
      if (beforeAnalysis?.optRanges && !afterAnalysis.optRanges) issues.push("optRanges missing after round-trip");
      if (beforeAnalysis?.priceRange && !afterAnalysis.priceRange)
        issues.push("priceRange missing after round-trip");
      if (beforeAnalysis?.priceRangeSource && !afterAnalysis.priceRangeSource)
        issues.push("priceRangeSource missing after round-trip");
      if (beforeAnalysis?.optimizerKind && !afterAnalysis.optimizerKind)
        issues.push("optimizerKind missing after round-trip");
    }
  }

  // Deep check for uncertainty.source if present
  const beforeSource = (payload.uncertainty as ScenarioUncertainty | null | undefined)?.source;
  const afterSource = (parsed.uncertainty as ScenarioUncertainty | null | undefined)?.source;
  if (beforeSource !== undefined) {
    if (beforeSource !== afterSource) {
      issues.push(`uncertainty.source changed (${beforeSource ?? "missing"} -> ${afterSource ?? "missing"})`);
    }
  }

  return { ok: issues.length === 0, issues };
}

// Dev-helper to validate one or more payloads and return a summary; safe to import in tests/scripts.
export function roundTripValidateMany(
  items: Array<{ label: string; payload: SharePayload }>
): { ok: boolean; issues: Array<{ label: string; issues: string[] }> } {
  const problems: Array<{ label: string; issues: string[] }> = [];
  items.forEach((item) => {
    const res = roundTripValidate(item.payload);
    if (!res.ok) problems.push({ label: item.label, issues: res.issues });
  });
  return { ok: problems.length === 0, issues: problems };
}

// Dev-helper: validate presets + a user-edited uncertainty delta.
export function devValidatePresetRoundTrips(opts: {
  presets: Array<{ id?: string; name?: string; payload: SharePayload }>;
  edited?: SharePayload | null;
}): { ok: boolean; issues: Array<{ label: string; issues: string[] }> } {
  const items: Array<{ label: string; payload: SharePayload }> = opts.presets.map((p, idx) => ({
    label: p.id ?? p.name ?? `preset-${idx}`,
    payload: p.payload,
  }));
  if (opts.edited) items.push({ label: "edited-uncertainty", payload: opts.edited });
  return roundTripValidateMany(items);
}

// Helper to run a suite of round-trip checks and return a structured result; useful for dev scripts/tests.
export function runRoundTripSuite(
  items: Array<{ label: string; payload: SharePayload }>
): { ok: boolean; issues: Array<{ label: string; issues: string[] }> } {
  return roundTripValidateMany(items);
}

// Helper to build a payload from a Scenario with explicit fallbacks for missing fields.
export function buildPayloadFromScenario(
  scenario: Scenario,
  fallback: {
    prices: Prices;
    costs: Prices;
    refPrices: Prices;
    features: Features;
    leak: Leakages;
    segments: Segment[];
    optRanges: SearchRanges;
    optConstraints: Constraints;
    priceRange?: { map: TierRangeMap; source: PriceRangeSource } | null;
    channelMix?: ChannelMix;
    uncertainty?: ScenarioUncertainty | null;
    retentionPct?: number;
    retentionMonths?: number;
    kpiFloorAdj?: number;
    tornadoDefaults?: Partial<{
      usePocket: boolean;
      priceBump: number;
      pctBump: number;
      rangeMode: "symmetric" | "data";
      metric: TornadoMetric;
      valueMode: TornadoValueMode;
    }>;
    optimizerKind?: "grid-worker" | "grid-inline" | "future";
  }
): SharePayload {
  const tor = scenario.tornado ?? {};
  const tDef = fallback.tornadoDefaults ?? {};
  const priceRange =
    scenario.priceRange !== undefined
      ? { map: scenario.priceRange, source: scenario.priceRangeSource ?? fallback.priceRange?.source ?? "shared" }
      : fallback.priceRange ?? null;
  return buildSharePayload({
    prices: scenario.prices ?? fallback.prices,
    costs: scenario.costs ?? fallback.costs,
    features: scenario.features ?? fallback.features,
    refPrices: scenario.refPrices ?? scenario.prices ?? fallback.refPrices,
    leak: scenario.leak ?? fallback.leak,
    segments: scenario.segments ?? fallback.segments,
    tornadoPocket: tor.usePocket ?? tDef.usePocket ?? false,
    tornadoPriceBump: tor.priceBump ?? tDef.priceBump ?? 0,
    tornadoPctBump: tor.pctBump ?? tDef.pctBump ?? 0,
    tornadoRangeMode: tor.rangeMode ?? tDef.rangeMode ?? "data",
    tornadoMetric: tor.metric ?? tDef.metric ?? "profit",
    tornadoValueMode: tor.valueMode ?? tDef.valueMode ?? "absolute",
    retentionPct: scenario.retentionPct ?? fallback.retentionPct ?? 0,
    retentionMonths: scenario.retentionMonths ?? fallback.retentionMonths ?? 12,
    kpiFloorAdj: scenario.kpiFloorAdj ?? fallback.kpiFloorAdj ?? 0,
    priceRange,
    optRanges: scenario.optRanges ?? fallback.optRanges,
    optConstraints: scenario.optConstraints ?? fallback.optConstraints,
    channelMix: scenario.channelMix ?? fallback.channelMix ?? [],
    optimizerKind: fallback.optimizerKind ?? "grid-inline",
    uncertainty: scenario.uncertainty ?? fallback.uncertainty ?? null,
  });
}
