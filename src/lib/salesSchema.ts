// src/lib/salesSchema.ts

export type SalesMapping = {
  user?: string;
  timestamp?: string;
  choice?: string;

  price_good?: string;
  price_better?: string;
  price_best?: string;

  featA_good?: string;
  featA_better?: string;
  featA_best?: string;

  featB_good?: string;
  featB_better?: string;
  featB_best?: string;

  shown_good?: string;
  shown_better?: string;
  shown_best?: string;
};

const REQUIRED_ANY_ONE_OF: ReadonlyArray<ReadonlyArray<keyof SalesMapping>> = [
  ["price_good", "price_better", "price_best"],
];

const REQUIRED_ALL: ReadonlyArray<keyof SalesMapping> = ["choice"];

export function inferMapping(headers: readonly string[]): SalesMapping {
  const h = headers.map((x) => x.trim());
  const hasExact = (s: string) => h.some((k) => k.toLowerCase() === s);
  const findLike = (re: RegExp): string | undefined =>
    h.find((k) => re.test(k.toLowerCase()));

  const m: SalesMapping = {
    user: findLike(/^(user|customer|session)\b/i),
    timestamp: findLike(/(time|date)/i),

    choice:
      (hasExact("choice") && h.find((k) => k.toLowerCase() === "choice")) ||
      findLike(/^(choice|selected|decision)\b/i),

    price_good:
      (hasExact("price_good") && h.find((k) => k.toLowerCase() === "price_good")) ||
      findLike(/price.*good|good.*price/i),
    price_better:
      (hasExact("price_better") && h.find((k) => k.toLowerCase() === "price_better")) ||
      findLike(/price.*better|better.*price/i),
    price_best:
      (hasExact("price_best") && h.find((k) => k.toLowerCase() === "price_best")) ||
      findLike(/price.*best|best.*price/i),

    featA_good:
      (hasExact("feata_good") && h.find((k) => k.toLowerCase() === "feata_good")) ||
      findLike(/feata.*good|good.*feata/i),
    featA_better:
      (hasExact("feata_better") && h.find((k) => k.toLowerCase() === "feata_better")) ||
      findLike(/feata.*better|better.*feata/i),
    featA_best:
      (hasExact("feata_best") && h.find((k) => k.toLowerCase() === "feata_best")) ||
      findLike(/feata.*best|best.*feata/i),

    featB_good:
      (hasExact("featb_good") && h.find((k) => k.toLowerCase() === "featb_good")) ||
      findLike(/featb.*good|good.*featb/i),
    featB_better:
      (hasExact("featb_better") && h.find((k) => k.toLowerCase() === "featb_better")) ||
      findLike(/featb.*better|better.*featb/i),
    featB_best:
      (hasExact("featb_best") && h.find((k) => k.toLowerCase() === "featb_best")) ||
      findLike(/featb.*best|best.*featb/i),

    shown_good:
      (hasExact("shown_good") && h.find((k) => k.toLowerCase() === "shown_good")) ||
      findLike(/shown.*good|good.*shown|exposed.*good|good.*exposed/i),
    shown_better:
      (hasExact("shown_better") && h.find((k) => k.toLowerCase() === "shown_better")) ||
      findLike(/shown.*better|better.*shown|exposed.*better|better.*exposed/i),
    shown_best:
      (hasExact("shown_best") && h.find((k) => k.toLowerCase() === "shown_best")) ||
      findLike(/shown.*best|best.*shown|exposed.*best|best.*exposed/i),
  };

  return m;
}

export function validateMapping(
  headers: readonly string[],
  m: SalesMapping
): { ok: boolean; missing: string[] } {
  const H = new Set(headers.map((x) => x.trim().toLowerCase()));
  const inHeaders = (col?: string) =>
    col ? H.has(col.trim().toLowerCase()) : false;

  const missing: string[] = [];

  for (const k of REQUIRED_ALL) {
    const v = m[k];
    if (!v || !inHeaders(v)) missing.push(`Missing required: ${k}`);
  }

  const anySetOK = REQUIRED_ANY_ONE_OF.some((group) =>
    group.some((k) => {
      const v = m[k];
      return !!v && inHeaders(v);
    })
  );
  if (!anySetOK) {
    missing.push(
      "Need at least one price column among {price_good, price_better, price_best}"
    );
  }

  return { ok: missing.length === 0, missing };
}
