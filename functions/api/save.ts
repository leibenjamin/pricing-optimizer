/// <reference types="@cloudflare/workers-types" />
// functions/api/save.ts
import { z } from "zod"

export interface Env {
  SCENARIOS: KVNamespace
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

// helper to enforce finite numbers (no NaN/Infinity)
const Num = z.number().finite()

const Prices = z.object({
  good: Num, better: Num, best: Num,
})

const TierFlags = z.object({
  good: Num, better: Num, best: Num,
}) // used for featA/featB (0/1) and also promo/volume (% in [0..1])

const Leakages = z.object({
  promo: TierFlags,             // 0..1
  volume: TierFlags,            // 0..1
  paymentPct: Num,              // 0..1
  paymentFixed: Num,            // >=0
  fxPct: Num,                   // 0..1
  refundsPct: Num,              // 0..1
})

const Segment = z.object({
  name: z.string().optional(),
  weight: Num, // 0..1, you normalize client-side
  beta: z.object({
    price: Num,
    featA: Num,
    featB: Num,
    refAnchor: Num.optional(),
  })
})

const Range = z.object({ min: Num, max: Num })
const PriceRange = z.object({
  good: Range.optional(),
  better: Range.optional(),
  best: Range.optional(),
}).partial()

const ChannelMix = z.array(z.object({ preset: z.string(), w: Num })).optional()

const OptConstraints = z.object({
  gapGB: Num.optional(),
  gapBB: Num.optional(),
  marginFloor: Prices.optional(),
  charm: z.boolean().optional(),
  usePocketProfit: z.boolean().optional(),
  usePocketMargins: z.boolean().optional(),
  maxNoneShare: Num.optional(),
  minTakeRate: Num.optional(),
}).passthrough()

const SearchRanges = z.object({
  good: z.tuple([Num, Num]).optional(),
  better: z.tuple([Num, Num]).optional(),
  best: z.tuple([Num, Num]).optional(),
  step: Num.optional(),
}).passthrough()

const Analysis = z.object({
  tornadoPocket: z.boolean().optional(),
  tornadoPriceBump: Num.optional(),
  tornadoPctBump: Num.optional(),
  tornadoRangeMode: z.enum(["symmetric", "data"]).optional(),
  tornadoMetric: z.string().optional(),
  tornadoValueMode: z.string().optional(),
  retentionPct: Num.optional(),
  retentionMonths: Num.optional(),
  kpiFloorAdj: Num.optional(),
  priceRange: PriceRange.optional(),
  priceRangeSource: z.enum(["synthetic", "imported", "shared"]).optional(),
  optRanges: SearchRanges.optional(),
  optConstraints: OptConstraints.optional(),
  channelMix: ChannelMix,
  uncertainty: z.any().optional(),
  optimizerKind: z.enum(["grid-worker", "grid-inline", "future"]).optional(),
}).passthrough() // allow future keys

const ScenarioSchema = z.object({
  prices: Prices,
  costs: Prices,
  features: z.object({ featA: TierFlags, featB: TierFlags }),
  refPrices: Prices,
  leak: Leakages,
  segments: z.array(Segment).optional(),
  channelMix: ChannelMix,
  uncertainty: z.any().optional(),
  analysis: Analysis.optional(),
}).passthrough() // allow extra keys so future expansions don't break

type Scenario = z.infer<typeof ScenarioSchema>

// short id generator
function shortId(len = 7) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const json = await request.json().catch(() => null)
    const parsed = ScenarioSchema.safeParse(json)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid body", issues: parsed.error.issues }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }
    const scenario: Scenario = parsed.data

    // Try a few random ids to avoid collisions
    for (let i = 0; i < 5; i++) {
      const id = shortId()
      const exists = await env.SCENARIOS.get(id)
      if (exists) continue

      // Save ~180 days
      await env.SCENARIOS.put(id, JSON.stringify(scenario), {
        expirationTtl: 60 * 60 * 24 * 180,
      })
      return new Response(JSON.stringify({ id }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ error: "Could not allocate id" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
}
