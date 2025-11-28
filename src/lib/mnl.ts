// src/lib/mnl.ts
import type { AltRow, Alt } from "./simulate"

export type ParamVec = [number, number, number, number, number, number] // bGood, bBetter, bBest, bPrice, bFeatA, bFeatB
const ALTS: Alt[] = ["none","good","better","best"]

type MaybeShown = AltRow & { shown?: number | boolean }
const isShown = (r: MaybeShown) => r.shown === 0 || r.shown === false ? false : true

function utilAlt(alt: Alt, row: AltRow, b: ParamVec) {
  const [bG,bBt,bB,bP,bA,bF] = b
  if (alt === "none") return 0
  const intercept = alt === "good" ? bG : alt === "better" ? bBt : bB
  return intercept + bP*row.price + bA*row.featA + bF*row.featB
}

function softmaxDenom4(rows: MaybeShown[], i: number, b: ParamVec) {
  const id = rows[i].obsId
  let s = 0
  for (let k=0;k<4;k++){
    const r = rows[i+k]
    if (r.obsId !== id) break
    if (!isShown(r)) continue
    s += Math.exp(utilAlt(r.alt,r,b))
  }
  return s
}

function prob(r: AltRow, b: ParamVec, denom: number) {
  return Math.exp(utilAlt(r.alt,r,b)) / denom
}

export function logLik(rows: AltRow[], b: ParamVec, ridge=0, obsWeights?: number[]): number {
  const blocks = rows.length / 4
  let ll = 0
  for (let i=0;i<rows.length;i+=4){
    const w = obsWeights && obsWeights.length === blocks ? obsWeights[i/4] : 1
    if (w <= 0) continue
    const denom = softmaxDenom4(rows as MaybeShown[],i,b)
    for (let k=0;k<4;k++){
      const r = rows[i+k]
      if (!isShown(r as MaybeShown)) continue
      if (r.chosen) ll += w * Math.log(Math.max(prob(r,b,denom), 1e-12))
    }
  }
  if (ridge>0) {
    const pen = b.reduce((s,v)=>s+v*v,0)
    ll -= ridge*pen
  }
  return ll
}

export function grad(rows: AltRow[], b: ParamVec, ridge=0, obsWeights?: number[]): ParamVec {
  const blocks = rows.length / 4
  const g: ParamVec = [0,0,0,0,0,0]
  for (let i=0;i<rows.length;i+=4){
    const w = obsWeights && obsWeights.length === blocks ? obsWeights[i/4] : 1
    if (w <= 0) continue
    const denom = softmaxDenom4(rows as MaybeShown[],i,b)
    let eGood=0,eBetter=0,eBest=0,eP=0,eA=0,eF=0
    for (let k=0;k<4;k++){
      const r = rows[i+k]; const p = prob(r,b,denom)
      if (!isShown(r as MaybeShown)) continue
      if (r.alt==="good") eGood += p
      if (r.alt==="better") eBetter += p
      if (r.alt==="best") eBest += p
      eP += p*r.price; eA += p*r.featA; eF += p*r.featB
    }
    let cGood=0,cBetter=0,cBest=0,cP=0,cA=0,cF=0
    for (let k=0;k<4;k++){
      const r = rows[i+k]
      if (r.chosen){
        if (r.alt==="good") cGood=1
        if (r.alt==="better") cBetter=1
        if (r.alt==="best") cBest=1
        cP=r.price; cA=r.featA; cF=r.featB
      }
    }
    g[0]+= w*(cGood-eGood)
    g[1]+= w*(cBetter-eBetter)
    g[2]+= w*(cBest-eBest)
    g[3]+= w*(cP-eP)
    g[4]+= w*(cA-eA)
    g[5]+= w*(cF-eF)
  }
  if (ridge>0){
    for (let j=0;j<6;j++) g[j] -= 2*ridge*b[j]
  }
  return g
}

export interface FitResult { beta: ParamVec; logLik: number; iters: number; converged: boolean }

export type FitOptions = { maxIters?: number; tol?: number; ridge?: number; obsWeights?: number[] }

export function fitMNL(rows: AltRow[], init?: ParamVec, opts?: FitOptions): FitResult {
  const maxIters = opts?.maxIters ?? 200
  const tol = opts?.tol ?? 1e-6
  const ridge = opts?.ridge ?? 1e-3
  const obsWeights = opts?.obsWeights
  let b: ParamVec = init ?? [0.3,0.6,0.5,-0.03,0.1,0.08]
  let lastLL = -Infinity
  for (let it=0; it<maxIters; it++){
    const ll = logLik(rows,b,ridge,obsWeights)
    const g = grad(rows,b,ridge,obsWeights)
    // backtracking line search
    let step = 0.1, improved = false, cand: ParamVec = b
    for (let bt=0; bt<20; bt++){
      const trial = b.map((v,j)=>v+step*g[j]) as ParamVec
      const tll = logLik(rows, trial, ridge, obsWeights)
      if (tll > ll){
        cand = trial as ParamVec
        lastLL = tll
        improved = true
        break
      }
      step *= 0.5
    }
    b = cand
    const gnorm = Math.hypot(...g)
    if (!improved || gnorm < tol) {
      return { beta: b, logLik: lastLL===-Infinity? ll : lastLL, iters: it+1, converged: true }
    }
  }
  return { beta: b, logLik: lastLL, iters: maxIters, converged: false }
}

