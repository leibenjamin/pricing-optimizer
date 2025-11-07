// src/lib/csv.ts
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

export function importScenarioCSV(text: string): ScenarioFromCSV {
  const { header, rows } = parseCSV(text);
  const H = (k: string) => header[k.toLowerCase()] ?? -1;
  const has = (k: string) => H(k) >= 0;
  const col = (r: string[], k: string) => r[H(k)];

  const out: ScenarioFromCSV = {};
  const segs: NonNullable<ScenarioFromCSV["segments"]> = [];

  for (const r of rows) {
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
      "name","weight","beta.price","beta.featA","beta.featB","beta.refAnchor"
    ].join(","),
    [9,15,25, 3,5,8, 10,18,30, 0.05,0.05,0.05, 0.03,0.03,0.03, 0.029,0.1,0.01,0.02, "Price-sensitive",0.5,-0.09,0.25,0.2,0].join(","),
    ["","","","","","","","","","","","","","","","","","","","Value-seeker",0.35,-0.07,0.35,0.25,""].join(","),
    ["","","","","","","","","","","","","","","","","","","","Premium",0.15,-0.05,0.45,0.35,""].join(","),
  ].join("\n");
}
