// Sirve un subtítulo como VTT en una URL http real, para pasárselo al <track>
// del reproductor nativo de webOS (que no acepta blob:). La Api-Key viaja por
// query porque un <track> no puede mandar headers. Cachea en KV para no gastar
// la cuota de descarga de OpenSubtitles en cada request del player.

const HDRS = {
  "content-type": "text/vtt; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=21600",
};

function srtToVtt(srt) {
  const b = srt.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return /^\s*WEBVTT/.test(b) ? b : `WEBVTT\n\n${b}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileId = (url.searchParams.get("file_id") || "").replace(/\D/g, "");
  const key = url.searchParams.get("key") || "";
  if (!fileId || !key) return new Response("WEBVTT\n\nNOTE parámetros faltantes\n", { status: 400, headers: HDRS });

  const kvKey = `osfile:${fileId}`;
  if (env.PAIR) {
    const cached = await env.PAIR.get(kvKey);
    if (cached) return new Response(cached, { headers: HDRS });
  }

  const dl = await fetch("https://api.opensubtitles.com/api/v1/download", {
    method: "POST",
    headers: { "Api-Key": key, "User-Agent": "POTRI v1.0", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ file_id: Number(fileId) }),
  });
  const data = await dl.json().catch(() => ({}));
  if (!dl.ok || !data.link) return new Response("WEBVTT\n\nNOTE no se pudo descargar\n", { status: dl.status || 502, headers: HDRS });
  const srtRes = await fetch(data.link);
  if (!srtRes.ok) return new Response("WEBVTT\n\nNOTE error de CDN\n", { status: 502, headers: HDRS });
  const vtt = srtToVtt(await srtRes.text());
  if (env.PAIR) { try { await env.PAIR.put(kvKey, vtt, { expirationTtl: 21600 }); } catch { /* sin cache */ } }
  return new Response(vtt, { headers: HDRS });
}
