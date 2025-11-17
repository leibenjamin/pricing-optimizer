// src/components/SalesImport.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import type { SalesMapping } from "../lib/salesSchema";
import { inferMapping, validateMapping } from "../lib/salesSchema";
import type { LongRow, ParsedResp, SampleResp, ParseReq } from "../workers/salesParser";
import { downloadBlob } from "../lib/download";
import { buildSalesSampleCSV } from "../lib/salesSample";
import { collectPriceRange, hasMeaningfulRange, type TierRangeMap } from "../lib/priceRange";

type PriceKey = "price_good" | "price_better" | "price_best";
type TierKey = "good" | "better" | "best";

const PRICE_KEYS: PriceKey[] = ["price_good", "price_better", "price_best"];
const TIER_KEYS: TierKey[] = ["good", "better", "best"];
const PRICE_LABELS: Record<PriceKey, string> = {
  price_good: "Good price",
  price_better: "Better price",
  price_best: "Best price",
};
const TIER_LABELS: Record<TierKey, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

type SegmentOut = { name: string; weight: number; beta: { price: number; featA: number; featB: number } };
type Diagnostics = { logLik: number; iters: number; converged: boolean };
type FitStats = {
  priceRange?: TierRangeMap;
  priceRangeSource?: "synthetic" | "imported" | "shared";
};

