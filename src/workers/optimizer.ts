/// <reference lib="webworker" />

import { gridSearch, type Constraints, type SearchRanges } from "../lib/optimize"
import type { Prices, Features, Segment } from "../lib/segments"
import type { Leakages } from "../lib/waterfall"

export type OptimizeIn = {
  ranges: SearchRanges
  costs: Prices
  feats: Features
  segs: Segment[]
  refPrices?: Prices
  N: number
  C: Constraints
  leak?: Leakages
  runId: number            // used to ignore stale responses
}

export type OptimizeOut =
  | { ok: true; runId: number; prices: Prices; profit: number }
  | { ok: false; runId: number; error: string }

self.onmessage = (ev: MessageEvent<OptimizeIn>) => {
  const msg = ev.data
  try {
    const best = gridSearch(msg.ranges, msg.costs, msg.feats, msg.segs, msg.refPrices, msg.N, msg.C, msg.leak)
    const out: OptimizeOut = { ok: true, runId: msg.runId, prices: best.prices, profit: best.profit }
    ;(self as unknown as Worker).postMessage(out)
  } catch (e) {
    const err = e instanceof Error ? e.message : "Worker error"
    const out: OptimizeOut = { ok: false, runId: msg.runId, error: err }
    ;(self as unknown as Worker).postMessage(out)
  }
}
