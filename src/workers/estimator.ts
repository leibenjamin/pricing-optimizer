/* eslint-disable @typescript-eslint/no-explicit-any */
// src/workers/estimator.ts
import * as MNL from "../lib/mnl";
import type { LongRow } from "./salesParser";

// ---- Public request/response types (what SalesImport expects) ----
export type FitReq = {
  kind: "fit";
  rows: LongRow[];
  ridge?: number;
  maxIters?: number;
  classes?: number; // optional latent classes (1-3)
};

export type FitProgress = { kind: "fitProgress"; iter: number; logLik: number };
export type FitDone = {
  kind: "fitDone";
  asSegments: Array<{ name: string; weight: number; beta: { price: number; featA: number; featB: number } }>;
  logLik: number;
  iters: number;
  converged: boolean;
  trainLogLik?: number;
  testLogLik?: number;
  pseudoR2?: number;
  accuracy?: number;
  dataDiagnostics?: DataDiagnostics;
  chosenK?: number;
};
export type FitError = { kind: "fitError"; error: string };
export type FitResp = FitProgress | FitDone | FitError;

// ---- Soft AltRow typing (parser output) ----
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
  classes?: number;
};

type FitReturn = {
  weights: number[]; // per-class weights
  betas: Array<{ price?: number; featA?: number; featB?: number; good?: number; better?: number; best?: number }>;
  logLik: number;
  iters: number;
  converged: boolean;
};

type DataDiagnostics = {
  observations: number;
  kept: number;
  dropped: number;
  droppedReasons: Record<string, number>;
  multiChosenFixed: number;
  invalidValues: number;
  priceDistinct: { good: number; better: number; best: number };
  avgPrice: { good: number; better: number; best: number };
  empiricalShare: { none: number; good: number; better: number; best: number };
  warnings: string[];
};

// ---- Fitter resolution ----
function resolveFitter() {
  if (typeof (MNL as any).fitLatentClass === "function") {
    return (MNL as any).fitLatentClass as (a: AltRow[], o: FitOpts & { classes: number }) => Promise<FitReturn> | FitReturn;
  }
  if (typeof (MNL as any).fitLC === "function") {
    return (MNL as any).fitLC as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  }
  if (typeof (MNL as any).emFit === "function") {
    return (MNL as any).emFit as (a: AltRow[], o: FitOpts) => Promise<FitReturn> | FitReturn;
  }

  // Fallback: wrap single-class fitMNL into a LC-like shape
  if (typeof (MNL as any).fitMNL === "function") {
    type ParamVec = [number, number, number, number, number, number];
    type FitMnlOpts = { maxIters?: number; tol?: number; ridge?: number };
    type FitMnlRet = { beta: ParamVec; logLik: number; iters: number; converged: boolean };
    const fitMNL = (MNL as any).fitMNL as (rows: AltRow[], init?: ParamVec, opts?: FitMnlOpts) => FitMnlRet;

    const wrapper = async (rows: AltRow[], opts: FitOpts): Promise<FitReturn> => {
      const ret = fitMNL(rows, undefined, { maxIters: opts.maxIters, ridge: opts.ridge });
      const [bGood, bBetter, bBest, bPrice, bFeatA, bFeatB] = ret.beta;
      return {
        weights: [1],
        betas: [{ good: bGood, better: bBetter, best: bBest, price: bPrice, featA: bFeatA, featB: bFeatB }],
        logLik: ret.logLik,
        iters: ret.iters,
        converged: ret.converged,
      };
    };
    return wrapper as (a: AltRow[], o: FitOpts) => Promise<FitReturn>;
  }

  throw new Error("No latent-class fitter found in lib/mnl. Expected fitLatentClass(), fitLC(), emFit(), or fitMNL().");
}

// ---- Helpers ----
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

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Normalize LongRow[] into AltRow[] with strict per-choice-set validation.
 */
