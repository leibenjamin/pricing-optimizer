// src/lib/csv.ts

import type { Constraints, SearchRanges } from "./optimize";
import type { PriceRangeSource, TierRangeMap } from "./priceRange";
import type { ScenarioUncertainty } from "./domain";

export type ScenarioFromCSV = {
  prices?: { good: number; better: number; best: number };
  costs?: { good: number; better: number; best: number };
  refPrices?: { good: number; better: number; best: number };
  leak?: {
    promo: { good: number; better: number; best: number };
    volume: { good: number; better: number; best: number };
    paymentPct: number;
    paymentFixed: number;
    fxPct: number;
    refundsPct: number;
  };
  segments?: Array<{
    weight: number;
    beta: { price: number; featA: number; featB: number; refAnchor?: number };
  }>;
  optConstraints?: Partial<Constraints>;
  optRanges?: Partial<SearchRanges>;
  priceRange?: TierRangeMap;
  priceRangeSource?: PriceRangeSource;
  channelMix?: Array<{ preset: string; w: number }>;
  uncertainty?: ScenarioUncertainty | null;
  optimizerKind?: "grid-worker" | "grid-inline" | "future";
};

type CSVStruct = { header: Record<string, number>; rows: string[][] };

function parseCSV(text: string): CSVStruct {
  const isTSV = /\t/.test((text.split(/\r?\n/, 1)[0] || ""));
  const sep = isTSV ? "\t" : ",";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { header: {}, rows: [] };

  const parseRow = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else { q = !q; }
      } else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headerRow = parseRow(lines[0]);
  const header = headerRow.reduce<Record<string, number>>((acc, k, i) => {
    if (k) acc[k.toLowerCase()] = i;
    return acc;
  }, {});
  const rows = lines.slice(1).map(parseRow);
  return { header, rows };
}

const n = (x: unknown) => {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : null;
};
const b = (x: unknown) => {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    const lc = x.toLowerCase();
    if (lc === "true" || lc === "1" || lc === "yes") return true;
    if (lc === "false" || lc === "0" || lc === "no") return false;
  }
  if (typeof x === "number") return x !== 0;
  return null;
};

