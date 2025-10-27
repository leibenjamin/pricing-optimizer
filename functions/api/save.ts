/// <reference types="@cloudflare/workers-types" />
// functions/api/save.ts
import { z } from "zod"

// KV binding name must match your Pages binding config: SCENARIOS
export interface Env {
  SCENARIOS: KVNamespace
}

// Schema for the scenario we store
const Prices = z.object({ good: z.number(), better: z.number(), best: z.number() })
const ScenarioSchema = z.object({
  prices: Prices,
  costs: Prices,
  features: z.object({ featA: Prices, featB: Prices }),
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
