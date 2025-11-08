/// <reference lib="webworker" />
// ESTIMATOR WORKER (typed, no any)
// LongRow[] -> MNL fit (via ../lib/mnl) -> single UI segment for now.

import type { LongRow } from "./salesParser";
import * as MNL from "../lib/mnl";

/* ---------------- Types for messages ---------------- */

export type FitReq = {
  kind: "fit";
  rows: LongRow[];
  ridge?: number;
  maxIters?: number;
  tol?: number;
};

export type FitResp = {
  kind: "fitDone";
  asSegments: Array<{
    name: string;
    weight: number;
    beta: { price: number; featA: number; featB: number };
  }>;
  logLik: number;
  iters: number;
  converged: boolean;
};

export type FitErr = {
  kind: "fitErr";
  error: string;
};

/* ---------------- Internal design types ---------------- */

type DesignRow = {
  user?: string;
  alt: "good" | "better" | "best";
  chosen: boolean;
  shown: boolean;
  price: number;
  featA: number;
  featB: number;
};

type FitOptions = {
  ridge?: number;
  maxIters?: number;
  tol?: number;
};

type UnknownFn = (...args: unknown[]) => unknown;

/* ---------------- Utilities (no any) ---------------- */

function toDesign(rows: LongRow[]): DesignRow[] {
  const out: DesignRow[] = [];
  for (const r of rows) {
    out.push({
      user: r.user,
      alt: r.tier,
      chosen: !!r.chosen,
      shown: !!r.shown,
      price: Number.isFinite(r.price) ? r.price : 0,
      featA: r.featA == null ? 0 : Number(r.featA),
      featB: r.featB == null ? 0 : Number(r.featB),
    });
  }
  return out;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function pickCoeffs(result: unknown): { price: number; featA: number; featB: number } {
  // Accept several shapes:
  // 1) { betaPrice, betaFeatA, betaFeatB }
  // 2) { beta: { price, featA, featB } }
  // 3) { coef: { price, featA, featB } }
  if (isObject(result)) {
    const r = result as Record<string, unknown>;
    // shape 1
    const bp = num(r.betaPrice);
    const bA = num(r.betaFeatA);
    const bB = num(r.betaFeatB);
    if (Number.isFinite(bp) || Number.isFinite(bA) || Number.isFinite(bB)) {
      return {
        price: Number.isFinite(bp) ? bp : -0.05,
        featA: Number.isFinite(bA) ? bA : 0.2,
        featB: Number.isFinite(bB) ? bB : 0.2,
      };
    }
    // shape 2 or 3
    const inner = (isObject(r.beta) ? (r.beta as Record<string, unknown>) :
                  isObject(r.coef) ? (r.coef as Record<string, unknown>) : undefined);
    if (inner) {
      const pr = num(inner.price, -0.05);
      const fa = num(inner.featA, 0.2);
      const fb = num(inner.featB, 0.2);
      return { price: pr, featA: fa, featB: fb };
    }
  }
  // defaults if nothing matched
  return { price: -0.05, featA: 0.2, featB: 0.2 };
}

function pickMeta(result: unknown): { logLik: number; iters: number; converged: boolean } {
  if (isObject(result)) {
    const r = result as Record<string, unknown>;
    return {
      logLik: num(r.logLik, 0),
      iters: num(r.iters, 0),
      converged: bool(r.converged, false),
    };
  }
  return { logLik: 0, iters: 0, converged: false };
}

function callMNL(
  design: DesignRow[],
  opts: FitOptions
): { coeffs: { price: number; featA: number; featB: number }; meta: { logLik: number; iters: number; converged: boolean } } {
  // We support a few possible export names/signatures from ../lib/mnl:
  // - fitMNL(design, options)
  // - fitMNL(design, init, options)
  // - fit(design, options)
  // - estimate(design, options)
  const mod = MNL as Record<string, unknown>;
  const cands: Array<[string, UnknownFn]> = [];

  for (const key of ["fitMNL", "fit", "estimate"]) {
    const fn = mod[key];
    if (typeof fn === "function") cands.push([key, fn as UnknownFn]);
  }

  const initGuess: number[] = [1.0, 1.0, 1.0, -0.05, 0.2, 0.2];

  for (const [, fn] of cands) {
    // try (design, options)
    try {
      const out1 = fn(design as unknown as unknown[], opts);
      const coeffs1 = pickCoeffs(out1);
      const meta1 = pickMeta(out1);
      return { coeffs: coeffs1, meta: meta1 };
    } catch {
      // try (design, init, options)
      try {
        const out2 = fn(design as unknown as unknown[], initGuess, opts);
        const coeffs2 = pickCoeffs(out2);
        const meta2 = pickMeta(out2);
        return { coeffs: coeffs2, meta: meta2 };
      } catch {
        // continue to next candidate
      }
    }
  }

  throw new Error("No compatible MNL fit function found in ../lib/mnl");
}

/* ---------------- Worker handler ---------------- */

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<FitReq>) => {
  const req = ev.data;
  if (req.kind !== "fit") return;

  try {
    const design = toDesign(req.rows);
    const opts: FitOptions = {
      ridge: req.ridge ?? 5e-4,
      maxIters: req.maxIters ?? 200,
      tol: req.tol ?? 1e-7,
    };

    const { coeffs, meta } = callMNL(design, opts);

    const resp: FitResp = {
      kind: "fitDone",
      asSegments: [
        {
          name: "Estimated (1-seg)",
          weight: 1,
          beta: { price: coeffs.price, featA: coeffs.featA, featB: coeffs.featB },
        },
      ],
      logLik: meta.logLik,
      iters: meta.iters,
      converged: meta.converged,
    };

    (self as unknown as Worker).postMessage(resp);
  } catch (e) {
    const err: FitErr = { kind: "fitErr", error: (e as Error).message };
    (self as unknown as Worker).postMessage(err);
  }
};
