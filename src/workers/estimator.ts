// src/workers/estimator.ts
/// <reference lib="webworker" />

import type { LongRow } from "./salesParser";

type FitReq = {
  kind: "fit";
  rows: LongRow[];
  ridge?: number;
  maxIters?: number;
};

export type FitResp = {
  kind: "fitDone";
  beta: {
    price: number;
    featA: number;
    featB: number;
    intercept_good: number;
    intercept_better: number;
    intercept_best: number;
  };
  logLik: number;
  iters: number;
  converged: boolean;
  asSegments: Array<{ name: string; weight: number; beta: { price: number; featA: number; featB: number } }>;
};

// ---- Optional: use your existing lib/mnl if present ----
type MnlFitResult = {
  beta: {
    price?: number;
    featA?: number;
    featB?: number;
    intercept_good?: number;
    intercept_better?: number;
    intercept_best?: number;
    [k: string]: unknown;
  };
  logLik: number;
  iters: number;
  converged: boolean;
};

type MnlModule = { fitMNL: (rows: LongRow[], init?: number[] | undefined, opts?: { maxIters?: number; ridge?: number; tol?: number }) => MnlFitResult };

function isMnlModule(x: unknown): x is MnlModule {
  return !!x && typeof x === "object" && typeof (x as Record<string, unknown>).fitMNL === "function";
}

// ---- Local pooled-MNL fallback ----
function softmax4(u: [number, number, number, number]): [number, number, number, number] {
  const mm = Math.max(u[0], u[1], u[2], u[3]);
  const e = u.map((v) => Math.exp(v - mm));
  const s = e[0] + e[1] + e[2] + e[3];
  return [e[0] / s, e[1] / s, e[2] / s, e[3] / s] as [number, number, number, number];
}

async function localFit(rows: LongRow[], ridge = 1e-4, maxIters = 150): Promise<FitResp> {
  // θ = [βp, βA, βB, α_good, α_better, α_best]; none intercept = 0
  const theta = new Float64Array([-0.05, 0.3, 0.25, 0, 0, 0]);
  const lr0 = 0.5;

  const sets = new Map<number, LongRow[]>();
  rows.forEach((r) => {
    const a = sets.get(r.setId);
    if (a) a.push(r);
    else sets.set(r.setId, [r]);
  });

  let prevLL = -Infinity;
  let ll = 0;
  let it = 0;
  let converged = false;

  for (it = 0; it < maxIters; it++) {
    const g = new Float64Array(theta.length);
    ll = 0;

    for (const setRows of sets.values()) {
      const byAlt = {
        none: setRows.find((r) => r.alt === "none"),
        good: setRows.find((r) => r.alt === "good"),
        better: setRows.find((r) => r.alt === "better"),
        best: setRows.find((r) => r.alt === "best"),
      };

      const pg = byAlt.good?.price ?? 0;
      const pb = byAlt.better?.price ?? 0;
      const ph = byAlt.best?.price ?? 0;

      const Ag = byAlt.good?.featA ?? 0;
      const Ab = byAlt.better?.featA ?? 0;
      const Ah = byAlt.best?.featA ?? 0;

      const Bg = byAlt.good?.featB ?? 0;
      const Bb = byAlt.better?.featB ?? 0;
      const Bh = byAlt.best?.featB ?? 0;

      const yg = byAlt.good?.chosen ?? 0;
      const yb = byAlt.better?.chosen ?? 0;
      const yh = byAlt.best?.chosen ?? 0;
      const y0 = byAlt.none?.chosen ?? 0;

      const up = theta[0], uA = theta[1], uB = theta[2];
      const aG = theta[3], aB = theta[4], aH = theta[5];

      const Ug = aG + up * pg + uA * Ag + uB * Bg;
      const Ub = aB + up * pb + uA * Ab + uB * Bb;
      const Uh = aH + up * ph + uA * Ah + uB * Bh;
      const U0 = 0;

      const [p0, pgp, pbp, php] = softmax4([U0, Ug, Ub, Uh]);

      const eps = 1e-12;
      ll += yg * Math.log(pgp + eps) + yb * Math.log(pbp + eps) + yh * Math.log(php + eps) + y0 * Math.log(p0 + eps);

      g[0] += (yg - pgp) * pg + (yb - pbp) * pb + (yh - php) * ph; // βp
      g[1] += (yg - pgp) * Ag + (yb - pbp) * Ab + (yh - php) * Ah; // βA
      g[2] += (yg - pgp) * Bg + (yb - pbp) * Bb + (yh - php) * Bh; // βB
      g[3] += (yg - pgp); // α_good
      g[4] += (yb - pbp); // α_better
      g[5] += (yh - php); // α_best
    }

    // Ridge
    for (let j = 0; j < theta.length; j++) {
      ll -= 0.5 * ridge * theta[j] * theta[j];
      g[j] -= ridge * theta[j];
    }

    const lr = lr0 / Math.sqrt(1 + it);
    for (let j = 0; j < theta.length; j++) theta[j] += lr * g[j];

    if (Math.abs(ll - prevLL) < 1e-6) {
      converged = true;
      break;
    }
    prevLL = ll;
  }

  return {
    kind: "fitDone",
    beta: {
      price: theta[0],
      featA: theta[1],
      featB: theta[2],
      intercept_good: theta[3],
      intercept_better: theta[4],
      intercept_best: theta[5],
    },
    logLik: ll,
    iters: it + 1,
    converged,
    asSegments: [{ name: "Pooled", weight: 1, beta: { price: theta[0], featA: theta[1], featB: theta[2] } }],
  };
}

self.onmessage = async (ev: MessageEvent<FitReq>) => {
  const { kind, rows, ridge = 1e-4, maxIters = 150 } = ev.data;
  if (kind !== "fit") return;

  // Try your lib/mnl.ts (preferred)
  try {
    const modUnknown = await import(/* @vite-ignore */ "../lib/mnl");
    if (isMnlModule(modUnknown)) {
      const fit = modUnknown.fitMNL(rows, undefined, { maxIters, ridge });
      const b = fit.beta ?? {};
      const asSeg = [{ name: "Pooled", weight: 1, beta: { price: Number(b.price ?? 0), featA: Number(b.featA ?? 0), featB: Number(b.featB ?? 0) } }];
      const resp: FitResp = {
        kind: "fitDone",
        beta: {
          price: Number(b.price ?? 0),
          featA: Number(b.featA ?? 0),
          featB: Number(b.featB ?? 0),
          intercept_good: Number(b.intercept_good ?? 0),
          intercept_better: Number(b.intercept_better ?? 0),
          intercept_best: Number(b.intercept_best ?? 0),
        },
        logLik: Number(fit.logLik),
        iters: Number(fit.iters),
        converged: Boolean(fit.converged),
        asSegments: asSeg,
      };
      (self as DedicatedWorkerGlobalScope).postMessage(resp);
      return;
    }
  } catch {
    // fall through to localFit
  }

  const out = await localFit(rows, ridge, maxIters);
  (self as DedicatedWorkerGlobalScope).postMessage(out);
};