const parseJsonSafe = <T>(text: string | undefined): T | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export function importScenarioCSV(text: string): ScenarioFromCSV {
  const { header, rows } = parseCSV(text);
  const H = (k: string) => header[k.toLowerCase()] ?? -1;
  const has = (k: string) => H(k) >= 0;
  const col = (r: string[], k: string) => r[H(k)];

  const out: ScenarioFromCSV = {};
  const segs: NonNullable<ScenarioFromCSV["segments"]> = [];

  for (const r of rows) {
    const optConstraints: Partial<Constraints> = out.optConstraints ?? {};
    const optRanges: Partial<SearchRanges> = out.optRanges ?? {};

    // prices / costs / refs
    const pg = has("prices.good") ? n(col(r, "prices.good")) : null;
    const pb = has("prices.better") ? n(col(r, "prices.better")) : null;
    const ph = has("prices.best") ? n(col(r, "prices.best")) : null;
    if (pg !== null || pb !== null || ph !== null) {
      out.prices = {
        good: pg ?? out.prices?.good ?? 0,
        better: pb ?? out.prices?.better ?? 0,
        best: ph ?? out.prices?.best ?? 0,
      };
    }

    const cg = has("costs.good") ? n(col(r, "costs.good")) : null;
    const cb = has("costs.better") ? n(col(r, "costs.better")) : null;
    const ch = has("costs.best") ? n(col(r, "costs.best")) : null;
    if (cg !== null || cb !== null || ch !== null) {
      out.costs = {
        good: cg ?? out.costs?.good ?? 0,
        better: cb ?? out.costs?.better ?? 0,
        best: ch ?? out.costs?.best ?? 0,
      };
    }

    const rg = has("ref.good") ? n(col(r, "ref.good")) : null;
    const rb = has("ref.better") ? n(col(r, "ref.better")) : null;
    const rh = has("ref.best") ? n(col(r, "ref.best")) : null;
    if (rg !== null || rb !== null || rh !== null) {
      out.refPrices = {
        good: rg ?? out.refPrices?.good ?? 0,
        better: rb ?? out.refPrices?.better ?? 0,
        best: rh ?? out.refPrices?.best ?? 0,
      };
    }

    // leakages + tier discounts
    const ppay = has("leak.paymentpct") ? n(col(r, "leak.paymentpct")) : null;
    const fpay = has("leak.paymentfixed") ? n(col(r, "leak.paymentfixed")) : null;
    const fx = has("leak.fxpct") ? n(col(r, "leak.fxpct")) : null;
    const rf = has("leak.refundspct") ? n(col(r, "leak.refundspct")) : null;

    const promoG = has("promo.good") ? n(col(r, "promo.good")) : null;
    const promoB = has("promo.better") ? n(col(r, "promo.better")) : null;
    const promoH = has("promo.best") ? n(col(r, "promo.best")) : null;

    const volG = has("volume.good") ? n(col(r, "volume.good")) : null;
    const volB = has("volume.better") ? n(col(r, "volume.better")) : null;
    const volH = has("volume.best") ? n(col(r, "volume.best")) : null;

    if (ppay!==null || fpay!==null || fx!==null || rf!==null || promoG!==null || promoB!==null || promoH!==null || volG!==null || volB!==null || volH!==null) {
      out.leak = {
        promo: {
          good: promoG ?? out.leak?.promo.good ?? 0,
          better: promoB ?? out.leak?.promo.better ?? 0,
          best: promoH ?? out.leak?.promo.best ?? 0,
        },
        volume: {
          good: volG ?? out.leak?.volume.good ?? 0,
          better: volB ?? out.leak?.volume.better ?? 0,
          best: volH ?? out.leak?.volume.best ?? 0,
        },
        paymentPct: ppay ?? out.leak?.paymentPct ?? 0,
        paymentFixed: fpay ?? out.leak?.paymentFixed ?? 0,
        fxPct: fx ?? out.leak?.fxPct ?? 0,
        refundsPct: rf ?? out.leak?.refundsPct ?? 0,
      };
    }

    // segments rows
    const w = has("weight") ? n(col(r, "weight")) : null;
    const bP = has("beta.price") ? n(col(r, "beta.price")) : null;
    const bA = has("beta.feata") ? n(col(r, "beta.feata")) : null;
    const bB = has("beta.featb") ? n(col(r, "beta.featb")) : null;
    const bR = has("beta.refanchor") ? n(col(r, "beta.refanchor")) : null;

    if (w !== null && (bP !== null || bA !== null || bB !== null)) {
      segs.push({
        weight: w,
        beta: {
          price: bP ?? 0,
          featA: bA ?? 0,
          featB: bB ?? 0,
          ...(bR !== null ? { refAnchor: bR } : {}),
        },
      });
    }

    // constraints
    const gGB = has("constraints.gapgb") ? n(col(r, "constraints.gapgb")) : null;
    const gBB = has("constraints.gapbb") ? n(col(r, "constraints.gapbb")) : null;
    const charm = has("constraints.charm") ? b(col(r, "constraints.charm")) : null;
    const usePocketProfit = has("constraints.usepocketprofit") ? b(col(r, "constraints.usepocketprofit")) : null;
    const usePocketMargins = has("constraints.usepocketmargins") ? b(col(r, "constraints.usepocketmargins")) : null;
    const maxNone = has("constraints.maxnoneshare") ? n(col(r, "constraints.maxnoneshare")) : null;
    const minTake = has("constraints.mintakerate") ? n(col(r, "constraints.mintakerate")) : null;
    const mg = has("constraints.margin.good") ? n(col(r, "constraints.margin.good")) : null;
    const mb = has("constraints.margin.better") ? n(col(r, "constraints.margin.better")) : null;
    const mh = has("constraints.margin.best") ? n(col(r, "constraints.margin.best")) : null;
    if (gGB !== null) optConstraints.gapGB = gGB;
    if (gBB !== null) optConstraints.gapBB = gBB;
    if (charm !== null) optConstraints.charm = charm;
    if (usePocketProfit !== null) optConstraints.usePocketProfit = usePocketProfit;
    if (usePocketMargins !== null) optConstraints.usePocketMargins = usePocketMargins;
    if (maxNone !== null) optConstraints.maxNoneShare = maxNone;
    if (minTake !== null) optConstraints.minTakeRate = minTake;
    if (mg !== null || mb !== null || mh !== null) {
      optConstraints.marginFloor = {
        good: mg ?? optConstraints.marginFloor?.good ?? 0,
        better: mb ?? optConstraints.marginFloor?.better ?? 0,
        best: mh ?? optConstraints.marginFloor?.best ?? 0,
      };
    }
    if (Object.keys(optConstraints).length) out.optConstraints = optConstraints;

    // ranges
    const rgMin = has("ranges.good.min") ? n(col(r, "ranges.good.min")) : null;
    const rgMax = has("ranges.good.max") ? n(col(r, "ranges.good.max")) : null;
    const rbMin = has("ranges.better.min") ? n(col(r, "ranges.better.min")) : null;
    const rbMax = has("ranges.better.max") ? n(col(r, "ranges.better.max")) : null;
    const rhMin = has("ranges.best.min") ? n(col(r, "ranges.best.min")) : null;
    const rhMax = has("ranges.best.max") ? n(col(r, "ranges.best.max")) : null;
    const rStep = has("ranges.step") ? n(col(r, "ranges.step")) : null;
    if (rgMin !== null && rgMax !== null) optRanges.good = [rgMin, rgMax];
    if (rbMin !== null && rbMax !== null) optRanges.better = [rbMin, rbMax];
    if (rhMin !== null && rhMax !== null) optRanges.best = [rhMin, rhMax];
    if (rStep !== null) optRanges.step = rStep;
    if (Object.keys(optRanges).length) out.optRanges = optRanges;

    // price range
    const pr = out.priceRange ?? {};
    const prgMin = has("pricerange.good.min") ? n(col(r, "pricerange.good.min")) : null;
    const prgMax = has("pricerange.good.max") ? n(col(r, "pricerange.good.max")) : null;
    const prbMin = has("pricerange.better.min") ? n(col(r, "pricerange.better.min")) : null;
    const prbMax = has("pricerange.better.max") ? n(col(r, "pricerange.better.max")) : null;
    const prhMin = has("pricerange.best.min") ? n(col(r, "pricerange.best.min")) : null;
    const prhMax = has("pricerange.best.max") ? n(col(r, "pricerange.best.max")) : null;
    const prSource = has("pricerange.source") ? col(r, "pricerange.source") : null;
    if (prgMin !== null && prgMax !== null) pr.good = { min: prgMin, max: prgMax };
    if (prbMin !== null && prbMax !== null) pr.better = { min: prbMin, max: prbMax };
    if (prhMin !== null && prhMax !== null) pr.best = { min: prhMin, max: prhMax };
    if (Object.keys(pr).length) out.priceRange = pr;
    if (prSource) out.priceRangeSource = prSource as PriceRangeSource;

    // channel mix / uncertainty / optimizer kind (stored in scenario row only)
    if (has("channelmix")) {
      const raw = col(r, "channelmix");
      const parsed = parseJsonSafe<Array<{ preset: string; w: number }>>(raw);
      if (parsed) out.channelMix = parsed;
    }
    if (has("uncertainty")) {
      const raw = col(r, "uncertainty");
      const parsed = parseJsonSafe<ScenarioUncertainty>(raw);
      if (parsed) out.uncertainty = parsed;
    }
    if (has("optimizerkind")) {
      const raw = col(r, "optimizerkind");
      if (raw) out.optimizerKind = raw as ScenarioFromCSV["optimizerKind"];
    }
  }

  if (segs.length) out.segments = segs;
  return out;
}

