// src/components/SalesImport.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import type { SalesMapping } from "../lib/salesSchema";
import { inferMapping, validateMapping } from "../lib/salesSchema";
import type { LongRow, ParsedResp, SampleResp, ParseReq } from "../workers/salesParser";
import { csvTemplate } from "../lib/csv";

type SegmentOut = { name: string; weight: number; beta: { price: number; featA: number; featB: number } };
type Diagnostics = { logLik: number; iters: number; converged: boolean };

export default function SalesImport(props: {
  onApply: (fit: { segments: SegmentOut[]; diagnostics: Diagnostics }) => void;
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

  type PriceKey = "price_good" | "price_better" | "price_best";
  type Offenders = { bad: number; total: number; first3: number[] };

  const [preflight, setPreflight] = useState<{
    rows: number;
    approxChoices: number;
    priceQuality: Partial<Record<PriceKey, Offenders>>;
  } | null>(null);

  const shownUnmapped = useMemo(
    () => !mapping.shown_good && !mapping.shown_better && !mapping.shown_best,
    [mapping.shown_good, mapping.shown_better, mapping.shown_best]
  );

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


      onToast?.("success", "Estimated coefficients from sales data");
      onApply(fit);
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
    };

    // Parse just enough for diagnostics (no dynamic typing; we want to inspect raw cells)
    const text = fileTextRef.current;
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      setPreflight({ rows: 0, approxChoices: 0, priceQuality: {} });
      return;
    }

    // Lightweight CSV: we already used Papa for header; reuse it here for body
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
    });

    const rows = (parsed.data as string[][]).slice(1); // drop header row
    const approxChoiceOK = (v: unknown) => {
      if (v == null) return false;
      const s = String(v).trim().toLowerCase();
      return s === "good" || s === "better" || s === "best" || s === "1" || s === "2" || s === "3";
    };

    const priceQuality: Partial<Record<PriceKey, Offenders>> = {};
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
        }
      }
      priceQuality[k] = { bad, total, first3 };
    });

    let approxChoices = 0;
    if (I.choice >= 0) {
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r][I.choice];
        if (approxChoiceOK(cell)) approxChoices++;
      }
    }

    setPreflight({
      rows: rows.length,
      approxChoices,
      priceQuality,
    });
  }, [headers, mapping]);

  function pct(bad: number, total: number) {
    if (!total) return 0;
    return Math.round((100 * bad) / total);
  }

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
          <button
            type="button"
            className="text-[11px] underline text-blue-600"
            onClick={() => {
              const blob = new Blob([csvTemplate()], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "scenario_template.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 500);
            }}
          >
            Open sample CSV
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
