// src/workers/salesParser.ts
// Typed CSV -> long-format converter for sales logs.
// Uses Papa in the main thread (SalesImport) for header/sample preview; the worker
// receives file text + mapping and emits normalized “long rows”.

export type Tier = "good" | "better" | "best";
export type Choice = Tier | "none";

// values that may appear in parsed CSV cells
export type Cell = string | number | boolean | null | undefined;

export type LongRow = {
  user?: string;
  timestamp?: string;
  tier: Tier;
  price?: number;
  featA?: number;
  featB?: number;
  shown?: boolean;
  choice: Choice;
};

// Mapping selected by the user in the wizard
export type SalesMapping = Partial<{
  choice: string;
  price_good: string;
  price_better: string;
  price_best: string;
  featA_good: string;
  featA_better: string;
  featA_best: string;
  featB_good: string;
  featB_better: string;
  featB_best: string;
  shown_good: string;
  shown_better: string;
  shown_best: string;
  user: string;
  timestamp: string;
}>;

export type ParseReq = { kind: "parse"; text: string; mapping: SalesMapping };

// We export both response types to satisfy existing imports in SalesImport.tsx
export type ParsedResp = { kind: "rows"; longRows: LongRow[] };
export type SampleResp = {
  kind: "sample";
  header: string[];
  sample: ReadonlyArray<Record<string, Cell>>;
};

function toStringOrUndef(v: Cell): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}
function toNumOrUndef(v: Cell): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function toBoolOrUndef(v: Cell): boolean | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return undefined;
}

// normalize a single wide row into 3 long rows (good/better/best)
function normalizeRow(
  row: Record<string, Cell>,
  m: SalesMapping
): LongRow[] {
  // 1) choice (required)
  const choiceRaw = m.choice ? row[m.choice] : undefined;
  const choiceStr = toStringOrUndef(choiceRaw)?.toLowerCase();
  const choice: Choice =
    choiceStr === "good" || choiceStr === "better" || choiceStr === "best"
      ? (choiceStr as Choice)
      : "none";

  // 2) optional user/timestamp
  const user = m.user ? toStringOrUndef(row[m.user]) : undefined;
  const timestamp = m.timestamp ? toStringOrUndef(row[m.timestamp]) : undefined;

  const tiers: Tier[] = ["good", "better", "best"];

  return tiers.map((tier) => {
    const priceKey = m[`price_${tier}` as const];
    const featAKey = m[`featA_${tier}` as const];
    const featBKey = m[`featB_${tier}` as const];
    const shownKey = m[`shown_${tier}` as const];

    return {
      user,
      timestamp,
      tier,
      price: priceKey ? toNumOrUndef(row[priceKey]) : undefined,
      featA: featAKey ? toNumOrUndef(row[featAKey]) : undefined,
      featB: featBKey ? toNumOrUndef(row[featBKey]) : undefined,
      shown: shownKey ? toBoolOrUndef(row[shownKey]) : undefined,
      choice,
    };
  });
}

self.onmessage = (ev: MessageEvent<ParseReq>) => {
  if (ev.data?.kind !== "parse") return;
  const { text, mapping } = ev.data;

  // Lightweight CSV parsing here so we don’t pull Papa into the worker.
  // Supports basic CSV with first row = header and simple commas.
  // (Main thread already used Papa for header/sample preview.)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    const resp: ParsedResp = { kind: "rows", longRows: [] };
    (self as unknown as Worker).postMessage(resp);
    return;
  }
  const header = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  const longRows: LongRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, Cell> = {};
    header.forEach((h, j) => {
      row[h] = raw[j] ?? "";
    });
    const triples = normalizeRow(row, mapping);
    longRows.push(...triples);
  }

  const resp: ParsedResp = { kind: "rows", longRows };
  (self as unknown as Worker).postMessage(resp);
};