export function csvTemplate(): string {
  return [
    [
      "prices.good","prices.better","prices.best",
      "costs.good","costs.better","costs.best",
      "ref.good","ref.better","ref.best",
      "promo.good","promo.better","promo.best",
      "volume.good","volume.better","volume.best",
      "leak.paymentPct","leak.paymentFixed","leak.fxPct","leak.refundsPct",
      "constraints.gapGB","constraints.gapBB","constraints.charm","constraints.usePocketProfit","constraints.usePocketMargins","constraints.maxNoneShare","constraints.minTakeRate",
      "constraints.margin.good","constraints.margin.better","constraints.margin.best",
      "ranges.good.min","ranges.good.max","ranges.better.min","ranges.better.max","ranges.best.min","ranges.best.max","ranges.step",
      "priceRange.good.min","priceRange.good.max","priceRange.better.min","priceRange.better.max","priceRange.best.min","priceRange.best.max","priceRange.source",
      "channelMix","uncertainty","optimizerKind",
      "name","weight","beta.price","beta.featA","beta.featB","beta.refAnchor"
    ].join(","),
    [
      9,15,25, 3,5,8, 10,18,30, 0.05,0.05,0.05, 0.03,0.03,0.03, 0.029,0.1,0.01,0.02,
      1,1,true,false,false,0.8,0.05,
      0.25,0.3,0.35,
      5,15, 10,25, 18,35, 1,
      8,32, 12,40, 20,60, "shared",
      "[{\"preset\":\"direct\",\"w\":0.7},{\"preset\":\"partner\",\"w\":0.3}]",
      "{\"priceScaleDelta\":0.1,\"leakDeltaPct\":0.02}",
      "grid-worker",
      "Price-sensitive",0.5,-0.09,0.25,0.2,0
    ].join(","),
    ["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","Value-seeker",0.35,-0.07,0.35,0.25,""].join(","),
    ["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","Premium",0.15,-0.05,0.45,0.35,""].join(","),
  ].join("\n");
}
