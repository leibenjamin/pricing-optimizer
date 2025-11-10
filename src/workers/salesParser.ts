// src/workers/salesParser.ts
// Typed CSV -> long-format converter for sales logs.
// Uses Papa in the main thread (SalesImport) for header/sample preview; the worker
// receives file text + mapping and emits normalized “long rows”.

export type Tier = "good" | "better" | "best";
export type Choice = Tier | "none";

// values that may appear in parsed CSV cells
export type Cell = string | number | boolean | null | undefined;

export type LongRow = {
  obsId: number;        // observation id (row index)
  alt: "good" | "better" | "best";
  price: number;
  featA: number;
  featB: number;
  shown: 0 | 1;         // whether the alt was shown
  chosen: 0 | 1;        // whether this alt was chosen
  user?: string;        // optional
  t?: number;           // timestamp (ms) optional
};

// Mapping selected by the user in the wizard
export type ParseReq = {
  kind: "parse";
  text: string;
  mapping: {
    choice?: string;
    price_good?: string; price_better?: string; price_best?: string;
    featA_good?: string; featA_better?: string; featA_best?: string;
    featB_good?: string; featB_better?: string; featB_best?: string;
    shown_good?: string; shown_better?: string; shown_best?: string;
    user?: string;
    timestamp?: string;
  };
};

// We export both response types to satisfy existing imports in SalesImport.tsx
export type ParsedResp = { kind: "rows"; longRows: LongRow[] };
function asNum(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}
export type SampleResp = {
  kind: "sample";
  header: string[];
  sample: ReadonlyArray<Record<string, Cell>>;
};
function as01(x: unknown): 0 | 1 {
  // If the column is blank/missing, assume the option WAS shown (1).
  // Only explicit 0/false/"0" should become 0.
  if (x === 0 || x === "0" || x === false) return 0;
  if (x == null || x === "") return 1;  // <-- changed
  const n = Number(x);
  if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  return 1;
}
type ChoiceName = "none" | "good" | "better" | "best";
function normalizeChoice(x: unknown): ChoiceName | null {
  if (x == null) return null;
  const s = String(x).trim().toLowerCase();
  if (s === "none" || s === "0" || s === "-" || s === "n") return "none";
  if (s === "good" || s === "g" || s === "1") return "good";
  if (s === "better" || s === "b" || s === "2") return "better";
  if (s === "best" || s === "3") return "best";
  return null;
}

self.onmessage = (ev: MessageEvent<ParseReq>) => {
  const msg = ev.data;
  if (msg.kind !== "parse") return;

  // quick CSV -> array of records using a tolerant split (we already used Papa in the component preview)
  // Here we just reuse the component’s text; rows are simple since header mapping is provided.
  const lines = msg.text.split(/\r?\n/);
  if (lines.length < 2) {
    postMessage({ kind: "rows", longRows: [] } satisfies ParsedResp);
    return;
  }
  const header = lines[0].split(",");
  const idx = (name?: string): number =>
    name ? header.findIndex((h) => h.trim() === name) : -1;

  const I = {
    choice: idx(msg.mapping.choice),
    price: { good: idx(msg.mapping.price_good), better: idx(msg.mapping.price_better), best: idx(msg.mapping.price_best) },
    featA:  { good: idx(msg.mapping.featA_good), better: idx(msg.mapping.featA_better), best: idx(msg.mapping.featA_best) },
    featB:  { good: idx(msg.mapping.featB_good), better: idx(msg.mapping.featB_better), best: idx(msg.mapping.featB_best) },
    shown:  { good: idx(msg.mapping.shown_good), better: idx(msg.mapping.shown_better), best: idx(msg.mapping.shown_best) },
    user: idx(msg.mapping.user),
    ts: idx(msg.mapping.timestamp),
  };

  const out: LongRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    if (!raw.trim()) continue;
    const cols = raw.split(",");
    const choice = normalizeChoice(I.choice >= 0 ? cols[I.choice] : null);
    // Skip if we can’t interpret the choice at all
    if (choice == null) continue;

    const user =
      I.user >= 0 ? String(cols[I.user] ?? "") : "";
    const t =
      I.ts >= 0 ? Date.parse(String(cols[I.ts] ?? "")) : NaN;
    const tMs = Number.isFinite(t) ? t : undefined;

    (["good", "better", "best"] as const).forEach((alt) => {
      // If shown_* not supplied, assume 1; else coerce with as01
      const shownIdx = I.shown[alt];
      const shown = shownIdx >= 0 ? as01(cols[shownIdx]) : 1;

      const price = asNum(I.price[alt] >= 0 ? cols[I.price[alt]] : undefined, 0);
      const featA = asNum(I.featA[alt] >= 0 ? cols[I.featA[alt]] : undefined, 0);
      const featB = asNum(I.featB[alt] >= 0 ? cols[I.featB[alt]] : undefined, 0);

      const chosen: 0 | 1 =
        choice === alt && shown === 1 ? 1 : 0;

      out.push({
        obsId: r - 1,
        alt,
        price,
        featA,
        featB,
        shown,
        chosen,
        user: user || undefined,
        t: tMs,
      });
    });
    // Note: if choice === "none", none of the three alts will get chosen=1.
  }

  postMessage({ kind: "rows", longRows: out } satisfies ParsedResp);
};
