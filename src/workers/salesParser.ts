/// <reference lib="webworker" />
// SALES PARSER WORKER (typed, no any)

import Papa from "papaparse";
import type { SalesMapping } from "../lib/salesSchema";

/** Allowed tier keys in the app */
export type Tier = "good" | "better" | "best";

/** Canonical long row used by the estimator */
export type LongRow = {
  user?: string;              // <-- string | undefined (no null)
  ts?: number;                // epoch ms (optional)
  tier: Tier;                 // which alternative this row refers to
  shown: boolean;             // whether this alt was shown
  chosen: boolean;            // whether this alt was chosen
  price: number;              // price displayed
  featA?: number | null;      // optional feature value/flag
  featB?: number | null;
};

export type ParseReq = { kind: "parse"; text: string; mapping: SalesMapping };
export type ParsedResp = { kind: "rows"; longRows: LongRow[] };

type RawRow = Record<string, unknown>;
const TIERS: Tier[] = ["good", "better", "best"];

/* ---------- Strict coercion helpers (no any) ---------- */

function fromRow(row: RawRow, column?: string): unknown | undefined {
  if (!column) return undefined;
  return Object.prototype.hasOwnProperty.call(row, column)
    ? (row as Record<string, unknown>)[column]
    : undefined;
}

function toStringU(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;  // <-- never return null
  return String(v);
}

function toBool(v: unknown, fallback = true): boolean {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  return fallback;
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toEpoch(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/* Normalize a 'choice' value to a tier if possible */
function normalizeChoice(v: unknown): Tier | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "good" || s === "g" || s === "1") return "good";
  if (s === "better" || s === "b" || s === "2") return "better";
  if (s === "best" || s === "bb" || s === "premium" || s === "3") return "best";
  const n = Number(s);
  if (n === 1) return "good";
  if (n === 2) return "better";
  if (n === 3) return "best";
  return null;
}

self.onmessage = (ev: MessageEvent<ParseReq>) => {
  const req = ev.data;
  if (req.kind !== "parse") return;

  const { text, mapping } = req;

  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const inputRows: RawRow[] = (parsed.data ?? []) as RawRow[];
  const out: LongRow[] = [];

  for (const r of inputRows) {
    // --- user & timestamp (typed; user never null)
    const who = toStringU(fromRow(r, mapping.user));
    const when = toEpoch(fromRow(r, mapping.timestamp));

    // declared choice once
    const chosenTier = normalizeChoice(fromRow(r, mapping.choice));

    for (const tier of TIERS) {
      // price_* columns
      const priceKey = (mapping as Record<string, string | undefined>)[`price_${tier}`];
      const price = toNum(fromRow(r, priceKey), 0);

      // shown_* columns (default true if unmapped)
      const shownKey = (mapping as Record<string, string | undefined>)[`shown_${tier}`];
      const shown = toBool(fromRow(r, shownKey), true);

      // features (optional, allow null pass-through)
      const featAKey = (mapping as Record<string, string | undefined>)[`featA_${tier}`];
      const featBKey = (mapping as Record<string, string | undefined>)[`featB_${tier}`];
      const featAVal = fromRow(r, featAKey);
      const featBVal = fromRow(r, featBKey);
      const featA = featAVal === undefined ? null : toNum(featAVal);
      const featB = featBVal === undefined ? null : toNum(featBVal);

      // chosen flag: use normalized tier if available; else direct string compare
      const chosen =
        chosenTier != null
          ? chosenTier === tier
          : String(fromRow(r, mapping.choice) ?? "").trim().toLowerCase() === tier;

      // If not shown and no price provided, skip this alt row
      if (!shown && !priceKey) continue;

      out.push({
        user: who,            // <-- string | undefined (never null)
        ts: when,
        tier,
        shown,
        chosen,
        price,
        featA,
        featB,
      });
    }
  }

  const resp: ParsedResp = { kind: "rows", longRows: out };
  // No `any` in postMessage either
  (self as unknown as Worker).postMessage(resp);
};
