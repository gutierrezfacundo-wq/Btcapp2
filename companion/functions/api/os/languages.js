// Proxy de idiomas soportados por OpenSubtitles (cacheable del lado del cliente).

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,api-key",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  const { request } = context;
  const apiKey = request.headers.get("api-key") || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "falta api key" }), { status: 400, headers: CORS });
  const r = await fetch("https://api.opensubtitles.com/api/v1/infos/languages", {
    headers: { "Api-Key": apiKey, "User-Agent": "POTRI v1.0", Accept: "application/json" },
  });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: CORS });
}
