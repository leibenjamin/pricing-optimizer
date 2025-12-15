// src/lib/recents.ts

export type RecentItem = { id: string; t: number };

const RECENT_KEY = "po_recent_ids_v1";

export function readRecents(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function writeRecents(arr: RecentItem[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 5)));
}

export function rememberId(id: string) {
  const now = Date.now();
  const seen = readRecents().filter((r) => r.id !== id);
  writeRecents([{ id, t: now }, ...seen]);
}

export function clearRecents() {
  localStorage.removeItem(RECENT_KEY);
}