function toAltRows(rows: LongRow[]): { alts: AltRow[]; diagnostics: DataDiagnostics } {
  const byObs = new Map<number, { good?: AltRow; better?: AltRow; best?: AltRow }>();
  const droppedReasons: Record<string, number> = { noShown: 0, empty: 0 };
  let multiChosenFixed = 0;
  let invalidValues = 0;
  const priceDistinct: { good: Set<number>; better: Set<number>; best: Set<number> } = {
    good: new Set<number>(),
    better: new Set<number>(),
    best: new Set<number>(),
  };
  const priceTotals: Record<"good" | "better" | "best", { sum: number; n: number }> = {
    good: { sum: 0, n: 0 },
    better: { sum: 0, n: 0 },
    best: { sum: 0, n: 0 },
  };
  const chosenCounts: Record<"none" | "good" | "better" | "best", number> = {
    none: 0,
    good: 0,
    better: 0,
    best: 0,
  };

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
    byObs.set(obsId, entry);
  }

  const out: AltRow[] = [];
  for (const [obsId, alts] of byObs) {
    const g0 = alts.good ?? { obsId, alt: "good", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };
    const bt0 = alts.better ?? { obsId, alt: "better", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };
    const b0 = alts.best ?? { obsId, alt: "best", price: 0, featA: 0, featB: 0, chosen: 0, shown: 1 };

    const fixNum = (n: number) => {
      if (!Number.isFinite(n) || n < 0) {
        invalidValues++;
        return 0;
      }
      return n;
    };

    const g = { ...g0, price: fixNum(g0.price), featA: fixNum((g0 as any).featA ?? 0), featB: fixNum((g0 as any).featB ?? 0) };
    const bt = { ...bt0, price: fixNum(bt0.price), featA: fixNum((bt0 as any).featA ?? 0), featB: fixNum((bt0 as any).featB ?? 0) };
    const b = { ...b0, price: fixNum(b0.price), featA: fixNum((b0 as any).featA ?? 0), featB: fixNum((b0 as any).featB ?? 0) };

    const shownCount = (g.shown ? 1 : 0) + (bt.shown ? 1 : 0) + (b.shown ? 1 : 0);
    if (shownCount === 0) {
      droppedReasons.noShown += 1;
      continue;
    }

    const chosenShown = [
      g.chosen && g.shown ? "good" : null,
      bt.chosen && bt.shown ? "better" : null,
      b.chosen && b.shown ? "best" : null,
    ].filter(Boolean) as Array<"good" | "better" | "best">;

    if (chosenShown.length > 1) {
      multiChosenFixed += 1;
      const keep = chosenShown[0];
      g.chosen = keep === "good" ? 1 : 0;
      bt.chosen = keep === "better" ? 1 : 0;
      b.chosen = keep === "best" ? 1 : 0;
    }

    if (g.shown) { priceDistinct.good.add(g.price); priceTotals.good.sum += g.price; priceTotals.good.n += 1; }
    if (bt.shown) { priceDistinct.better.add(bt.price); priceTotals.better.sum += bt.price; priceTotals.better.n += 1; }
    if (b.shown) { priceDistinct.best.add(b.price); priceTotals.best.sum += b.price; priceTotals.best.n += 1; }

    const hasChoice = (g.chosen === 1 && g.shown) || (bt.chosen === 1 && bt.shown) || (b.chosen === 1 && b.shown);

    const none: AltRow = {
      obsId,
      alt: "none",
      price: 0,
      featA: 0,
      featB: 0,
      chosen: hasChoice ? 0 : 1,
      shown: 1,
    };

    out.push(none, g, bt, b);

    const chosenAlt = hasChoice ? (g.chosen ? "good" : bt.chosen ? "better" : "best") : "none";
    chosenCounts[chosenAlt] += 1;
  }

  out.sort((a, b) => (a.obsId - b.obsId) || orderIndex(a.alt) - orderIndex(b.alt));

  const obsTotal = byObs.size;
  const kept = out.length / 4;
  const dropped = obsTotal - kept;
  const empiricalTotal = Object.values(chosenCounts).reduce((s, v) => s + v, 0) || 1;
  const diagnostics: DataDiagnostics = {
    observations: obsTotal,
    kept,
    dropped,
    droppedReasons,
    multiChosenFixed,
    invalidValues,
    priceDistinct: {
      good: priceDistinct.good.size,
      better: priceDistinct.better.size,
      best: priceDistinct.best.size,
    },
    avgPrice: {
      good: priceTotals.good.n ? priceTotals.good.sum / priceTotals.good.n : 0,
      better: priceTotals.better.n ? priceTotals.better.sum / priceTotals.better.n : 0,
      best: priceTotals.best.n ? priceTotals.best.sum / priceTotals.best.n : 0,
    },
    empiricalShare: {
      none: chosenCounts.none / empiricalTotal,
      good: chosenCounts.good / empiricalTotal,
      better: chosenCounts.better / empiricalTotal,
      best: chosenCounts.best / empiricalTotal,
    },
    warnings: [],
  };

  return { alts: out, diagnostics };
}

