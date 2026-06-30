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

/** Busca subtitulos por nombre. `languages` ej: "es,en". */
export async function searchSubtitles(
  apiKey: string,
  query: string,
  languages = "es,en",
): Promise<SubtitleResult[]> {
  const url = `${BASE}/subtitles?query=${encodeURIComponent(query)}&languages=${encodeURIComponent(languages)}&order_by=download_count`;
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
export async function downloadSubtitleVtt(apiKey: string, fileId: number): Promise<string> {
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
  const srt = await srtRes.text();
  return srtToVtt(srt);
}

/** Convierte SRT a WebVTT (los navegadores no cargan .srt en <track>). */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, "")
    // timestamps: coma -> punto
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}
