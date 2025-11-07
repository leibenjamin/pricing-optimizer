/// <reference types="@cloudflare/workers-types" />
// app/functions/api/ping.ts

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Cache-Control": "no-store",
    },
  });

export const onRequestHead: PagesFunction = async () =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export const onRequestGet: PagesFunction = async () =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
