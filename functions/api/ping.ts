/// <reference types="@cloudflare/workers-types" />
// functions/api/ping.ts

import { corsHeaders, type CorsEnv } from "./cors";

export interface Env extends CorsEnv {}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const headers = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};

export const onRequestHead: PagesFunction<Env> = async ({ request, env }) => {
  const headers = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = corsHeaders(request, env, "GET,HEAD,OPTIONS");
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};
