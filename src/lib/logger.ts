// src/lib/logger.ts
export const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export const formatPriceChange = (tier: string, from: number, to: number) =>
  `[${now()}] ${tier} price: $${from} → $${to}`

export const formatCostChange = (tier: string, from: number, to: number) =>
  `[${now()}] ${tier} cost: $${from} → $${to}`

export const formatToggle = (feat: string, tier: string, on: boolean) =>
  `[${now()}] ${feat} ${tier}: ${on ? "ON" : "OFF"}`
