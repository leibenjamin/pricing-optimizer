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
  // Preferred latent-class names
  if (typeof (MNL as any).fitLatentClass === "function") {
    return (MNL as any).fitLatentClass as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  }
  if (typeof (MNL as any).fitLC === "function") {
    return (MNL as any).fitLC as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  }
  if (typeof (MNL as any).emFit === "function") {
    return (MNL as any).emFit as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  }

  // ✅ SINGLE-CLASS ADAPTER: accept fitMNL(rows, init?, opts?) and wrap as 1-class result
  if (typeof (MNL as any).fitMNL === "function") {
    type ParamVec = [number, number, number, number, number, number]; // bGood, bBetter, bBest, bPrice, bFeatA, bFeatB
    type FitMnlOpts = { maxIters?: number; tol?: number; ridge?: number };
    type FitMnlRet = { beta: ParamVec; logLik: number; iters: number; converged: boolean };
    const fitMNL = (MNL as any).fitMNL as (rows: AltRow[], init?: ParamVec, opts?: FitMnlOpts) => FitMnlRet;

    const wrapper = async (rows: AltRow[], opts: FitOpts): Promise<FitReturn> => {
      // map FitOpts → FitMnlOpts
      const ret = fitMNL(rows, undefined, { maxIters: opts.maxIters, ridge: opts.ridge });
      const [bG, bBt, bB, bPrice, bFeatA, bFeatB] = ret.beta;
      return {
        weights: [1],
        betas: [{ price: bPrice, featA: bFeatA, featB: bFeatB }],
        logLik: ret.logLik,
        iters: ret.iters,
        converged: ret.converged,
      };
    };
    return wrapper as (a: AltRow[], o: FitOpts) => Promise<FitReturn>;
  }

  throw new Error("No latent-class fitter found in lib/mnl. Expected fitLatentClass(), fitLC(), emFit(), or fitMNL().");
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
  // Group incoming rows by obsId and collect product alts
  const byObs = new Map<number, { good?: AltRow; better?: AltRow; best?: AltRow }>();

  for (const r of rows as unknown as Array<Record<string, unknown>>) {
    const obsId = asNumber(r["obsId"], 0);
    const alt = String(r["alt"] ?? "good").toLowerCase();
    const entry = byObs.get(obsId) ?? {};
    const ar: AltRow = {
      obsId,
      alt,
      price: asNumber(r["price"], 0),
      featA: asNumber(r["featA"], 0),
      featB: asNumber(r["featB"], 0),
      chosen: coerceBool01(r["chosen"] ?? 0),
      shown: coerceBool01(r["shown"] ?? 1),
    };
    if (alt === "good") entry.good = ar;
    else if (alt === "better") entry.better = ar;
    else if (alt === "best") entry.best = ar;
    // ignore anything else (parser only emits these three)
    byObs.set(obsId, entry);
  }

  // For each observation, synthesize the 4th alt ("none") and order: none, good, better, best
  const out: AltRow[] = [];
  for (const [obsId, alts] of byObs) {
    const g = alts.good ?? { obsId, alt: "good", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };
    const bt = alts.better ?? { obsId, alt: "better", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };
    const b = alts.best ?? { obsId, alt: "best", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };
    const hasChoice = (g.chosen === 1) || (bt.chosen === 1) || (b.chosen === 1);

    // Synthetic "none": chosen=1 only if none of the three was chosen.
    const none: AltRow = {
      obsId,
      alt: "none",
      price: 0,
      featA: 0,
      featB: 0,
      chosen: hasChoice ? 0 : 1,
      shown: 1,
    };

    // Push in the exact order expected by fitMNL (4 consecutive rows per obs)
    out.push(none, g, bt, b);
  }

  // IMPORTANT: ensure blocks are contiguous by sorting by obsId and then by our desired order within each block
  out.sort((a, b) => (a.obsId - b.obsId) || orderIndex(a.alt) - orderIndex(b.alt));
  return out;
}

function orderIndex(alt: unknown): number {
  const s = String(alt);
  if (s === "none") return 0;
  if (s === "good") return 1;
  if (s === "better") return 2;
  return 3; // best
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

  {
    const rows = ev.data.rows ?? [];
    const anyChosen = rows.some((r) => Number((r as { chosen?: unknown }).chosen) === 1);
    if (!anyChosen) {
      (self as unknown as Worker).postMessage(
        { kind: "fitError", error: "No chosen alternatives in the dataset." } as { kind: "fitError"; error: string }
      );
      return;
    }
  }

  try {
    const ridge = ev.data.ridge ?? 1e-4;
    const maxIters = ev.data.maxIters ?? 200;
    // If we only have fitMNL, we still call it — wrapper returns 1-class.
    // So K can be ignored by the wrapper; leave it available for future LC.
    const K = 1; // ev.data.classes ?? 1;

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
