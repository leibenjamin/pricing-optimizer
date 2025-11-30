// src/lib/net.ts

export type RetryConfig = {
  attempts?: number;     // total tries (incl. first)
  baseDelayMs?: number;  // initial backoff
  timeoutMs?: number;    // per-request timeout
  jitter?: boolean;
};

// Default to same-origin so custom domains don't trip CORS; allow override via env.
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
const BASE_PATH = (() => {
  const path = new URL(".", location.href).pathname.replace(/\/$/, "");
  return path === "/" ? "" : path; // "" on root, "/pricing-optimizer" on mounted path
})();

const normalizePath = (path: string) => (path.startsWith("/") ? path : `/${path}`);
export const apiUrl = (path: string) => {
  const normalized = normalizePath(path);
  if (API_ORIGIN) return `${API_ORIGIN}${normalized}`;
  return `${BASE_PATH}${normalized}` || normalized;
};

// Tiny sleep
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exponential backoff with optional jitter
function backoff(attempt: number, base: number, jitter: boolean) {
  const t = base * Math.pow(2, attempt); // 0,1,2...
  if (!jitter) return t;
  const rand = Math.random() * 0.4 + 0.8; // 0.8-1.2x
  return Math.round(t * rand);
}

const shouldResolve = (input: string) =>
  !/^https?:\/\//i.test(input) && !input.startsWith("//") && !input.startsWith("data:");

// Fetch with timeout
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Robust fetch with retries for 5xx / network / 429.
 * Returns the final Response (ok or error). Caller decides how to handle error JSON.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  cfg: RetryConfig = {}
): Promise<Response> {
  const attempts = cfg.attempts ?? 3;      // try 3 times by default
  const base = cfg.baseDelayMs ?? 250;     // 250ms base backoff
  const timeout = cfg.timeoutMs ?? 4000;   // 4s per request
  const jitter = cfg.jitter ?? true;

  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const target = typeof input === "string" && shouldResolve(input) ? apiUrl(input) : input;
      const res = await fetchWithTimeout(target, init, timeout);
      // Retry on 5xx/429 only; pass through 4xx so caller can show validation messages
      if (res.status >= 500 || res.status === 429) {
        if (i < attempts - 1) {
          await wait(backoff(i, base, jitter));
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await wait(backoff(i, base, jitter));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: exhausted attempts");
}

/** Cheap edge warmup/health check. Returns true on 204, false otherwise. */
export async function preflight(path: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(path, { method: "HEAD" }, { attempts: 2, baseDelayMs: 150, timeoutMs: 2000 });
    return res.status === 204;
  } catch {
    return false;
  }
}
