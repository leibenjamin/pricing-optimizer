/* eslint-disable @typescript-eslint/no-explicit-any */
// src/workers/estimator.ts
import * as MNL from "../lib/mnl"; // don't guess named exports; import * and feature-detect
import type { LongRow } from "./salesParser";

// ---- Public request/response types (what SalesImport expects) ----
export type FitReq = {
  kind: "fit";
  rows: LongRow[];
  ridge?: number;
  maxIters?: number;
  classes?: number; // optional, defaults to 2 or 3
};

export type FitProgress = { kind: "fitProgress"; iter: number; logLik: number };
export type FitDone = {
  kind: "fitDone";
  asSegments: Array<{ name: string; weight: number; beta: { price: number; featA: number; featB: number } }>;
  logLik: number;
  iters: number;
  converged: boolean;
};
export type FitError = { kind: "fitError"; error: string };
export type FitResp = FitProgress | FitDone | FitError;

// ---- We don't know your exact AltRow/Param types — define soft-typing here ----
type AltRow = {
  obsId: number;
  alt: string;
  price: number;
  featA?: number;
  featB?: number;
  chosen: boolean | 0 | 1;
  shown?: boolean | 0 | 1;
};

type FitOpts = {
  K: number;
  ridge: number;
  maxIters: number;
  onProgress?: (iter: number, logLik: number) => void;
};

type FitReturn = {
  weights: number[]; // per-class weights
  betas: Array<{ price?: number; featA?: number; featB?: number }>;
  logLik: number;
  iters: number;
  converged: boolean;
};

// Try to locate a fitter function in ../lib/mnl with a compatible signature.
function resolveFitter() {
  // Preferred: fitLatentClass(alts, opts)
  if (typeof (MNL as any).fitLatentClass === "function") return (MNL as any).fitLatentClass as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  // Fallbacks you might have named differently:
  if (typeof (MNL as any).fitLC === "function") return (MNL as any).fitLC as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  if (typeof (MNL as any).emFit === "function") return (MNL as any).emFit as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;

  throw new Error("No latent-class fitter found in lib/mnl. Expected fitLatentClass(), fitLC(), or emFit().");
}

// ---- Convert whatever LongRow the parser gives us into AltRow[] ----
function coerceBool01(v: unknown): 0 | 1 {
  if (v === 1 || v === true) return 1;
  if (v === 0 || v === false) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? 1 : 0;
}

function asNumber(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Two parser variants we've seen:
 *  (A) Row-per-alternative:
 *      { obsId, alt, price, featA, featB, chosen, shown, ... }
 *  (B) One row with alts array:
 *      { obsId, alts: [{alt, price, ...}, ...], ... }
 */
function toAltRows(rows: LongRow[]): AltRow[] {
  const out: AltRow[] = [];

  for (const r of rows as unknown as Array<Record<string, unknown>>) {
    const obsId = asNumber(r["obsId"], 0);

    if (Array.isArray((r as any).alts)) {
      // Variant B: has alts array
      const alts = (r as any).alts as Array<Record<string, unknown>>;
      for (const a of alts) {
        out.push({
          obsId,
          alt: String(a["alt"] ?? "good"),
          price: asNumber(a["price"], 0),
          featA: asNumber(a["featA"], 0),
          featB: asNumber(a["featB"], 0),
          chosen: coerceBool01(a["chosen"] ?? 0),
          shown: coerceBool01(a["shown"] ?? 1),
        });
      }
    } else {
      // Variant A: row per alternative
      out.push({
        obsId,
        alt: String(r["alt"] ?? "good"),
        price: asNumber(r["price"], 0),
        featA: asNumber(r["featA"], 0),
        featB: asNumber(r["featB"], 0),
        chosen: coerceBool01(r["chosen"] ?? 0),
        shown: coerceBool01(r["shown"] ?? 1),
      });
    }
  }

  return out;
}

function toUISegments(weights: number[], betas: Array<Record<string, unknown>>): FitDone["asSegments"] {
  const names = ["Price-sensitive", "Value", "Premium"];
  return betas.map((b, i) => ({
    name: names[i] ?? `Segment ${i + 1}`,
    weight: Number(weights[i] ?? 0),
    beta: {
      price: asNumber(b["price"], 0),
      featA: asNumber(b["featA"], 0),
      featB: asNumber(b["featB"], 0),
    },
  }));
}

self.onmessage = async (ev: MessageEvent<FitReq>) => {
  if (!ev.data || ev.data.kind !== "fit") return;

  try {
    const ridge = ev.data.ridge ?? 1e-4;
    const maxIters = ev.data.maxIters ?? 200;
    const K = ev.data.classes ?? 2;

    const alts = toAltRows(ev.data.rows);
    if (!alts.length) {
      const err: FitError = { kind: "fitError", error: "No alternatives derived from parsed rows." };
      (self as unknown as Worker).postMessage(err);
      return;
    }
    if (!alts.some((a) => coerceBool01(a.chosen) === 1)) {
      const err: FitError = { kind: "fitError", error: "No chosen alternatives in the dataset." };
      (self as unknown as Worker).postMessage(err);
      return;
    }

    const onProgress = (iter: number, logLik: number) => {
      const p: FitProgress = { kind: "fitProgress", iter, logLik };
      (self as unknown as Worker).postMessage(p);
    };

    const fitLatent = resolveFitter();
    const result = await fitLatent(alts, { K, ridge, maxIters, onProgress } as FitOpts);

    const done: FitDone = {
      kind: "fitDone",
      asSegments: toUISegments(result.weights ?? [], result.betas ?? []),
      logLik: Number(result.logLik ?? 0),
      iters: Number(result.iters ?? 0),
      converged: Boolean(result.converged),
    };
    (self as unknown as Worker).postMessage(done);
  } catch (e) {
    const err: FitError = { kind: "fitError", error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(err);
  }
};