export default function SalesImport(props: {
  onApply: (fit: { segments: SegmentOut[]; diagnostics: Diagnostics; stats?: FitStats }) => void;
  onToast?: (kind: "success" | "error" | "info", msg: string) => void;
  onDone?: () => void;
}) {
  const { onApply, onToast, onDone } = props;
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<ReadonlyArray<Record<string, string | number | boolean | null | undefined>>>([]);
  const [mapping, setMapping] = useState<SalesMapping>({});
  const [busy, setBusy] = useState(false);
  const fileTextRef = useRef<string>("");
  const choiceSelectRef = useRef<HTMLSelectElement | null>(null);

  type Offenders = { bad: number; total: number; first3: number[] };

  const [preflight, setPreflight] = useState<{
    rows: number;
    approxChoices: number;
    approxNone: number;
    priceQuality: Partial<Record<PriceKey, Offenders>>;
    priceRange: Partial<Record<PriceKey, { min: number; max: number }>>;
    shownShare: Partial<Record<TierKey, { shown: number; total: number }>>;
  } | null>(null);

  const shownUnmapped = useMemo(
    () => !mapping.shown_good && !mapping.shown_better && !mapping.shown_best,
    [mapping.shown_good, mapping.shown_better, mapping.shown_best]
  );

  const handleDownloadSample = useCallback(() => {
    const csv = buildSalesSampleCSV(200);
    downloadBlob(csv, "sales_sample.csv", "text/csv;charset=utf-8");
    onToast?.("info", "Downloaded sample sales CSV (Good/Better/Best with shown_* flags)");
  }, [onToast]);

  const normalizeChoiceCell = (v: unknown): ("good" | "better" | "best" | "none") | null => {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (!s) return null;
    if (s === "none" || s === "0" || s === "-" || s === "n") return "none";
    if (s === "good" || s === "g" || s === "1") return "good";
    if (s === "better" || s === "b" || s === "2") return "better";
    if (s === "best" || s === "3") return "best";
    return null;
  };

  const toShownFlag = (v: unknown): 0 | 1 => {
    if (v === 0 || v === "0" || v === false) return 0;
    if (v == null || v === "") return 1;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "0" || s === "no" || s === "false") return 0;
    }
    const n = Number(v);
    if (Number.isFinite(n)) return n > 0 ? 1 : 0;
    return 1;
  };

  function handleFile(f: File) {
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      fileTextRef.current = text;

      const p = Papa.parse<Record<string, string | number | boolean | null | undefined>>(text, {
        header: true,
        preview: 50,
        dynamicTyping: true,
        skipEmptyLines: true,
      });
      setHeaders(p.meta.fields ?? []);
      setSample((p.data ?? []).slice(0, 5));
      setMapping(inferMapping(p.meta.fields ?? []));
      onToast?.("info", `Loaded ${f.name}. Map columns, then Estimate.`);
    };
    reader.readAsText(f);
  }

  const mappingCheck = useMemo(() => validateMapping(headers, mapping), [headers, mapping]);

  async function runEstimate() {
    if (!mappingCheck.ok) {
      onToast?.("error", mappingCheck.missing.join("\n"));
      return;
    }
    setBusy(true);
    try {
      // Parse to long rows
      const parser = new Worker(new URL("../workers/salesParser.ts", import.meta.url), { type: "module" });
      const longRows: LongRow[] = await new Promise((resolve, reject) => {
        parser.onmessage = (ev: MessageEvent<ParsedResp | SampleResp>) => {
          if (ev.data.kind === "rows") resolve(ev.data.longRows);
        };
        parser.onerror = (e) => reject(e);
        const req: ParseReq = { kind: "parse", text: fileTextRef.current, mapping };
        parser.postMessage(req);
      });
      const chosenCount = longRows.reduce((s, r) => s + (r.chosen ? 1 : 0), 0);
      if (chosenCount === 0) {
        onToast?.("error", "No chosen alternatives in the dataset. Check the 'choice' mapping and values (expect good/better/best or 1/2/3). Rows with choice='none' are ignored.");
        setBusy(false);
        return;
      }
      parser.terminate();

      if (!longRows.length) {
        onToast?.("error", "No rows after parsing");
        setBusy(false);
        return;
      }

      // Fit
      const estimator = new Worker(new URL("../workers/estimator.ts", import.meta.url), { type: "module" });

      const fit = await new Promise<{ segments: SegmentOut[]; diagnostics: Diagnostics }>((resolve, reject) => {
        // Start a watchdog and make sure we CLEAR it in every exit path
        const watchdog = window.setTimeout(() => {
          // terminate rarely throws; no try/catch block to avoid no-empty lint
          estimator.terminate();
          reject(new Error("Estimator timed out (45s). Try a smaller CSV or check column mapping."));
        }, 45_000);

        const finishOk = (segments: SegmentOut[], diagnostics: Diagnostics) => {
          window.clearTimeout(watchdog);
          estimator.terminate();
          resolve({ segments, diagnostics });
        };

        const finishErr = (err: unknown) => {
          window.clearTimeout(watchdog);
          estimator.terminate();
          reject(err instanceof Error ? err : new Error(String(err)));
        };

        estimator.onmessage = (ev: MessageEvent<import("../workers/estimator").FitResp>) => {
          const msg = ev.data;
          if (msg.kind === "fitProgress") {
            // optional — comment this out if it’s too chatty
            onToast?.("info", `Fitting… iter ${msg.iter} (ll≈${Math.round(msg.logLik)})`);
            return;
          }
          if (msg.kind === "fitError") {
            finishErr(new Error(msg.error));
            return;
          }
          if (msg.kind === "fitDone") {
            finishOk(
              msg.asSegments,
              { logLik: msg.logLik, iters: msg.iters, converged: msg.converged }
            );
          }
        };

        estimator.onerror = (e) => finishErr(e);
        estimator.postMessage({ kind: "fit", rows: longRows, ridge: 1e-4, maxIters: 200 });
      });


      const priceRangeByTier = collectPriceRange(longRows);
      const hasRange = hasMeaningfulRange(priceRangeByTier);

      onToast?.("success", "Estimated coefficients from sales data");
      onApply({
        ...fit,
        stats: hasRange
          ? {
              priceRange: priceRangeByTier,
              priceRangeSource: "imported",
            }
          : undefined,
      });
      onDone?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast?.("error", msg);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!headers.length || !fileTextRef.current) {
      setPreflight(null);
      return;
    }

    // Build quick index lookup
    const H = new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]));
    const idx = (name?: string) =>
      name ? H.get(name.trim().toLowerCase()) ?? -1 : -1;

    const I = {
      choice: idx(mapping.choice),
      price: {
        price_good: idx(mapping.price_good),
        price_better: idx(mapping.price_better),
        price_best: idx(mapping.price_best),
      } as Record<PriceKey, number>,
      shown: {
        good: idx(mapping.shown_good),
        better: idx(mapping.shown_better),
        best: idx(mapping.shown_best),
      } as Record<TierKey, number>,
    };

    // Parse just enough for diagnostics (no dynamic typing; we want to inspect raw cells)
    const text = fileTextRef.current;
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      setPreflight({
        rows: 0,
        approxChoices: 0,
        approxNone: 0,
        priceQuality: {},
        priceRange: {},
        shownShare: {},
      });
      return;
    }

    // Lightweight CSV: we already used Papa for header; reuse it here for body
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
    });

    const rows = (parsed.data as string[][]).slice(1); // drop header row
    const priceQuality: Partial<Record<PriceKey, Offenders>> = {};
    const priceRange: Partial<Record<PriceKey, { min: number; max: number }>> = {};
    (Object.keys(I.price) as PriceKey[]).forEach((k) => {
      const col = I.price[k];
      if (col < 0) return;
      let bad = 0, total = 0;
      const first3: number[] = [];
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r][col];
        if (cell == null || String(cell).trim() === "") continue; // blank doesn't count against quality
        total++;
        const num = Number(cell);
        if (!Number.isFinite(num)) {
          bad++;
          if (first3.length < 3) first3.push(r + 2); // +2 => 1 for header, 1 for 1-indexed rows
        } else {
          const stats = priceRange[k];
          if (!stats) {
            priceRange[k] = { min: num, max: num };
          } else {
            stats.min = Math.min(stats.min, num);
            stats.max = Math.max(stats.max, num);
          }
        }
      }
      priceQuality[k] = { bad, total, first3 };
    });

    let approxChoices = 0;
    let approxNone = 0;
    if (I.choice >= 0) {
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r][I.choice];
        const choice = normalizeChoiceCell(cell);
        if (choice) {
          approxChoices++;
          if (choice === "none") approxNone++;
        }
      }
    }

    const shownShare: Partial<Record<TierKey, { shown: number; total: number }>> = {};
    (["good", "better", "best"] as TierKey[]).forEach((tier) => {
      const col = I.shown[tier];
      if (col < 0) return;
      let shown = 0;
      let total = 0;
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r][col];
        if (cell == null || String(cell).trim() === "") continue;
        total++;
        shown += toShownFlag(cell);
      }
      shownShare[tier] = { shown, total };
    });

    setPreflight({
      rows: rows.length,
      approxChoices,
      approxNone,
      priceQuality,
      priceRange,
      shownShare,
    });
  }, [headers, mapping]);

  const fmtCurrency = (n: number | null | undefined) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "--";
    const decimals = Math.abs(n) >= 100 ? 0 : 2;
    return `$${n.toFixed(decimals)}`;
  };

  const diagWarnings = useMemo(() => {
    if (!preflight) return [];
    const warnings: string[] = [];
    if (preflight.rows > 0 && preflight.approxChoices === 0) {
      warnings.push("No recognizable choices yet. Check the choice column mapping or values.");
    }
    if (preflight.approxChoices > 0) {
      const noneShare = preflight.approxNone / preflight.approxChoices;
      if (noneShare > 0.7) {
        warnings.push(`Choice column is ${Math.round(noneShare * 100)}% "none" -- is that expected?`);
      }
    }
    PRICE_KEYS.forEach((k) => {
      const range = preflight.priceRange?.[k];
      if (!range) return;
      if (Math.abs(range.max - range.min) < 0.01) {
        warnings.push(`${PRICE_LABELS[k]} looks constant at ${fmtCurrency(range.min)}. Double-check mapping.`);
      }
    });
    TIER_KEYS.forEach((tier) => {
      const stats = preflight.shownShare?.[tier];
      if (!stats || stats.total === 0) return;
      const share = stats.shown / stats.total;
      if (share < 0.8) {
        warnings.push(`${TIER_LABELS[tier]} shown only ${Math.round(share * 100)}% of mapped rows.`);
      }
    });
    return warnings;
  }, [preflight]);

  function pct(bad: number, total: number) {
    if (!total) return 0;
    return Math.round((100 * bad) / total);
  }

  const nonePct = useMemo(() => {
    if (!preflight || preflight.approxChoices === 0) return null;
    return (preflight.approxNone / Math.max(1, preflight.approxChoices)) * 100;
  }, [preflight]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 cursor-pointer">
          Upload sales CSV
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
        <button
          className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={!mappingCheck.ok || !headers.length || busy}
          onClick={runEstimate}
        >
          {busy ? "Estimating…" : "Estimate"}
        </button>
      </div>

      <p className="text-[11px] text-gray-600">
        Map columns, then click <b>Estimate</b>. We’ll show row counts and basic data quality before fitting.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700">
        <div className="flex-1 min-w-[220px]">
          Need data? Download the sample CSV (200 choice occasions with Good/Better/Best prices, features, and shown_* flags).
        </div>
        <button
          type="button"
          className="text-xs border border-blue-500 text-blue-600 px-3 py-1.5 rounded bg-white hover:bg-blue-50 whitespace-nowrap"
          onClick={handleDownloadSample}
        >
          Download sample
        </button>
      </div>

      {/* Mapping UI */}
      {headers.length > 0 && (
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs min-w-[440px]">
          {[
            "choice",
            "price_good",
            "price_better",
            "price_best",
            "featA_good",
            "featA_better",
            "featA_best",
            "featB_good",
            "featB_better",
            "featB_best",
            "shown_good",
            "shown_better",
            "shown_best",
            "user",
            "timestamp",
          ].map((k) => (
            <div key={k} className="flex items-center gap-1">
              <label className="w-36 text-right text-gray-600">{k}</label>
              <select
                ref={k === "choice" ? choiceSelectRef : undefined}
                className="flex-1 border rounded px-1 py-0.5"
                value={(mapping as Record<string, string | undefined>)[k] ?? ""}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    [k]: e.target.value || undefined,
                  }))
                }
              >
                <option value="">—</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
          </div>          
        </div>
      )}

      {/* Sample preview */}
      {sample.length > 0 && (
        <div className="border rounded p-2 overflow-auto text-xs max-h-48 bg-white">
          <div className="font-semibold mb-1">Sample (first 5 rows)</div>
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="border px-1 py-0.5 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td key={h} className="border px-1 py-0.5">
                      {String(r[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!mappingCheck.ok && (
            <div className="mt-2 text-red-600">
              {mappingCheck.missing.map((m) => (
                <div key={m}>• {m}</div>
              ))}
            </div>
          )}
          {shownUnmapped && (
            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Assuming <b>shown=1</b> (all options visible) because no <code>shown_*</code> columns are mapped.
            </div>
          )}
        </div>
      )}

      {preflight && (
        <div className="border rounded p-3 bg-slate-50 text-[11px] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-gray-800">
            <span>Diagnostics snapshot</span>
            <span className="text-[10px] text-gray-500">
              {preflight.rows.toLocaleString()} rows scanned
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase text-gray-500">Choice occasions</div>
              <div className="text-sm font-semibold text-gray-800">
                {preflight.approxChoices.toLocaleString()}
              </div>
              <div className="text-[10px] text-gray-600">
                {preflight.rows
                  ? `${((preflight.approxChoices / Math.max(1, preflight.rows)) * 100).toFixed(1)}% of rows`
                  : "No rows yet"}
                {preflight.approxChoices > 0 && (
                  <>
                    {" · "}
                    {((preflight.approxNone / Math.max(1, preflight.approxChoices)) * 100).toFixed(1)}% "none"
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">“None” share</div>
              <div className="text-sm font-semibold text-gray-800">
                {nonePct == null ? "—" : `${nonePct.toFixed(1)}%`}
              </div>
              <div className="text-[10px] text-gray-600">
                {preflight.approxNone.toLocaleString()} of{" "}
                {preflight.approxChoices.toLocaleString()} recognized choices
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Quick take</div>
              <div className="text-sm font-semibold text-gray-800">
                {diagWarnings.length === 0 ? "Looks reasonable" : "Needs attention"}
              </div>
              {diagWarnings.length > 0 && (
                <div className="text-[10px] text-amber-700">
                  {diagWarnings.length} potential issue{diagWarnings.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {PRICE_KEYS.map((k) => {
              const stats = preflight.priceRange?.[k];
              if (!stats) {
                return (
                  <div key={k}>
                    <div className="text-[10px] uppercase text-gray-500">{PRICE_LABELS[k]}</div>
                    <div className="text-sm font-semibold text-gray-800">Not mapped</div>
                  </div>
                );
              }
              const span = Math.max(0, stats.max - stats.min);
              return (
                <div key={k}>
                  <div className="text-[10px] uppercase text-gray-500">{PRICE_LABELS[k]}</div>
                  <div className="text-sm font-semibold text-gray-800">
                    {`${fmtCurrency(stats.min)} — ${fmtCurrency(stats.max)}`}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {span === 0 ? "No variance detected" : `Span Δ${fmtCurrency(span)}`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {TIER_KEYS.map((tier) => {
              const stats = preflight.shownShare?.[tier];
              const share =
                stats && stats.total > 0 ? Math.round((stats.shown / stats.total) * 100) : null;
              const detail =
                stats && stats.total > 0
                  ? `${stats.shown.toLocaleString()} of ${stats.total.toLocaleString()} rows`
                  : shownUnmapped
                  ? "No shown_* columns mapped"
                  : "Not mapped";
              return (
                <div key={tier}>
                  <div className="text-[10px] uppercase text-gray-500">{TIER_LABELS[tier]} shown</div>
                  <div className="text-sm font-semibold text-gray-800">
                    {share == null
                      ? shownUnmapped
                        ? "Assuming 100%"
                        : "Not mapped"
                      : `${share}% of rows`}
                  </div>
                  <div className="text-[10px] text-gray-500">{detail}</div>
                </div>
              );
            })}
          </div>

          {diagWarnings.length > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 space-y-0.5">
              {diagWarnings.map((msg, idx) => (
                <div key={`${msg}-${idx}`}>⚠ {msg}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom actions (sticky inside card) */}
      <div className="mt-3 border-t pt-2 sticky bottom-0 bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="text-xs md:text-sm border px-3 py-1.5 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
            disabled={!mappingCheck.ok || !headers.length || busy}
            onClick={runEstimate}
          >
            {busy
              ? "Estimating…"
              : preflight && mappingCheck.ok
              ? `Estimate (${preflight.rows.toLocaleString()} rows, ~${preflight.approxChoices.toLocaleString()} with choice)`
              : "Estimate"}
          </button>

          {/* Friendly live status */}
          <span className="text-[11px] text-gray-600">
            {busy
              ? "Fitting latent-class model…"
              : !headers.length
              ? "Choose a CSV first."
              : !mappingCheck.ok
              ? `Missing: ${mappingCheck.missing.join(", ")}`
              : preflight
              ? "Ready to estimate."
              : "Mapping looks OK."}
          </span>

          {/* Quick helpers */}
          <button
            type="button"
            className="ml-2 text-[11px] underline text-blue-600"
            onClick={() => choiceSelectRef.current?.focus()}
          >
            Check “choice” column mapping
          </button>
        </div>

        {/* Guard rails: price column quality */}
        {preflight && (
          <div className="mt-2 text-[11px] space-y-1">
            {(["price_good","price_better","price_best"] as const).map((k) => {
              const q = preflight.priceQuality[k];
              if (!q || q.total === 0) return null;
              const p = pct(q.bad, q.total);
              if (p <= 10) return null; // warn only if >10% non-numeric
              return (
                <div key={k} className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <b>{k}</b>: {p}% non-numeric across {q.total} filled cells
                  {q.first3.length ? ` (e.g., row ${q.first3.join(", ")})` : ""}.
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
