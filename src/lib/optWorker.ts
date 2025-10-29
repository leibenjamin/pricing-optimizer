import type { Constraints, SearchRanges } from "./optimize"
import type { Prices, Features, Segment } from "./segments"
import type { OptimizeIn, OptimizeOut } from "../workers/optimizer"

// Spawns a worker for one run; returns a cancel() to kill it if a new run starts.
export function runOptimizeInWorker(args: Omit<OptimizeIn, "runId"> & { runId: number }) {
  const worker = new Worker(new URL("../workers/optimizer.ts", import.meta.url), { type: "module" })

  let settled = false

  const promise = new Promise<{ prices: Prices; profit: number }>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<OptimizeOut>) => {
      const data = ev.data
      if (data.runId !== args.runId) {
        // stale reply from an older run; ignore but terminate
        worker.terminate()
        return
      }
      settled = true
      worker.terminate()
      if (data.ok) resolve({ prices: data.prices, profit: data.profit })
      else reject(new Error(data.error))
    }
    worker.onerror = (err) => {
      if (!settled) {
        settled = true
        worker.terminate()
        reject(new Error(`Worker crashed: ${String(err.message || err)}`))
      }
    }
    worker.postMessage(args)
  })

  const cancel = () => {
    if (!settled) {
      settled = true
      worker.terminate()
    }
  }

  return { promise, cancel }
}

// Re-export types if you want them in App
export type { Constraints, SearchRanges, Prices, Features, Segment }
