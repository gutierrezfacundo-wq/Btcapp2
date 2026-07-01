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

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const languages = url.searchParams.get("languages") || "es,en";
  const year = url.searchParams.get("year") || "";
  const apiKey = request.headers.get("api-key") || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "falta api key" }), { status: 400, headers: CORS });
  if (!query) return new Response(JSON.stringify({ error: "falta query" }), { status: 400, headers: CORS });

  const yq = year ? `&year=${encodeURIComponent(year)}` : "";
  const osUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(query)}&languages=${encodeURIComponent(languages)}${yq}&order_by=download_count`;
  const r = await fetch(osUrl, {
    headers: { "Api-Key": apiKey, "User-Agent": "POTRI v1.0", Accept: "application/json" },
  });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: CORS });
}
