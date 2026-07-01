// Proxy de búsqueda de OpenSubtitles (evita el bloqueo CORS del navegador/TV y
// agrega el User-Agent que la API exige). La TV manda su Api-Key en el header.

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,api-key",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

// Parámetros seguros de /subtitles que reenviamos tal cual a OpenSubtitles.
const PASS = ["query", "languages", "year", "type", "season_number", "episode_number", "order_by", "imdb_id", "tmdb_id", "parent_imdb_id", "parent_tmdb_id", "page"];

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const apiKey = request.headers.get("api-key") || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "falta api key" }), { status: 400, headers: CORS });
  if (!url.searchParams.get("query")) return new Response(JSON.stringify({ error: "falta query" }), { status: 400, headers: CORS });

  const out = new URLSearchParams();
  for (const k of PASS) {
    const v = url.searchParams.get(k);
    if (v) out.set(k, v);
  }
  const osUrl = `https://api.opensubtitles.com/api/v1/subtitles?${out.toString()}`;
  const r = await fetch(osUrl, {
    headers: { "Api-Key": apiKey, "User-Agent": "POTRI v1.0", Accept: "application/json" },
  });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: CORS });
}
