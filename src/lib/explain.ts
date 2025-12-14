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
    <b>Profit frontier</b> sweeps one tier's price (x) while holding others fixed,
    plotting projected profit (y). Markers show Baseline/Current/Optimized prices on this axis; feasible
    dots clear gaps/floors. Basis toggle switches list vs pocket. Use to narrate distance to peak and how gaps/floors bind.`,

  "chart.takeRate": `
    <b>Take-rate bars</b> show segment-mixed shares {None, Good, Better, Best} for baseline/current/optimized.
    Toggle the delta view to see percentage-point shifts vs. the pinned baseline; basis toggle does not apply (demand-only). Use to show mix shifts and active movement alongside optimizer runs.`,

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
    <b>Tornado sensitivity</b> varies one factor at a time around the base ladder and
    shows profit or revenue deltas (low/high) on list or pocket basis. Use $ for absolute moves and % of base for relative lift.
    Price bump nudges each tier, leak bump tweaks FX/refunds/payment fees. Toggle metric/units to match the story; wide spans pair with the confidence badge.`,
  "optimizer.pocketMargins": `
    Check floors on <b>pocket</b> prices (after promo/payment/FX/refunds). Disable if you want floors on list prices instead.`,
  "optimizer.pocketProfit": `
    Optimize for <b>pocket</b> profit (net of promo/payment/FX/refunds). Disable to optimize list contribution.`,
  "optimizer.engine": `
    <b>Optimizer engine</b> selects which solver to use. Grid (worker) runs in a Web Worker; Grid (inline) runs on the main thread. Future engines can be slotted in here.`,
  "optimizer.ranges": `
    <b>Search ranges</b> bound Good/Better/Best. Narrow to speed up runs; widen to explore more. Step controls grid granularity.`,
  "optimizer.gaps": `
    <b>Gap floors</b> enforce minimum spacing between tiers (Better ≥ Good + gapGB, Best ≥ Better + gapBB). Keeps ladders sensible.`,
  "optimizer.floors": `
    <b>Margin floors</b> require each tier to clear a minimum margin. Toggle pocket mode to test floors after leakages.`,
  "optimizer.charm": `
    <b>Charm endings</b> snap to .99 style prices if doing so doesn’t raise the left digit. Used in some B2C contexts for perceived pricing.`,
  "import.resetAll": `
    Resets ladder, refs, leakages, features, ranges, constraints, and channel blend to sensible defaults. Clears saved values in localStorage for those keys.`,
  "import.clearAll": `
    Clears ladder/refs/leak/features to zero, clears constraints/ranges/blend, and removes saved values. Use before importing a fresh scenario.`,
  "compare.segments": `
    Choose whether to use <b>saved segments</b> from each slot or your current segments for KPI calculations.`,
  "compare.leak": `
    Choose whether to use <b>saved leakages</b> (promo/payment/FX/refunds) from each slot or current leakages.`,
  "compare.refs": `
    Choose whether to use <b>saved reference prices</b> from each slot or current reference prices.`,
  "coverage.basis": `
    Coverage can be calculated on <b>pocket</b> margins (after leakages) or <b>list</b> margins. Pocket is stricter; list is a quick sanity check.`,
  "frontier.overlay": `
    Feasible points clear margin floors; infeasible points violate floors or gaps. Use basis toggle to see pocket vs list profit along the sweep.`,
  "reset.defaults": `
    Reset ladder, refs, leak, features, ranges, constraints, and channel blend back to defaults. Does not touch saved baselines or compare slots.`,
  "takeRate.bars": `
    <b>Take-rate bars</b> show demand mix (None/Good/Better/Best) from the logit model using current prices, features, segments, and reference prices. Leakages/constraints do not affect demand directly. Baseline/current/optimized sit side-by-side; use the delta vs. baseline view to narrate mix shifts.`,
  "chart.cohort": `
    <b>Cohort rehearsal</b> simulates pocket margin on a shrinking cohort across 6-24 months.
    Overlay Baseline/Current/Optimized to see if lift is front-loaded or durable; adjust retention
    to stress churn vs contribution. Pocket basis uses leakages (promo/fees/FX/refunds); list basis ignores leakages.
    When to use: answer whether optimized pricing holds up after churn instead of peaking in month one.`,
  "cohort.retention": `
    <b>Monthly retention</b> drives cohort rehearsal. We apply pocket margins per cohort month and decay by the retention slider over the selected horizon. Try 6m for short campaigns and 18-24m for durable subs.`,
  "waterfall.compareAll": `
    Small multiples show pocket math for Good/Better/Best side by side. Use to ensure leak assumptions look reasonable across tiers.`,
  "compare.toggles": `
    Use saved vs current toggles to isolate the effect of prices or leak/refs/segments separately when comparing slots.`,
  "optimizer.rangesLabel": `
    Ranges define the search space for each tier. Tight ranges = faster runs; wide ranges = broader exploration.`,
  "optimizer.gapsLabel": `
    Gap floors enforce ladder spacing to avoid overlapping tiers.`,
  "optimizer.floorsLabel": `
    Margin floors are minimum required margins per tier. Pocket mode applies leakages before checking floors.`,

  // --- Uncertainty / risk ---
  "risk.badge": `
    <b>Confidence badge</b> is a quick read on preset uncertainty inputs (price and leakage deltas). High/Med/Low is a heuristic; bands widen as uncertainty grows. Use it to remind readers that ranges, not points, matter. See the Uncertainty & Risk notes for bands/whiskers guidance.`,
  "risk.sliders": `
    <b>Uncertainty heuristics</b> let you widen/narrow the preset bands that drive badges and chart ranges. Price delta adjusts sensitivity to price-scale shifts; leak delta adjusts downstream leakage variability. Changes mark source=user and travel in JSON/short links. Use higher deltas for thin data or volatile segments.`,
  "scorecard.basis": `
    <b>Scorecard basis</b> shows whether KPIs use list or pocket (after leakages). Pocket applies leakages before checking margins/guardrails; list ignores leakages. Badges, pills, bands, and the Insights tab reflect the active basis.`,
  "frontier.basis": `
    <b>Frontier basis</b> mirrors the basis toggle: pocket (after leakages) vs list. Infeasible points fail gaps/floors for the chosen basis. Markers use Baseline/Current/Optimized ladder.`,
  "takerate.scope": `
    <b>Take-rate bars</b> show demand-only shares (None/Good/Better/Best). Leakages/constraints do not apply here. Use delta view vs pinned baseline for mix shifts; basis toggles do not affect this chart.`,
  "cohort.basis": `
    <b>Cohort rehearsal</b> uses pocket margin for each month of the cohort (list ignores leakages). Adjust retention/horizon to stress churn vs contribution. Baseline/Current/Optimized overlays reflect the active ladders.`,

  // --- Presets ---
  "presets.scenario": `
    <b>Scenario presets</b> apply a coherent bundle: ladder, costs,
    reference prices, features, segments, leakages (with channel blends),
    optimizer guardrails/ranges, tornado knobs, and cohort retention. They are
    designed so you can click <i>Run optimizer</i> immediately and see a
    meaningful lift and explanation. Adjust anything after applying.`,
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
  tornadoRows: { name: string; deltaLow: number; deltaHigh: number }[],
  opts: { unit?: "usd" | "percent"; metric?: "profit" | "revenue" } = {}
) {
  if (!tornadoRows.length) return null;
  const withMag = tornadoRows.map(r => ({
    ...r,
    mag: Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh)),
  }));
  withMag.sort((a, b) => b.mag - a.mag);
  const t = withMag[0];
  const dir = Math.abs(t.deltaHigh) >= Math.abs(t.deltaLow) ? "up" : "down";
  const mag = Math.max(Math.abs(t.deltaLow), Math.abs(t.deltaHigh));
  const unit = opts.unit ?? "usd";
  const metricLabel = opts.metric ? ` ${opts.metric}` : "";
  const amt =
    unit === "percent"
      ? `${mag.toFixed(1)}%`
      : `$${Math.round(mag).toLocaleString()}`;
  return `${t.name} (${dir}${metricLabel}): ${amt}`;
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
