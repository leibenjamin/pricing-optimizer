/// <reference types="@cloudflare/workers-types" />
// functions/api/cors.ts

export type CorsEnv = {
  /** Comma-separated list of allowed Origins for browser CORS (e.g. "https://benlei.org,https://pricing-optimizer.pages.dev") */
  ALLOWED_ORIGINS?: string;
};

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

function normalizeOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin: string): boolean {
  return (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("http://[::1]:")
  );
}

export function resolveAllowedOrigin(request: Request, env?: CorsEnv): { allowed: string | null; hasOrigin: boolean } {
  const origin = request.headers.get("Origin");
  if (!origin) return { allowed: null, hasOrigin: false };

  const reqOrigin = new URL(request.url).origin;
  if (origin === reqOrigin) return { allowed: origin, hasOrigin: true };
  if (isLocalOrigin(origin)) return { allowed: origin, hasOrigin: true };

  const allow = normalizeOrigins(env?.ALLOWED_ORIGINS);
  if (allow.includes(origin)) return { allowed: origin, hasOrigin: true };

  return { allowed: null, hasOrigin: true };
}

export function corsHeaders(request: Request, env: CorsEnv | undefined, methods: string): Record<string, string> | null {
  const { allowed, hasOrigin } = resolveAllowedOrigin(request, env);
  // If the browser sent an Origin header and it's not allowed, block.
  if (hasOrigin && !allowed) return null;

  // No Origin header: likely non-browser client; CORS isn't relevant.
  const allowOrigin = allowed ?? "*";

  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    ...(allowed ? { Vary: "Origin" } : {}),
    "Access-Control-Max-Age": "86400",
  };
}

