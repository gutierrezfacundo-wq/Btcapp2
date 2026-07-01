// Proxy de descarga de OpenSubtitles: pide el link firmado y devuelve el
// contenido del subtítulo (texto), evitando CORS tanto en la API como en el CDN.

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,api-key",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request } = context;
  const apiKey = request.headers.get("api-key") || "";
  let fileId;
  try { fileId = (await request.json()).file_id; } catch { fileId = null; }
  if (!apiKey || !fileId) return new Response(JSON.stringify({ error: "faltan datos" }), { status: 400, headers: CORS });

  const dl = await fetch("https://api.opensubtitles.com/api/v1/download", {
    method: "POST",
    headers: { "Api-Key": apiKey, "User-Agent": "POTRI v1.0", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await dl.json().catch(() => ({}));
  if (!dl.ok || !data.link) {
    return new Response(JSON.stringify({ error: data.message || `descarga falló (${dl.status})` }), { status: dl.status || 500, headers: CORS });
  }
  const srtRes = await fetch(data.link);
  if (!srtRes.ok) return new Response(JSON.stringify({ error: "no se pudo bajar el archivo" }), { status: 502, headers: CORS });
  const srt = await srtRes.text();
  return new Response(srt, { status: 200, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
}
