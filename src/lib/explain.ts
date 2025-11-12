// src/lib/explain.ts

/**
 * Central dictionary for short, product-ready HTML snippets that explain KPIs
 * and charts. Keep these brief (2–5 lines), non-technical, and consistent.
 *
 * Safe to inject into InfoTip because content is maintained by us.
 * If you ever take user input, sanitize before passing to InfoTip.
 */
export const EXPLAIN: Record<string, string> = {
  // --- KPI strip ---
  "kpi.revenue": `
    <b>Revenue</b> is the model’s projected gross sales dollars for N customers
    at the current ladder. It’s the integral of take-rates × prices across tiers.<br>
    <i>Tip:</i> sanity-check take-rates before optimizing.`,

  "kpi.profit": `
    <b>Profit</b> (contribution) = Σ (units<sub>tier</sub> × (price − cost)).<br>
    Enable <i>pocket margins/profit</i> if you want downstream leakage
    (promo, payment fees, FX, refunds) netted out before profit.`,

  "kpi.active": `
    <b>Active customers</b> = N × (1 − share<sub>none</sub>). This reflects the
    utility of the outside option in the logit. If too low/high, revisit β<sub>none</sub>.`,

  "kpi.arpu": `
    <b>ARPU (active)</b> = Revenue ÷ Active customers. Conditional on purchasers
    (not all visitors). Useful when conversion is similar but tier mix differs.`,

  "kpi.gm": `
    <b>Gross margin</b> = Profit ÷ Revenue. If pocket pricing is enabled, this
    uses pocket prices; otherwise list prices. Beware rounding on small N.`,

  // --- Charts ---
  "chart.frontier": `
    <b>Profit frontier</b> sweeps one tier’s price (x) while holding others fixed,
    plotting projected profit (y). Each dot is a full mixed-logit evaluation.<br>
    <i>Tip:</i> set gaps/margin floors before reading the frontier.`,

  "chart.takeRate": `
    <b>Take-rate bars</b> show segment-mixed shares {None, Good, Better, Best}.
    Shares come from a multinomial logit over segments; anchoring/loss-aversion
    apply if reference prices are set.`,

  "chart.waterfall": `
    <b>Pocket price waterfall</b> starts from list price and subtracts leakages
    (promo, payment, FX, refunds) to show <i>pocket</i>. Toggle “Use pocket margins”
    to enforce floors on pocket, not list.`,

  "chart.tornado": `
    <b>Tornado sensitivity</b> varies one factor at a time around a base case and
    shows profit deltas (low/high). Use it to spot which inputs matter most; validate
    ranges with business owners before decisions.`,

  // --- Presets ---
  "presets.scenario": `
    <b>Scenario presets</b> apply a coherent bundle: list prices, costs,
    reference prices (for anchoring), and typical leakages. Use these to
    start from a realistic baseline that matches a business model.<br>
    <i>Tip:</i> after applying a scenario, you can still adjust any field.`,
  "presets.waterfall": `
    <b>Leak presets</b> only change downstream leakages (promo, payment,
    FX, refunds). They do <i>not</i> modify prices, costs, or reference
    prices. Use these to test how platform fees or discounts shift pocket
    price and margin floors.`,

};

/** Small helper to avoid undefined keys and to keep JSX tidy. */
export function explain(id: string): string {
  return EXPLAIN[id] ?? `<b>Coming soon</b>: explanation for “${id}”.`;
}

/** (kept) Your utility helpers for diagnostics */
export function explainGaps(
  prices: { good: number; better: number; best: number },
  gaps: { gapGB: number; gapBB: number }
) {
  const gb = prices.better - prices.good;
  const bb = prices.best - prices.better;
  const binds: string[] = [];
  if (gb <= gaps.gapGB + 1e-6) binds.push(`Better−Good gap binding (=${gb.toFixed(2)}, floor ${gaps.gapGB})`);
  if (bb <= gaps.gapBB + 1e-6) binds.push(`Best−Better gap binding (=${bb.toFixed(2)}, floor ${gaps.gapBB})`);
  return binds;
}

export function topDriver(
  tornadoRows: { name: string; deltaLow: number; deltaHigh: number }[]
) {
  if (!tornadoRows.length) return null;
  const withMag = tornadoRows.map(r => ({
    ...r,
    mag: Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh)),
  }));
  withMag.sort((a, b) => b.mag - a.mag);
  const t = withMag[0];
  const dir = Math.abs(t.deltaHigh) >= Math.abs(t.deltaLow) ? "up" : "down";
  const amt = Math.round(Math.max(Math.abs(t.deltaLow), Math.abs(t.deltaHigh)));
  return `${t.name} (${dir}): ±$${amt}`;
}
