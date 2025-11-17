# Pricing Optimizer — Good/Better/Best Ladder

Interactive pricing workbench for a three-tier ladder. Import historical choice logs, estimate latent segments in-browser, visualize take-rates and waterfalls, and run a constrained optimizer that explains why its recommendations make sense. Built to feel like a miniature pricing consultant rather than a calculator.

## Live demo

> Coming soon — ping me for a private link while the Cloudflare Pages deployment is staged.

## Quick start

```bash
npm install
npm run dev
# visit http://localhost:5173
```

Other scripts:

- `npm run build` — production bundle (Vite + rolldown).
- `npm run preview` — serve the production build locally.
- `npm run lint` — ESLint with the TypeScript config used in the repo.

## Key features

- **Scenario panel** with Good/Better/Best sliders, numeric inputs, feature toggles, and leakage presets. Every change is logged to a journal for narration.
- **Sticky KPI strip** + “Tell me what changed” panel that compares against a pinned baseline with natural-language deltas.
- **Charts**: Profit frontier, take-rate bars, tornado sensitivity, cohort rehearsal sparkline, and pocket price waterfall. Each chart wires into the shared export toolbelt (PNG + CSV) and InfoTip micro-explainers.
- **Sales import & estimator**: Upload a CSV, map columns, inspect diagnostics (none share, price ranges, shown flags), and estimate latent segments via Web Workers. Includes a synthetic sample CSV generator.
- **Optimizer**: Run a global ladder search with gap/margin constraints, optional pocket-based floors, charm-price toggles, and a “Why these prices?” explainer.
- **Compare board** + sharable short links: Pin scenarios (A/B/C), generate share codes stored in localStorage, and reload via `?s=xyz`.
- **Onboarding overlay & InfoTips**: First-time tour plus contextual micro copy so stakeholders can self-serve.

## Workflow highlights

### 1. Tune the ladder

- Adjust list prices with synchronized sliders + numeric inputs (dynamically scaled for SaaS vs B2B presets).
- Toggle Feature A/B availability per tier and see take-rate + KPI impacts immediately.
- Use preset bundles (SaaS, Payments, Device, etc.) to jump to realistic costs, reference prices, and leakage assumptions.

### 2. Import sales logs (optional)

- CSV importer infers mappings, lets you override, and surfaces quick stats (rows, % none, price spread, shown flags).
- Click **Download sample CSV** to grab a synthetic dataset that matches the schema.
- Estimation runs inside a Web Worker so the file never leaves the browser; fitted segments feed charts + optimizer.

### 3. Analyze & explain

- Profit frontier sweeps the Best tier while highlighting current and optimal points.
- Take-rate chart + cohort rehearsal explain mix over time; tornado sensitivity quantifies which assumptions move profit the most.
- Pocket price waterfall shows list → promo → volume → fees → refunds → pocket, with inline InfoTips for each leakage.

### 4. Optimize & compare

- Global optimizer respects gap floors, per-tier margin floors, and optional pocket-based profit calculations.
- After it runs, a “Why these prices?” card summarizes profit deltas, binding constraints, and margin slack.
- Pin interesting states on the Compare Board, export PNG/CSV via the sticky toolbelt, or print the whole narrative (print CSS hides interactive chrome).

## Methods & assumptions

- **Choice model**: Mixed multinomial logit (latent segments with distinct price + feature sensitivities, optional anchoring vs reference prices with loss aversion). Utilities are evaluated for each ladder state to produce take-rates.
- **Segments**: Defaults (Price-sensitive, Value seeker, Premium) plus fitted segments from the importer. We normalize weights and expose plain-English cards for each segment’s behavior.
- **Pocket pricing**: `computePocketPrice` nets promo, volume, payment %, payment $, FX, and refunds to derive the pocket basis used in charts/optimizer when pocket mode is enabled.
- **Optimizer**: Two layers — a fast grid search for UI affordances and a worker-powered global optimizer for the main “Run” action. Both honor gap floors, per-tier margin floors, and optional pocket-profit objectives.
- **Cohort rehearsal**: Simulates 12 months of retention, applying leakages and retention assumptions to project pocket margin over time.

## Architecture & tech notes

- React + TypeScript single-page app powered by Vite. Styling via Tailwind utility classes.
- Heavy math (estimation + optimization) runs in dedicated Web Workers (`/src/workers`) so large CSVs stay in-browser and the UI remains responsive.
- Charts use custom SVG components (MiniLine, HeatmapMini, Waterfall) and ECharts (frontier, tornado, take-rate).
- Shared export toolbelt dispatches `export:*` events so each chart can produce PNG/CSV in a consistent way.
- Local persistence relies on `useStickyState` (localStorage) for prices, costs, ref prices, leakages, compare slots, onboarding flag, etc.
- Accessibility helpers: InfoTips require aria labels, sticky onboarding prevents body scroll, modals trap focus, and keyboard shortcuts exist for exports.
- Print styles collapse interactive bits (`.no-print`) and keep sections aligned within a `max-w-7xl` container for PDF-friendly exports.

## Data, samples & persistence

- `src/lib/salesSample.ts` generates the downloadable CSV with synthetic rows spanning Good/Better/Best tiers.
- The importer caches recent short-link IDs plus segment fits in localStorage so you can reload or share via query params.
- Sticky state keys use the `po:*` namespace to avoid collisions if this app is embedded on another site.

## Roadmap / nice-to-haves

1. Multi-class estimation beyond K=3 along with holdout log-likelihood / AIC reporting.
2. Competitor / assortment modeling so take-rates consider rival ladders.
3. Elasticity & WTP (willingness-to-pay) callouts derived from the fitted logit.
4. Dark mode + prefers-reduced-motion polish across charts.
5. Cloudflare Pages deployment with password-protected preview link.

---

Questions or ideas? Open an issue or reach out — this project doubles as a portfolio artifact, so thoughtful feedback is welcome.
