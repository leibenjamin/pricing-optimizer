import { buildScenarioSnapshot, type SnapshotBuildArgs } from "./snapshots";
import type { Constraints, SearchRanges } from "./optimize";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import type { Features, Prices, Segment } from "./segments";
import type { Leakages } from "./waterfall";
import type { TornadoMetric, TornadoValueMode } from "./tornadoView";
import type { ScenarioUncertainty } from "./domain";
import type { RetryConfig } from "./net";
import { csvTemplate } from "./csv";
import { downloadBlob } from "./download";

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
  channelMix?: Array<{ preset: string; w: number }>;
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

export function buildScenarioCsv(payload: SharePayload, template: string = csvTemplate()): string {
  const header = template.split(/\r?\n/)[0]?.split(",") ?? [];
  const setValue = (row: string[], key: string, value: string | number | null | undefined) => {
    const idx = header.findIndex((h) => h.toLowerCase() === key.toLowerCase());
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

export async function saveShortLink(
  payload: SharePayload,
  deps: SaveShortLinkDeps
): Promise<string | null> {
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
      return null;
    }
    const body = (await res.json()) as { id?: string; error?: string };
    if (!body.id) {
      onToast?.("error", body.error ?? "Save failed: missing id");
      return null;
    }
    onToast?.("success", "Short link created");
    return body.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onLog?.(`Save failed: ${msg}`);
    onToast?.("error", `Save failed: ${msg}`);
    return null;
  }
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
