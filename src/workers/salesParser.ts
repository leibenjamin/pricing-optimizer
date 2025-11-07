// src/workers/salesParser.ts
/// <reference lib="webworker" />

import Papa from "papaparse";
import type { SalesMapping } from "../lib/salesSchema";

type Scalar = string | number | boolean | null | undefined;
type WideRow = Record<string, Scalar>;

export type LongRow = {
  user?: string | number;
  t?: number; // timestamp ms
  setId: number; // sequential choice set id
  alt: "good" | "better" | "best" | "none";
  chosen: 0 | 1;
  price?: number;
  featA?: number;
  featB?: number;
  shown?: number;
};

export type ParseReq =
  | { kind: "parse"; text: string; mapping: SalesMapping; sampleOnly?: false }
  | { kind: "parse"; text: string; mapping: SalesMapping; sampleOnly: true };

export type SampleResp = {
  kind: "sample";
  headers: string[];
  rows: WideRow[];
};

export type ParsedResp = {
  kind: "rows";
  longRows: LongRow[];
  nSets: number;
  nChosenNone: number;
};

function toNum(v: Scalar): number | undefined {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : undefined;
}
function to01(v: Scalar): number | undefined {
  if (v === 1 || v === 0) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes" || s === "y") return 1;
    if (s === "0" || s === "false" || s === "no" || s === "n") return 0;
  }
  const n = Number(v);
  if (n === 0 || n === 1) return n;
  return undefined;
}

self.onmessage = (ev: MessageEvent<ParseReq>) => {
  const msg = ev.data;
  if (msg.kind !== "parse") return;

  const parsed = Papa.parse<WideRow>(msg.text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  const headers = parsed.meta.fields ?? [];
  const rows = (parsed.data ?? []).filter((r) => r && Object.keys(r).length);

  if (msg.sampleOnly) {
    const resp: SampleResp = { kind: "sample", headers, rows: rows.slice(0, 10) };
    (self as DedicatedWorkerGlobalScope).postMessage(resp);
    return;
  }

  const m = msg.mapping;
  const altTriplet: Array<"good" | "better" | "best"> = ["good", "better", "best"];

  let setCounter = 0;
  let chosenNone = 0;
  const out: LongRow[] = [];

  for (const row of rows) {
    const setId = setCounter++;

    const choiceRaw = String(row[m.choice ?? ""] ?? "").toLowerCase().trim();
    const chosenAlt: "good" | "better" | "best" | "none" =
      choiceRaw.includes("good")
        ? "good"
        : choiceRaw.includes("better")
        ? "better"
        : choiceRaw.includes("best")
        ? "best"
        : "none";

    const user = m.user ? (row[m.user] as string | number | undefined) : undefined;
    const t = m.timestamp ? Date.parse(String(row[m.timestamp])) : undefined;

    for (const alt of altTriplet) {
      const priceCol = m[`price_${alt}` as const];
      const price = priceCol ? toNum(row[priceCol]) : undefined;

      const shownCol = m[`shown_${alt}` as const];
      const shown = shownCol ? to01(row[shownCol]) : price !== undefined ? 1 : undefined;

      const faCol = m[`featA_${alt}` as const];
      const fbCol = m[`featB_${alt}` as const];
      const featA = faCol ? toNum(row[faCol]) : undefined;
      const featB = fbCol ? toNum(row[fbCol]) : undefined;

      // If nothing indicates the alt existed in this set, skip
      if (shown === undefined && price === undefined && featA === undefined && featB === undefined) {
        continue;
      }

      out.push({
        user,
        t,
        setId,
        alt,
        chosen: chosenAlt === alt ? 1 : 0,
        price,
        featA,
        featB,
        shown: shown ?? 1,
      });
    }

    // Add outside option “none”
    const noneChosen = chosenAlt === "none" ? 1 : 0;
    if (noneChosen) chosenNone++;
    out.push({ user, t, setId, alt: "none", chosen: noneChosen, shown: 1 });
  }

  const resp: ParsedResp = {
    kind: "rows",
    longRows: out,
    nSets: setCounter,
    nChosenNone: chosenNone,
  };
  (self as DedicatedWorkerGlobalScope).postMessage(resp);
};
