// Proxy mínimo para que el celular pueda consultar la API Xtream desde el
// navegador (los servidores IPTV no mandan CORS). Restringido a player_api.php
// para no ser un proxy abierto.

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  const u = new URL(context.request.url).searchParams.get("u") || "";
  let target;
  try { target = new URL(u); } catch { return new Response(JSON.stringify({ error: "url inválida" }), { status: 400, headers: CORS }); }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response(JSON.stringify({ error: "protocolo no permitido" }), { status: 400, headers: CORS });
  }
  if (!target.pathname.endsWith("/player_api.php")) {
    return new Response(JSON.stringify({ error: "solo player_api" }), { status: 403, headers: CORS });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(target.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    const body = await r.text();
    return new Response(body, { status: r.status, headers: CORS });
  } catch {
    return new Response(JSON.stringify({ error: "no se pudo conectar al proveedor" }), { status: 502, headers: CORS });
  }
}
