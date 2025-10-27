export type JournalEntry = { t: string; msg: string }

export function now() {
  const d = new Date()
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function formatPriceChange(tier: "good"|"better"|"best", from: number, to: number) {
  return `[${now()}] ${tier} price: $${from} → $${to}`
}

export function formatCostChange(tier: "good"|"better"|"best", from: number, to: number) {
  return `[${now()}] ${tier} cost: $${from} → $${to}`
}

export function formatToggle(name: string, tier: "good"|"better"|"best", on: boolean) {
  return `[${now()}] ${name} ${tier}: ${on ? "ON" : "OFF"}`
}
