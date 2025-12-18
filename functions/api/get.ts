/// <reference types="@cloudflare/workers-types" />
// functions/api/get.ts

import { corsHeaders } from "./cors";

export interface Env {
  SCENARIOS: KVNamespace
  ALLOWED_ORIGINS?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const headers = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const cors = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!cors) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("s") ?? ""

    // quick sanity check on id
    if (!/^[a-zA-Z0-9_-]{5,16}$/.test(id)) {
      return new Response(JSON.stringify({ error: "Bad or missing id" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    const raw = await env.SCENARIOS.get(id)
    if (!raw) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    // raw is the scenario object we stored in save.ts
    const scenario = JSON.parse(raw)

    return new Response(JSON.stringify({ scenario }), {
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
}

// Fast health/prewarm endpoint: HEAD /api/get?s=ping  -> 204 No Content
export const onRequestHead: PagesFunction<Env> = async ({ request, env }) => {
  const cors = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!cors) return new Response(null, { status: 403 });

  try {
    const url = new URL(request.url);
    const s = url.searchParams.get("s");
    if (s === "ping") {
      return new Response(null, { status: 204, headers: cors });
    }
    // If they HEAD a real id, treat as "exists?"
    return new Response(null, { status: 204, headers: cors });
  } catch {
    return new Response(null, { status: 204, headers: cors });
  }
};
