/// <reference types="@cloudflare/workers-types" />
// functions/api/save.ts
import { z } from "zod"

// KV binding name must match your Pages binding config: SCENARIOS
export interface Env {
  SCENARIOS: KVNamespace
}

// Reuse your existing Prices:
const Prices = z.object({ good: z.number(), better: z.number(), best: z.number() })

// NEW: analysis knobs we want to persist (make them optional with defaults)
const Analysis = z.object({
  tornadoPocket: z.boolean().default(true),
  tornadoPriceBump: z.number().default(5),
  tornadoPctBump: z.number().default(2),
  retentionPct: z.number().default(92),
  kpiFloorAdj: z.number().default(0),
}).partial() // allow saving only some keys

// Your Scenario schema + leak/segments (mirror your current shapes)
const ScenarioSchema = z.object({
  prices: Prices,
  costs: Prices,
  features: z.object({ featA: Prices, featB: Prices }),
  refPrices: Prices,
  leak: z.object({
    promo: Prices, volume: Prices,
    paymentPct: z.number(), paymentFixed: z.number(),
    fxPct: z.number(), refundsPct: z.number(),
  }),
  segments: z.array(z.object({
    weight: z.number(),
    beta: z.object({
      price: z.number(), featA: z.number(), featB: z.number(),
      refAnchor: z.number().optional()
    })
  })).optional(),

  // NEW:
  analysis: Analysis.optional(),
})
type Scenario = z.infer<typeof ScenarioSchema>

function shortId(len = 7) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // 1) Validate body
    const body = await request.json().catch(() => null)
    const parsed = ScenarioSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid body", issues: parsed.error.issues }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    const scenario: Scenario = parsed.data

    // 2) Try a few random ids to avoid collisions
    for (let i = 0; i < 5; i++) {
      const id = shortId()
      const exists = await env.SCENARIOS.get(id)
      if (exists) continue

      // TTL 180 days (adjust as you like)
      await env.SCENARIOS.put(id, JSON.stringify(scenario), {
        expirationTtl: 60 * 60 * 24 * 180,
      })

      return new Response(JSON.stringify({ id }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ error: "Could not allocate id" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
