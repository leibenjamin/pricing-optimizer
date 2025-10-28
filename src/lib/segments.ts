// src/lib/segments.ts
export type Tier = "good" | "better" | "best"

export type Prices = Record<Tier, number>
export type Features = { featA: Prices; featB: Prices }

export type Segment = {
  name: string
  weight: number           // mix weight ∈ [0,1], we’ll normalize so they sum to 1
  betaPrice: number        // < 0 (price sensitivity)
  betaFeatA: number        // > 0
  betaFeatB: number        // > 0
  betaNone: number         // baseline utility for “no purchase”
}

export const defaultSegments: Segment[] = [
  { name: "Price-sensitive", weight: 0.55, betaPrice: -0.22, betaFeatA: 0.40, betaFeatB: 0.20, betaNone: 0.60 },
  { name: "Value-seeker",    weight: 0.35, betaPrice: -0.14, betaFeatA: 0.60, betaFeatB: 0.50, betaNone: 0.20 },
  { name: "Premium",         weight: 0.10, betaPrice: -0.07, betaFeatA: 0.80, betaFeatB: 0.70, betaNone: -0.20 },
]

// Normalizes weights to sum to 1 (and clamps to [0,1]).
export function normalizeWeights(segs: Segment[]): Segment[] {
  const clamped = segs.map(s => ({ ...s, weight: Math.max(0, Math.min(1, s.weight)) }))
  const total = clamped.reduce((a, s) => a + s.weight, 0) || 1
  return clamped.map(s => ({ ...s, weight: s.weight / total }))
}