export interface Scenario {
  price: { good:number; better:number; best:number }
  featA: { good:number; better:number; best:number }
  featB: { good:number; better:number; best:number }
}

export function predictProbs(beta: ParamVec, s: Scenario){
  const rows: AltRow[] = ALTS.map((alt)=>({
    obsId:0, alt,
    price: alt==="none"?0: alt==="good"? s.price.good : alt==="better"? s.price.better : s.price.best,
    featA: alt==="none"?0: alt==="good"? s.featA.good : alt==="better"? s.featA.better : s.featA.best,
    featB: alt==="none"?0: alt==="good"? s.featB.good : alt==="better"? s.featB.better : s.featB.best,
    chosen:0
  }))
  let denom=0; for (const r of rows) denom += Math.exp(utilAlt(r.alt,r,beta))
  const out: Record<Alt,number> = { none:0, good:0, better:0, best:0 }
  for (const r of rows) out[r.alt] = Math.exp(utilAlt(r.alt,r,beta))/denom
  return out
}

export type LatentClassResult = {
  weights: number[];
  betas: Array<Record<string, number>>;
  ll: number;
  iters: number;
  converged: boolean;
};

type Block = [AltRow, AltRow, AltRow, AltRow];

function blockLogLik(block: Block, beta: ParamVec): number {
  const denom = softmaxDenom4(block as MaybeShown[], 0, beta);
  let ll = 0;
  for (const r of block) {
    if (!isShown(r as MaybeShown)) continue;
    if (r.chosen) {
      ll = Math.log(Math.max(prob(r, beta, denom), 1e-12));
      break;
    }
  }
  return ll;
}

function splitBlocks(rows: AltRow[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < rows.length; i += 4) {
    out.push([rows[i], rows[i + 1], rows[i + 2], rows[i + 3]]);
  }
  return out;
}

export function fitLatentClass(rows: AltRow[], opts: FitOptions & { classes?: number; onProgress?: (iter: number, ll: number) => void }): LatentClassResult {
  const K = Math.max(1, Math.min(3, opts.classes ?? 1));
  if (K === 1) {
    const base = fitMNL(rows, undefined, opts);
    return {
      weights: [1],
      betas: [
        {
          good: base.beta[0],
          better: base.beta[1],
          best: base.beta[2],
          price: base.beta[3],
          featA: base.beta[4],
          featB: base.beta[5],
        },
      ],
      ll: base.logLik,
      iters: base.iters,
      converged: base.converged,
    };
  }

  const ridge = opts.ridge ?? 1e-3;
  const maxIters = opts.maxIters ?? 50;
  const blocks = splitBlocks(rows);
  const n = blocks.length;

  // init: base fit + jitter per class
  const base = fitMNL(rows, undefined, { ridge, maxIters: Math.min(100, maxIters) });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const betas: ParamVec[] = Array.from({ length: K }, (_) =>
    base.beta.map((v, j) => v + (Math.random() - 0.5) * 0.05 * (j === 3 ? 4 : 1)) as ParamVec
  );
  const weights = Array(K).fill(1 / K);

  const resp: number[][] = Array.from({ length: n }, () => Array(K).fill(1 / K));

  let lastLL = -Infinity;
  let converged = false;
  let iter = 0;

  const totalLL = (betaSet: ParamVec[], wts: number[]): number => {
    let ll = 0;
    for (const block of blocks) {
      let maxLog = -Infinity;
      const logs = betaSet.map((b, k) => {
        const l = Math.log(Math.max(wts[k], 1e-9)) + blockLogLik(block, b);
        if (l > maxLog) maxLog = l;
        return l;
      });
      const denom = logs.reduce((s, l) => s + Math.exp(l - maxLog), 0);
      ll += maxLog + Math.log(Math.max(denom, 1e-12));
    }
    return ll;
  };

  for (iter = 0; iter < maxIters; iter++) {
    // E-step: responsibilities
    for (let i = 0; i < n; i++) {
      const block = blocks[i];
      let maxLog = -Infinity;
      const logs = betas.map((b, k) => {
        const l = Math.log(Math.max(weights[k], 1e-9)) + blockLogLik(block, b);
        if (l > maxLog) maxLog = l;
        return l;
      });
      const denom = logs.reduce((s, l) => s + Math.exp(l - maxLog), 0);
      for (let k = 0; k < K; k++) {
        resp[i][k] = Math.exp(logs[k] - maxLog) / Math.max(denom, 1e-12);
      }
    }

    // M-step: update weights
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += resp[i][k];
      weights[k] = sum / Math.max(n, 1);
    }

    // M-step: update betas via weighted fits
    for (let k = 0; k < K; k++) {
      const obsWeights = resp.map((r) => r[k]);
      const fit = fitMNL(rows, betas[k], { ridge, maxIters: Math.max(50, maxIters), tol: opts.tol ?? 1e-6, obsWeights });
      betas[k] = fit.beta;
    }

    const ll = totalLL(betas, weights);
    opts.onProgress?.(iter + 1, ll);
    if (Math.abs(ll - lastLL) < 1e-4) {
      converged = true;
      lastLL = ll;
      break;
    }
    lastLL = ll;
  }

  return {
    weights,
    betas: betas.map((b) => ({
      good: b[0],
      better: b[1],
      best: b[2],
      price: b[3],
      featA: b[4],
      featB: b[5],
    })),
    ll: lastLL,
    iters: iter + 1,
    converged,
  };
}