function orderIndex(alt: unknown): number {
  const s = String(alt);
  if (s === "none") return 0;
  if (s === "good") return 1;
  if (s === "better") return 2;
  return 3;
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

function blockLogProbMix(
  block: AltRow[],
  weights: number[],
  betas: Array<Record<string, number>>
): { ll: number; predAlt: string; probs: Record<string, number> } {
  const alts = block.filter((r) => r.alt === "none" || r.alt === "good" || r.alt === "better" || r.alt === "best");
  const accum: Record<string, number> = { none: 0, good: 0, better: 0, best: 0 };
  let ll = 0;
  const chosen = alts.find((r) => r.chosen);

  for (let k = 0; k < betas.length; k++) {
    const b = betas[k];
    const betaVec: [number, number, number, number, number, number] = [
      asNumber(b["good"], 0),
      asNumber(b["better"], 0),
      asNumber(b["best"], 0),
      asNumber(b["price"], 0),
      asNumber(b["featA"], 0),
      asNumber(b["featB"], 0),
    ];
    const util = (r: AltRow) => {
      if (r.alt === "none") return 0;
      const intercept = r.alt === "good" ? betaVec[0] : r.alt === "better" ? betaVec[1] : betaVec[2];
      return intercept + betaVec[3] * r.price + betaVec[4] * (r.featA ?? 0) + betaVec[5] * (r.featB ?? 0);
    };
    const denom = alts.reduce((s, r) => {
      if (r.alt !== "none" && r.shown === 0) return s;
      return s + Math.exp(util(r));
    }, 0);
    for (const r of alts) {
      if (r.alt !== "none" && r.shown === 0) continue;
      const p = Math.exp(util(r)) / Math.max(denom, 1e-12);
      accum[r.alt] += weights[k] * p;
    }
    if (chosen) {
      const pChosen = Math.exp(util(chosen)) / Math.max(denom, 1e-12);
      ll += weights[k] * pChosen;
    }
  }

  const probs = accum;
  const predAlt = Object.entries(probs).reduce((best, cur) => (cur[1] > probs[best] ? cur[0] : best), "none");
  const llMix = Math.log(Math.max(ll, 1e-12));
  return { ll: llMix, predAlt, probs };
}

function splitTrainTest(rows: AltRow[], testFrac = 0.2): { train: AltRow[]; test: AltRow[] } {
  const blocks: AltRow[][] = [];
  for (let i = 0; i < rows.length; i += 4) {
    blocks.push(rows.slice(i, i + 4));
  }
  const train: AltRow[] = [];
  const test: AltRow[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const r = Math.abs(Math.sin((i + 1) * 9973)) % 1;
    const dest = r < testFrac ? test : train;
    dest.push(...blocks[i]);
  }
  return { train, test };
}

function pseudoR2(modelLL: number, nullLL: number) {
  if (nullLL === 0) return 0;
  return 1 - modelLL / nullLL;
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
    const K = Math.max(1, Math.min(3, ev.data.classes ?? 1));

    const { alts, diagnostics } = toAltRows(ev.data.rows);
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

    const blocksOk = alts.length % 4 === 0;
    if (!blocksOk) {
      (self as unknown as Worker).postMessage({ kind: "fitError", error: "Parsed data isn't 4-rows-per-choice set. Check mapping." });
      return;
    }

    const onProgress = (iter: number, logLik: number) => {
      const p: FitProgress = { kind: "fitProgress", iter, logLik };
      (self as unknown as Worker).postMessage(p);
    };

    const fitLatent = resolveFitter();
    const { train, test } = splitTrainTest(alts, 0.2);
    const result = await fitLatent(train, { K, ridge, maxIters, onProgress, classes: K } as FitOpts & { classes: number });

    const betas = result.betas ?? [];
    const weights = (result.weights ?? []).map((w) => clamp01(w));
    const wSum = weights.reduce((s, v) => s + v, 0) || 1;
    const normWeights = weights.map((w) => w / wSum);

    const mixLL = (rows: AltRow[]) => {
      let ll = 0;
      let correct = 0;
      let total = 0;
      for (let i = 0; i < rows.length; i += 4) {
        const block = rows.slice(i, i + 4);
        const { ll: llb, predAlt } = blockLogProbMix(block, normWeights, betas as Array<Record<string, number>>);
        const chosen = block.find((r) => r.chosen);
        const chosenAlt = chosen?.alt ?? "none";
        if (predAlt === chosenAlt) correct += 1;
        total += 1;
        ll += llb;
      }
      return { ll, acc: total ? correct / total : 0 };
    };

    const nullLL = (() => {
      let ll = 0;
      for (let i = 0; i < test.length; i += 4) {
        const block = test.slice(i, i + 4);
        const shown = block.filter((r) => r.alt === "none" || r.shown !== 0);
        const p = 1 / Math.max(shown.length, 1);
        ll += Math.log(Math.max(p, 1e-12));
      }
      return ll;
    })();

    const { ll: trainLL } = mixLL(train);
    const { ll: testLL, acc: testAcc } = mixLL(test);
    const pr2 = pseudoR2(testLL, nullLL);

    betas.forEach((b, idx) => {
      if ((b.price ?? 0) > 0) diagnostics.warnings.push(`Segment ${idx + 1}: price coefficient is positive; elasticities may be inverted.`);
    });
    const avgPrice = diagnostics.avgPrice;
    const shares = diagnostics.empiricalShare;
    betas.forEach((b, idx) => {
      const eGood = Math.abs((b.price ?? 0) * avgPrice.good * (1 - shares.good));
      const eBetter = Math.abs((b.price ?? 0) * avgPrice.better * (1 - shares.better));
      const eBest = Math.abs((b.price ?? 0) * avgPrice.best * (1 - shares.best));
      const tooLow = eGood < 0.05 || eBetter < 0.05 || eBest < 0.05;
      const tooHigh = eGood > 10 || eBetter > 10 || eBest > 10;
      if (tooLow || tooHigh) {
        diagnostics.warnings.push(`Segment ${idx + 1}: unusual elasticity magnitude (good ${eGood.toFixed(2)}, better ${eBetter.toFixed(2)}, best ${eBest.toFixed(2)}).`);
      }
    });
    (["good", "better", "best"] as const).forEach((tier) => {
      if (diagnostics.priceDistinct[tier] < 3) {
        diagnostics.warnings.push(`Tier ${tier} has limited price variation (${diagnostics.priceDistinct[tier]} distinct values). Elasticity may be unstable.`);
      }
    });

    const done: FitDone = {
      kind: "fitDone",
      asSegments: toUISegments(result.weights ?? [], result.betas ?? []),
      logLik: Number(result.logLik ?? 0),
      iters: Number(result.iters ?? 0),
      converged: Boolean(result.converged),
      trainLogLik: trainLL,
      testLogLik: testLL,
      pseudoR2: pr2,
      accuracy: testAcc,
      dataDiagnostics: diagnostics,
      chosenK: K,
    };
    (self as unknown as Worker).postMessage(done);
  } catch (e) {
    const err: FitError = { kind: "fitError", error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(err);
  }
};
