// Cliente minimo de OpenSubtitles (API REST v1) para buscar y descargar subtitulos.
// La API key la ingresa el usuario en Ajustes (no se hardcodea ningun secreto).
// Docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api

const BASE = "https://api.opensubtitles.com/api/v1";

export interface SubtitleResult {
  fileId: number;
  language: string;
  release: string;
  downloads: number;
  fromTrusted: boolean;
}

interface SearchDto {
  data?: Array<{
    attributes?: {
      language?: string;
      release?: string;
      download_count?: number;
      from_trusted?: boolean;
      files?: Array<{ file_id?: number; file_name?: string }>;
    };
  }>;
}

interface DownloadDto {
  link?: string;
  message?: string;
  remaining?: number;
}

function headers(apiKey: string): Record<string, string> {
  // El navegador no permite fijar User-Agent; Api-Key alcanza para identificar la app.
  return { "Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" };
}

export interface SearchOpts {
  /** Solo el título (sin año); se envía en minúsculas como recomienda la API. */
  query: string;
  year?: string;
  type?: "movie" | "episode";
  season?: number;
  episode?: number;
  /** ej "en,es"; se ordena y baja a minúsculas (la API lo exige). */
  languages?: string;
}

/**
 * Busca subtitulos siguiendo la guía oficial: query = título en minúsculas,
 * year/type/season/episode como parámetros aparte, languages ordenados.
 * Con `relayBase` (companion) va por el proxy (evita CORS); si no, directo.
 */
export async function searchSubtitles(
  relayBase: string,
  apiKey: string,
  opts: SearchOpts,
): Promise<SubtitleResult[]> {
  const langs = (opts.languages ?? "en,es")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).sort().join(",");
  const p = new URLSearchParams();
  p.set("query", opts.query.trim().toLowerCase());
  p.set("languages", langs);
  p.set("order_by", "download_count");
  if (opts.year) p.set("year", opts.year);
  if (opts.type) p.set("type", opts.type);
  if (opts.season != null) p.set("season_number", String(opts.season));
  if (opts.episode != null) p.set("episode_number", String(opts.episode));
  const url = relayBase ? `${relayBase}/api/os/search?${p.toString()}` : `${BASE}/subtitles?${p.toString()}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(res.status === 401 ? "API key inválida" : `Error de búsqueda (${res.status})`);
  const dto = (await res.json()) as SearchDto;
  const out: SubtitleResult[] = [];
  for (const d of dto.data ?? []) {
    const a = d.attributes;
    const fileId = a?.files?.[0]?.file_id;
    if (!fileId) continue;
    out.push({
      fileId,
      language: (a?.language ?? "??").toUpperCase(),
      release: a?.release ?? "—",
      downloads: a?.download_count ?? 0,
      fromTrusted: !!a?.from_trusted,
    });
  }
  return out;
}

/** Pide el link de descarga y devuelve el subtitulo ya convertido a WebVTT. */
export async function downloadSubtitleVtt(relayBase: string, apiKey: string, fileId: number): Promise<string> {
  // Vía relay: el proxy devuelve directamente el SRT (evita CORS de API y CDN).
  if (relayBase) {
    const res = await fetch(`${relayBase}/api/os/download`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!res.ok) {
      if (res.status === 406 || res.status === 429) throw new Error("Límite de descargas diario alcanzado");
      throw new Error(res.status === 401 ? "API key inválida" : `No se pudo descargar (${res.status})`);
    }
    return srtToVtt(await res.text());
  }
  // Directo (sin relay): dos saltos, suele fallar por CORS en la TV.
  const res = await fetch(`${BASE}/download`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    if (res.status === 406 || res.status === 429) throw new Error("Límite de descargas diario alcanzado");
    throw new Error(res.status === 401 ? "API key inválida" : `No se pudo descargar (${res.status})`);
  }
  const dto = (await res.json()) as DownloadDto;
  if (!dto.link) throw new Error(dto.message || "Sin enlace de descarga");
  const srtRes = await fetch(dto.link);
  if (!srtRes.ok) throw new Error("No se pudo bajar el archivo");
  return srtToVtt(await srtRes.text());
}

/** Convierte SRT a WebVTT (los navegadores no cargan .srt en <track>). */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, "")
    // timestamps: coma -> punto
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}
