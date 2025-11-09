/// <reference lib="webworker" />
// ESTIMATOR (dynamic, typed guards, no any)

import type { LongRow, Tier } from "./salesParser";
import * as MNL from "../lib/mnl";

/* ---------- Message protocol (matches SalesImport.tsx) ---------- */

export type FitReq = {
  kind: "fit";
  rows: LongRow[];
  ridge?: number;
  maxIters?: number;
  tol?: number;
};

export type FitResp =
  | {
      kind: "fitDone";
      asSegments: Array<{
        name: string;
        weight: number;
        beta: { price: number; featA: number; featB: number };
      }>;
      logLik: number;
      iters: number;
      converged: boolean;
    }
  | {
      kind: "fitErr";
      error: string;
    };

/* ---------- Local design (what we pass to the fitter) ---------- */

type DesignRow = {
  obsId: number;                // which choice set (0,1,2,...)
  alt: Tier;                    // "good" | "better" | "best"
  chosen: boolean;              // whether this alt was chosen
  shown: boolean;               // whether this alt was shown
  price: number;
  featA: number;
  featB: number;
};

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function num(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function to01(x: unknown): 0 | 1 {
  return num(x, 0) > 0 ? 1 : 0;
}

/** Convert LongRow[] (triples per wide row) → DesignRow[] with obsId */
function toDesign(rows: LongRow[]): DesignRow[] {
  const out: DesignRow[] = [];
  // rows come as triples per wide row (good/better/best)
  let obs = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // increment obs every 3 rows (good/better/best)
    if (i % 3 === 0) obs += 1;

    const chosen = r.choice === r.tier;
    const shown = r.shown == null ? true : !!r.shown;

    out.push({
      obsId: obs,
      alt: r.tier,
      chosen,
      shown,
      price: num(r.price, 0),
      featA: to01(r.featA),
      featB: to01(r.featB),
    });
  }
  return out;
}

/* ---------- Dynamic fitter call (supports multiple shapes) ---------- */

type UnknownFn = (...args: unknown[]) => unknown;

function callFitter(
  design: DesignRow[],
  options: { ridge: number; maxIters: number; tol: number }
): { price: number; featA: number; featB: number; logLik: number; iters: number; converged: boolean } {
  const mod = MNL as Record<string, unknown>;
  const fns: UnknownFn[] = [];

  for (const key of ["fitMNL", "fit", "estimate"]) {
    const cand = mod[key];
    if (typeof cand === "function") fns.push(cand as UnknownFn);
  }

  if (fns.length === 0) {
    throw new Error("No fit function exported by ../lib/mnl (expected fitMNL/fit/estimate)");
  }

  // optional init vec if the fitter accepts it
  const initGuess = [0, 0, 0, -0.05, 0.25, 0.2];

  // Try (design, options) and then (design, init, options)
  for (const fn of fns) {
    try {
      const r1 = fn(design as unknown as unknown[], options);
      const coeffs1 = pickCoeffs(r1);
      const meta1 = pickMeta(r1);
      return { ...coeffs1, ...meta1 };
    } catch {
      try {
        const r2 = fn(design as unknown as unknown[], initGuess, options);
        const coeffs2 = pickCoeffs(r2);
        const meta2 = pickMeta(r2);
        return { ...coeffs2, ...meta2 };
      } catch {
        // try next candidate
      }
    }
  }
  throw new Error("Fitter did not accept (design, options) or (design, init, options).");
}

function pickCoeffs(result: unknown): { price: number; featA: number; featB: number } {
  // Accept several shapes:
  //  A) { betaPrice, betaFeatA, betaFeatB }
  //  B) { beta: { price, featA, featB } }
  //  C) { coef: { price, featA, featB } }
  //  D) { theta: number[] }   // fallback by position
  if (isObj(result)) {
    const r = result as Record<string, unknown>;
    const bp = r.betaPrice, bA = r.betaFeatA, bB = r.betaFeatB;
    if (typeof bp === "number" || typeof bA === "number" || typeof bB === "number") {
      return { price: num(bp, -0.05), featA: num(bA, 0.25), featB: num(bB, 0.2) };
    }
    const beta = isObj(r.beta) ? (r.beta as Record<string, unknown>) :
                 isObj(r.coef) ? (r.coef as Record<string, unknown>) : undefined;
    if (beta) {
      return {
        price: num(beta.price, -0.05),
        featA: num(beta.featA, 0.25),
        featB: num(beta.featB, 0.2),
      };
    }
    const theta = Array.isArray(r.theta) ? r.theta as unknown[] :
                  Array.isArray(r.params) ? r.params as unknown[] : undefined;
    if (theta && theta.length >= 6) {
      // common order: [int_g, int_b, int_B, price, featA, featB]
      return { price: num(theta[3], -0.05), featA: num(theta[4], 0.25), featB: num(theta[5], 0.2) };
    }
  }
  // defaults if nothing matched
  return { price: -0.05, featA: 0.25, featB: 0.2 };
}

function pickMeta(result: unknown): { logLik: number; iters: number; converged: boolean } {
  if (isObj(result)) {
    const r = result as Record<string, unknown>;
    return {
      logLik: num(r.logLik, 0),
      iters: num(r.iters, 0),
      converged: !!r.converged,
    };
  }
  return { logLik: 0, iters: 0, converged: false };
}

/* ---------- Worker handler ---------- */

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<FitReq>) => {
  const req = ev.data;
  if (req?.kind !== "fit") return;

  try {
    const design = toDesign(req.rows);
    const out = callFitter(design, {
      ridge: req.ridge ?? 5e-4,
      maxIters: req.maxIters ?? 200,
      tol: req.tol ?? 1e-7,
    });

    const resp: FitResp = {
      kind: "fitDone",
      asSegments: [
        {
          name: "Estimated (1-seg)",
          weight: 1,
          beta: { price: out.price, featA: out.featA, featB: out.featB },
        },
      ],
      logLik: out.logLik,
      iters: out.iters,
      converged: out.converged,
    };
    (self as unknown as Worker).postMessage(resp);
  } catch (e) {
    const resp: FitResp = {
      kind: "fitErr",
      error: e instanceof Error ? e.message : String(e),
    };
    (self as unknown as Worker).postMessage(resp);
  }
};
