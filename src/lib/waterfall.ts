// src/lib/waterfall.ts
export type Tier = "good" | "better" | "best"

export type TieredPct = Record<Tier, number>

export type Leakages = {
  // tier-specific discounts (fractions 0..1)
  promo: TieredPct
  volume: TieredPct
  // global fees/leakages (fractions 0..1 unless noted)
  paymentPct: number        // e.g., 0.029 (2.9%)
  paymentFixed: number      // e.g., $0.10 per txn
  fxPct: number             // e.g., 0.01 (1%)
  refundsPct: number        // e.g., 0.02 (2% of GMV)
}

export type WaterfallStep = {
  label: string
  delta: number   // negative for leakages; last step "Pocket" is the residual
}

export type PocketResult = {
  pocket: number
  steps: WaterfallStep[]
}

/**
 * Compute pocket price and a sequence of deltas for a waterfall chart.
 * All percentages are fractions (0..1). Order of operations:
 * List → minus promo → minus volume → minus payment (pct+fixed) → minus FX → minus refunds → Pocket
 */
export function computePocketPrice(list: number, tier: Tier, L: Leakages): PocketResult {
  const steps: WaterfallStep[] = []
  let net = list

  // Promo discount (tiered)
  const promo = -round2(list * (L.promo[tier] ?? 0))
  steps.push({ label: "Promo", delta: promo })
  net += promo

  // Volume discount (tiered)
  const volume = -round2(list * (L.volume[tier] ?? 0))
  steps.push({ label: "Volume", delta: volume })
  net += volume

  // Payment fees: percentage of net + fixed per tx
  const payPct = -round2(net * (L.paymentPct ?? 0))
  steps.push({ label: "Payment %", delta: payPct })
  net += payPct

  const payFx = -round2(L.paymentFixed ?? 0)
  steps.push({ label: "Payment $", delta: payFx })
  net += payFx

  // FX spread on net
  const fx = -round2(net * (L.fxPct ?? 0))
  steps.push({ label: "FX", delta: fx })
  net += fx

  // Refunds/chargebacks (simple % of list GMV)
  const refunds = -round2(list * (L.refundsPct ?? 0))
  steps.push({ label: "Refunds", delta: refunds })
  net += refunds

  const pocket = round2(net)
  steps.push({ label: "Pocket", delta: pocket }) // terminal bar (residual)

  return { pocket, steps }
}

function round2(x: number) {
  return Math.round(x * 100) / 100
}
