/// <reference types="@cloudflare/workers-types" />
// functions/api/save.ts
import { z } from "zod"
import { corsHeaders, type CorsEnv } from "./cors";

export interface Env extends CorsEnv {
  SCENARIOS: KVNamespace
}

const MAX_BODY_BYTES = 120_000; // keep KV payloads small; prevents abuse

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const headers = corsHeaders(request, env, "POST,OPTIONS");
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};

// helper to enforce finite numbers (no NaN/Infinity)
const Num = z.number().finite()
const NonNeg = Num.min(0)
const Pct01 = Num.min(0).max(1)
const Percent100 = Num.min(0).max(100)

const Prices = z.object({
  good: NonNeg, better: NonNeg, best: NonNeg,
})

const TierFlags = z.object({
  good: Pct01, better: Pct01, best: Pct01,
}) // used for featA/featB (0/1) and also promo/volume (% in [0..1])

const Leakages = z.object({
  promo: TierFlags,             // 0..1
  volume: TierFlags,            // 0..1
  paymentPct: Pct01,            // 0..1
  paymentFixed: NonNeg,         // >=0
  fxPct: Pct01,                 // 0..1
  refundsPct: Pct01,            // 0..1
})

const Segment = z.object({
  name: z.string().optional(),
  weight: Pct01, // 0..1, you normalize client-side
  beta: z.object({
    price: Num,
    featA: Num,
    featB: Num,
    refAnchor: Num.optional(),
  })
})

const Range = z
  .object({ min: NonNeg, max: NonNeg })
  .refine((r) => r.max >= r.min, { message: "Range max must be >= min" });
const PriceRange = z.object({
  good: Range.optional(),
  better: Range.optional(),
  best: Range.optional(),
}).partial()

const ChannelMix = z.array(z.object({ preset: z.string(), w: Percent100 })).optional()

const Uncertainty = z
  .object({
    priceScaleDelta: Pct01.optional(),
    leakDeltaPct: Pct01.optional(),
    source: z.enum(["preset", "heuristic", "precomputed", "simulated", "user"]).optional(),
  })
  .passthrough();

const OptConstraints = z.object({
  gapGB: NonNeg.optional(),
  gapBB: NonNeg.optional(),
  marginFloor: Prices.optional(),
  charm: z.boolean().optional(),
  usePocketProfit: z.boolean().optional(),
  usePocketMargins: z.boolean().optional(),
  maxNoneShare: Pct01.optional(),
  minTakeRate: Pct01.optional(),
}).passthrough()

const SearchRanges = z.object({
  good: z.tuple([NonNeg, NonNeg]).optional(),
  better: z.tuple([NonNeg, NonNeg]).optional(),
  best: z.tuple([NonNeg, NonNeg]).optional(),
  step: NonNeg.optional(),
}).passthrough()

const Analysis = z.object({
  tornadoPocket: z.boolean().optional(),
  tornadoPriceBump: NonNeg.optional(),
  tornadoPctBump: NonNeg.optional(),
  tornadoRangeMode: z.enum(["symmetric", "data"]).optional(),
  tornadoMetric: z.string().optional(),
  tornadoValueMode: z.string().optional(),
  retentionPct: Percent100.optional(),
  retentionMonths: NonNeg.optional(),
  kpiFloorAdj: Num.optional(), // can be negative (tighten vs relax floor)
  priceRange: PriceRange.optional(),
  priceRangeSource: z.enum(["synthetic", "imported", "shared"]).optional(),
  optRanges: SearchRanges.optional(),
  optConstraints: OptConstraints.optional(),
  channelMix: ChannelMix,
  uncertainty: Uncertainty.optional(),
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
  uncertainty: Uncertainty.optional(),
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
  const cors = corsHeaders(request, env, "POST,OPTIONS");
  if (!cors) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Body too large" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const raw = await request.text().catch(() => "");
    if (!raw) {
      return new Response(JSON.stringify({ error: "Missing body" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Body too large" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let json: unknown = null;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const parsed = ScenarioSchema.safeParse(json)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid body", issues: parsed.error.issues }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      )
    }
    const scenario: Scenario = parsed.data
    const scenarioJson = JSON.stringify(scenario);
    if (scenarioJson.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Body too large" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Try a few random ids to avoid collisions
    for (let i = 0; i < 5; i++) {
      const id = shortId()
      const exists = await env.SCENARIOS.get(id)
      if (exists) continue

      // Save ~180 days
      await env.SCENARIOS.put(id, scenarioJson, {
        expirationTtl: 60 * 60 * 24 * 180,
      })
      return new Response(JSON.stringify({ id }), { headers: { ...cors, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ error: "Could not allocate id" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
}
