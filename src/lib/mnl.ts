// src/lib/mnl.ts
import type { AltRow, Alt } from "./simulate"

export type ParamVec = [number, number, number, number, number, number] // bGood, bBetter, bBest, bPrice, bFeatA, bFeatB
const ALTS: Alt[] = ["none","good","better","best"]

function utilAlt(alt: Alt, row: AltRow, b: ParamVec) {
  const [bG,bBt,bB,bP,bA,bF] = b
  if (alt === "none") return 0
  const intercept = alt === "good" ? bG : alt === "better" ? bBt : bB
  return intercept + bP*row.price + bA*row.featA + bF*row.featB
}

function softmaxDenom4(rows: AltRow[], i: number, b: ParamVec) {
  const id = rows[i].obsId
  let s = 0
  for (let k=0;k<4;k++){
    const r = rows[i+k]
    if (r.obsId !== id) break
    s += Math.exp(utilAlt(r.alt,r,b))
  }
  return s
}

function prob(r: AltRow, b: ParamVec, denom: number) {
  return Math.exp(utilAlt(r.alt,r,b)) / denom
}

export function logLik(rows: AltRow[], b: ParamVec, ridge=0): number {
  let ll = 0
  for (let i=0;i<rows.length;i+=4){
    const denom = softmaxDenom4(rows,i,b)
    for (let k=0;k<4;k++){
      const r = rows[i+k]
      if (r.chosen) ll += Math.log(Math.max(prob(r,b,denom), 1e-12))
    }
  }
  if (ridge>0) {
    const pen = b.reduce((s,v)=>s+v*v,0)
    ll -= ridge*pen
  }
  return ll
}

export function grad(rows: AltRow[], b: ParamVec, ridge=0): ParamVec {
  const g: ParamVec = [0,0,0,0,0,0]
  for (let i=0;i<rows.length;i+=4){
    const denom = softmaxDenom4(rows,i,b)
    let eGood=0,eBetter=0,eBest=0,eP=0,eA=0,eF=0
    for (let k=0;k<4;k++){
      const r = rows[i+k]; const p = prob(r,b,denom)
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
    g[0]+= cGood-eGood
    g[1]+= cBetter-eBetter
    g[2]+= cBest-eBest
    g[3]+= cP-eP
    g[4]+= cA-eA
    g[5]+= cF-eF
  }
  if (ridge>0){
    for (let j=0;j<6;j++) g[j] -= 2*ridge*b[j]
  }
  return g
}

export interface FitResult { beta: ParamVec; logLik: number; iters: number; converged: boolean }

export function fitMNL(rows: AltRow[], init?: ParamVec, opts?: {maxIters?:number; tol?:number; ridge?:number}): FitResult {
  const maxIters = opts?.maxIters ?? 200
  const tol = opts?.tol ?? 1e-6
  const ridge = opts?.ridge ?? 1e-3
  let b: ParamVec = init ?? [0.3,0.6,0.5,-0.03,0.1,0.08]
  let lastLL = -Infinity
  for (let it=0; it<maxIters; it++){
    const ll = logLik(rows,b,ridge)
    const g = grad(rows,b,ridge)
    // backtracking line search
    let step = 0.1, improved = false, cand: ParamVec = b
    for (let bt=0; bt<20; bt++){
      const trial = b.map((v,j)=>v+step*g[j]) as ParamVec
      const tll = logLik(rows, trial, ridge)
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
