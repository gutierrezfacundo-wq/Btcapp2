// Canal de comandos del control remoto (Cloudflare Pages Function).
// El celular hace POST con un comando; la TV hace GET con ?since=<seq> y
// ejecuta el comando si es más nuevo. Un solo slot (gana el último), TTL 60s.
// Usa el mismo namespace KV "PAIR" que el emparejamiento.

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function cmdKey(raw) {
  return "cmd:" + String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { params, request, env } = context;
  const key = cmdKey(params.code);
  if (key === "cmd:") return new Response(JSON.stringify({ error: "código inválido" }), { status: 400, headers: CORS });
  if (!env.PAIR) return new Response(JSON.stringify({ error: "KV no configurado" }), { status: 500, headers: CORS });
  const body = await request.text();
  if (body.length > 4096) return new Response(JSON.stringify({ error: "payload muy grande" }), { status: 413, headers: CORS });
  let cmd;
  try { cmd = JSON.parse(body); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS }); }
  const seq = Date.now();
  await env.PAIR.put(key, JSON.stringify({ seq, cmd }), { expirationTtl: 60 });
  return new Response(JSON.stringify({ ok: true, seq }), { headers: CORS });
}

export async function onRequestGet(context) {
  const { params, request, env } = context;
  const key = cmdKey(params.code);
  if (!env.PAIR) return new Response(JSON.stringify({ error: "KV no configurado" }), { status: 500, headers: CORS });
  const since = Number(new URL(request.url).searchParams.get("since")) || 0;
  const val = await env.PAIR.get(key);
  if (!val) return new Response(JSON.stringify({ pending: true }), { headers: CORS });
  try {
    const parsed = JSON.parse(val);
    if (!(parsed.seq > since)) return new Response(JSON.stringify({ pending: true }), { headers: CORS });
    return new Response(val, { headers: CORS });
  } catch {
    return new Response(JSON.stringify({ pending: true }), { headers: CORS });
  }
}
