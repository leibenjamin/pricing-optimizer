// src/lib/slots.ts

import type { ScenarioSnapshot } from "./snapshots";

export type SlotId = "A" | "B" | "C";

const SLOT_KEYS: Record<SlotId, string> = {
  A: "po_compare_A_v1",
  B: "po_compare_B_v1",
  C: "po_compare_C_v1",
};

export function readSlot(id: SlotId): ScenarioSnapshot | null {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[id]);
    if (!raw) return null;
    return JSON.parse(raw) as ScenarioSnapshot;
  } catch {
    return null;
  }
}

export function writeSlot(id: SlotId, data: ScenarioSnapshot) {
  localStorage.setItem(SLOT_KEYS[id], JSON.stringify(data));
}

export function clearSlot(id: SlotId) {
  localStorage.removeItem(SLOT_KEYS[id]);
}

