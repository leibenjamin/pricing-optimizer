/// <reference types="@cloudflare/workers-types" />
// functions/api/get.ts

export interface Env {
  SCENARIOS: KVNamespace
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("s") ?? ""

    // quick sanity check on id
    if (!/^[a-zA-Z0-9_-]{5,16}$/.test(id)) {
      return new Response(JSON.stringify({ error: "Bad or missing id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const raw = await env.SCENARIOS.get(id)
    if (!raw) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // raw is the scenario object we stored in save.ts
    const scenario = JSON.parse(raw)

    return new Response(JSON.stringify({ scenario }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
}

// Fast health/prewarm endpoint: HEAD /api/get?s=ping  -> 204 No Content
export const onRequestHead: PagesFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const s = url.searchParams.get("s");
    if (s === "ping") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    // If they HEAD a real id, treat as "exists?"
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  } catch {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
};
