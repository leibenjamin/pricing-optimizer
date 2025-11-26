// src/lib/explain.ts
import type { Prices } from "./segments";
import { computePocketPrice, type Leakages, type Tier } from "./waterfall";

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
  "waterfall.step.list": `
    <b>List price</b> is the sticker/quote price before any discounts or downstream
    leakages. Every step in the waterfall nets down from this anchor.`,
  "waterfall.step.promo": `
    <b>Promo</b> captures deal-level discounts or incentives (coupon codes,
    discretionary markdowns). Entered per tier so Good/Better/Best can have
    different promotional intensity.`,
  "waterfall.step.volume": `
    <b>Volume</b> represents structured tiered rebates (procurement bands,
    channel volume discounts). Applied as a % of list for the selected tier.`,
  "waterfall.step.paymentPct": `
    <b>Payment %</b> is the processor take-rate (Stripe 2.9%, App Store 30%, etc.).
    It hits the net after tier discounts, so higher promos reduce this leakage.`,
  "waterfall.step.paymentFixed": `
    <b>Payment $</b> is the flat fee per transaction (e.g., $0.30 interchange).
    This matters most for low-ticket tiers where fixed fees bite margin.`,
  "waterfall.step.fx": `
    <b>FX</b> is the foreign-exchange spread or cross-border fee. Leave at 0 if
    you do not sell internationally.`,
  "waterfall.step.refunds": `
    <b>Refunds</b> approximates chargebacks/returns as a % of list GMV. Use it to
    model goodwill credits or churn clawbacks.`,
  "waterfall.step.pocket": `
    <b>Pocket</b> is what you keep after leakages. Use pocket-based margin floors
    when you want optimizer guardrails on real contribution, not list.`,

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

const TIER_LABELS: Record<Tier, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

function fmtPrice(n: number) {
  const rounded = Number(n.toFixed(2));
  return `$${rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtMoney(n: number) {
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString()}`;
}

function fmtPct(n: number) {
  return `${Math.round(n * 1000) / 10}%`;
}

export function explainOptimizerResult(args: {
  basePrices: Prices;
  optimizedPrices: Prices;
  costs: Prices;
  leak?: Leakages;
  constraints: {
    gapGB: number;
    gapBB: number;
    marginFloor: Prices;
    usePocketMargins?: boolean;
    usePocketProfit?: boolean;
  };
  profitDelta: number;
}): string[] {
  const { basePrices, optimizedPrices, costs, leak, constraints } = args;
  const bullets: string[] = [];
  const profitDelta = Number.isFinite(args.profitDelta) ? args.profitDelta : 0;
  const profitMode = constraints.usePocketProfit ? "pocket" : "list";
  const deltaText = `${profitDelta >= 0 ? "+" : "-"}${fmtMoney(Math.abs(profitDelta))}`;
  bullets.push(
    `Ladder -> ${fmtPrice(optimizedPrices.good)}/${fmtPrice(optimizedPrices.better)}/${fmtPrice(
      optimizedPrices.best
    )} (baseline ${fmtPrice(basePrices.good)}/${fmtPrice(basePrices.better)}/${fmtPrice(
      basePrices.best
    )}); profit ${deltaText} vs current (${profitMode} basis).`
  );
  bullets.push(
    constraints.usePocketProfit
      ? "Objective: maximize pocket profit (list minus promo/fees/FX/refunds)."
      : "Objective: maximize list contribution (before downstream leakages)."
  );

  const gapNotes = explainGaps(optimizedPrices, {
    gapGB: constraints.gapGB,
    gapBB: constraints.gapBB,
  });
  if (gapNotes.length) {
    bullets.push(`Gap floors binding: ${gapNotes.join("; ")}`);
  } else {
    const gbSlack = optimizedPrices.better - optimizedPrices.good - constraints.gapGB;
    const bbSlack = optimizedPrices.best - optimizedPrices.better - constraints.gapBB;
    bullets.push(
      `Gaps slack by ${fmtPrice(Math.max(gbSlack, 0))} (G/B) and ${fmtPrice(Math.max(bbSlack, 0))} (B/Best).`
    );
  }

  const usePocketForMargins = !!constraints.usePocketMargins && !!leak;
  const marginStats = (["good", "better", "best"] as const).map((tier) => {
    const basis =
      usePocketForMargins && leak ? computePocketPrice(optimizedPrices[tier], tier, leak).pocket : optimizedPrices[tier];
    const margin = (basis - costs[tier]) / Math.max(basis, 1e-6);
    return {
      tier,
      label: TIER_LABELS[tier],
      margin,
      floor: constraints.marginFloor[tier],
    };
  });
  const bindingMargins = marginStats.filter((s) => s.margin - s.floor < 0.01);
  const basisLabel = usePocketForMargins ? "pocket" : "list";
  if (bindingMargins.length) {
    const detail = bindingMargins
      .map((s) => `${s.label} ${fmtPct(s.margin)} (floor ${fmtPct(s.floor)})`)
      .join("; ");
    bullets.push(`Margins (${basisLabel}) hugging floors: ${detail}.`);
  } else {
    const tightest = marginStats.reduce((acc, cur) => (cur.margin < acc.margin ? cur : acc), marginStats[0]);
    const floorText = `${fmtPct(constraints.marginFloor.good)} / ${fmtPct(constraints.marginFloor.better)} / ${fmtPct(
      constraints.marginFloor.best
    )} (G/B/Best)`;
    const slack = tightest.margin - constraints.marginFloor[tightest.tier];
    bullets.push(
      `Margins (${basisLabel}) clear floors ${floorText}; tightest is ${tightest.label} at ${fmtPct(
        tightest.margin
      )} (slack ${fmtPct(slack)} vs. floor).`
    );
  }

  return bullets;
}
