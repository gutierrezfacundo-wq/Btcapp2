// Proxy mínimo para que el celular pueda consultar la API Xtream desde el
// navegador (los servidores IPTV no mandan CORS). Para no ser un proxy abierto
// pide el código del control remoto (?c=) de una TV prendida y solo va al
// servidor Xtream que esa TV tiene activo (lo registra /api/cmd con hb=1), y
// solo a player_api.php.

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
  const qs = new URL(context.request.url).searchParams;
  const u = qs.get("u") || "";
  const code = String(qs.get("c") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (!context.env.PAIR) return new Response(JSON.stringify({ error: "KV no configurado" }), { status: 500, headers: CORS });
  let live = null;
  if (code.length >= 6) {
    try { live = JSON.parse((await context.env.PAIR.get("live:" + code)) || "null"); } catch { live = null; }
  }
  if (!live || !live.host) {
    return new Response(JSON.stringify({ error: "Abrí POTRI en la TV (con una lista Xtream) y volvé a intentar." }), { status: 403, headers: CORS });
  }
  let target;
  try { target = new URL(u); } catch { return new Response(JSON.stringify({ error: "url inválida" }), { status: 400, headers: CORS }); }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response(JSON.stringify({ error: "protocolo no permitido" }), { status: 400, headers: CORS });
  }
  if (target.host.toLowerCase() !== live.host) {
    return new Response(JSON.stringify({ error: "Ese no es el servidor que tiene activo la TV." }), { status: 403, headers: CORS });
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
