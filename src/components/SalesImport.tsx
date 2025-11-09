// src/components/SalesImport.tsx
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import type { SalesMapping } from "../lib/salesSchema";
import { inferMapping, validateMapping } from "../lib/salesSchema";
import type { LongRow, ParsedResp, SampleResp, ParseReq } from "../workers/salesParser";

type SegmentOut = { name: string; weight: number; beta: { price: number; featA: number; featB: number } };
type Diagnostics = { logLik: number; iters: number; converged: boolean };

export default function SalesImport(props: {
  onApply: (fit: { segments: SegmentOut[]; diagnostics: Diagnostics }) => void;
  onToast?: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const { onApply, onToast } = props;
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<ReadonlyArray<Record<string, string | number | boolean | null | undefined>>>([]);
  const [mapping, setMapping] = useState<SalesMapping>({});
  const [busy, setBusy] = useState(false);
  const fileTextRef = useRef<string>("");

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
      parser.terminate();

      if (!longRows.length) {
        onToast?.("error", "No rows after parsing");
        setBusy(false);
        return;
      }

      // Fit
      const estimator = new Worker(new URL("../workers/estimator.ts", import.meta.url), { type: "module" });
      const fit = await new Promise<{ segments: SegmentOut[]; diagnostics: Diagnostics }>((resolve, reject) => {
        estimator.onmessage = (ev: MessageEvent<import("../workers/estimator").FitResp>) => {
          if (ev.data.kind === "fitDone") {
            resolve({
              segments: ev.data.asSegments,
              diagnostics: { logLik: ev.data.logLik, iters: ev.data.iters, converged: ev.data.converged },
            });
          }
        };
        estimator.onerror = (e) => reject(e);
        estimator.postMessage({ kind: "fit", rows: longRows, ridge: 1e-4, maxIters: 200 });
      });
      estimator.terminate();

      onToast?.("success", "Estimated coefficients from sales data");
      onApply(fit);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast?.("error", msg);
    } finally {
      setBusy(false);
    }
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
            {busy ? "Estimating…" : "Estimate"}
          </button>
          <span className="text-[11px] text-gray-600">
            {busy
              ? "Fitting latent-class model…"
              : !headers.length
              ? "Choose a CSV first."
              : mappingCheck.ok
              ? "Ready to estimate."
              : `Missing: ${mappingCheck.missing.join(", ")}`}
          </span>
        </div>
      </div>
    </div>
  );
}
