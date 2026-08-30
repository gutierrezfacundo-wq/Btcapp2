// Relay de emparejamiento (Cloudflare Pages Function).
// El celular hace POST con la config; la TV hace GET para recibirla. Un solo uso,
// expira a los 10 minutos. Requiere un namespace KV llamado "PAIR" vinculado al
// proyecto de Pages (Settings → Functions → KV namespace bindings).

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function codeKey(raw) {
  // Normalizamos: solo alfanumérico, mayúsculas, máx 8.
  return "pair:" + String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { params, request, env } = context;
  const key = codeKey(params.code);
  if (key === "pair:") return new Response(JSON.stringify({ error: "código inválido" }), { status: 400, headers: CORS });
  if (!env.PAIR) return new Response(JSON.stringify({ error: "KV no configurado" }), { status: 500, headers: CORS });
  const body = await request.text();
  if (body.length > 8192) return new Response(JSON.stringify({ error: "payload muy grande" }), { status: 413, headers: CORS });
  await env.PAIR.put(key, body, { expirationTtl: 600 });
  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = codeKey(params.code);
  if (!env.PAIR) return new Response(JSON.stringify({ error: "KV no configurado" }), { status: 500, headers: CORS });
  const val = await env.PAIR.get(key);
  if (!val) return new Response(JSON.stringify({ pending: true }), { headers: CORS });
  await env.PAIR.delete(key); // un solo uso
  return new Response(val, { headers: CORS });
}
