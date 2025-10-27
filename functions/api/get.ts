/// <reference types="@cloudflare/workers-types" />
// functions/api/get.ts

export interface Env {
  SCENARIOS: KVNamespace
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("s") ?? ""

    // quick sanity check on id
    if (!/^[a-zA-Z0-9_-]{5,16}$/.test(id)) {
      return new Response(JSON.stringify({ error: "Bad or missing id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const raw = await env.SCENARIOS.get(id)
    if (!raw) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    // ‘raw’ is the scenario object we stored in save.ts
    const scenario = JSON.parse(raw)

    return new Response(JSON.stringify({ scenario }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
