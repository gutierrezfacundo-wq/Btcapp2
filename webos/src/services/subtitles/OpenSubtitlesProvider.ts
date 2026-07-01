import type { SubtitleService } from "./SubtitleService";
import type { SubtitleConfig } from "./config";
import { TtlCache, type SubtitleCache } from "./cache";
import { consoleLogger, type SubtitleLogger } from "./logger";
import {
  SubtitleError,
  type Language,
  type SubtitleFile,
  type SubtitleResult,
  type SubtitleSearchRequest,
} from "./types";

const OS_BASE = "https://api.opensubtitles.com/api/v1";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderDeps {
  fetchFn?: FetchFn;
  cache?: SubtitleCache;
  logger?: SubtitleLogger;
  now?: () => number;
}

interface OsSearchDto {
  data?: Array<{
    id?: string;
    attributes?: {
      language?: string;
      release?: string;
      download_count?: number;
      ratings?: number;
      hearing_impaired?: boolean;
      uploader?: { name?: string };
      files?: Array<{ file_id?: number; file_name?: string }>;
    };
  }>;
}

/** Convierte SRT a WebVTT (los navegadores solo cargan VTT en <track>). */
export function srtToVtt(srt: string): string {
  const body = srt.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return /^\s*WEBVTT/.test(body) ? body : `WEBVTT\n\n${body}`;
}

/** Proveedor OpenSubtitles. Habla con la API oficial (vía relay para CORS). */
export class OpenSubtitlesProvider implements SubtitleService {
  private readonly fetchFn: FetchFn;
  private readonly cache: SubtitleCache;
  private readonly log: SubtitleLogger;
  private readonly now: () => number;

  constructor(private readonly config: SubtitleConfig, deps: ProviderDeps = {}) {
    this.fetchFn = deps.fetchFn ?? ((u, i) => fetch(u, i));
    this.cache = deps.cache ?? new TtlCache("subs.os", config.cacheTtlMs);
    this.log = deps.logger ?? consoleLogger;
    this.now = deps.now ?? (() => Date.now());
  }

  // ---- endpoints (relay si hay; directo si no) ----
  private searchUrl(qs: string): string {
    return this.config.relayBase ? `${this.config.relayBase}/api/os/search?${qs}` : `${OS_BASE}/subtitles?${qs}`;
  }
  private downloadUrl(): string {
    return this.config.relayBase ? `${this.config.relayBase}/api/os/download` : `${OS_BASE}/download`;
  }
  private languagesUrl(): string {
    return this.config.relayBase ? `${this.config.relayBase}/api/os/languages` : `${OS_BASE}/infos/languages`;
  }
  private headers(): Record<string, string> {
    return { "Api-Key": this.config.apiKey, "Content-Type": "application/json", Accept: "application/json" };
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    if (!this.config.apiKey) throw new SubtitleError("no_api_key", "Falta la API key de OpenSubtitles");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, headers: this.headers(), signal: ctrl.signal });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") throw new SubtitleError("timeout", "La operación tardó demasiado");
      throw new SubtitleError("network", "Error de red al contactar el servicio");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw this.httpError(res.status);
    return res;
  }

  private httpError(status: number): SubtitleError {
    if (status === 401 || status === 403) return new SubtitleError("auth", "API key inválida o sin permisos", status);
    if (status === 406 || status === 429) return new SubtitleError("rate_limit", "Límite de descargas/consultas alcanzado", status);
    if (status === 404) return new SubtitleError("not_found", "No encontrado", status);
    return new SubtitleError("http", `Error del servicio (${status})`, status);
  }

  private buildQuery(req: SubtitleSearchRequest): string {
    const p = new URLSearchParams();
    // Prioridad: imdb → tmdb → parent ids (episodios) → título.
    if (req.imdbId) p.set("imdb_id", req.imdbId.replace(/^tt/i, ""));
    else if (req.tmdbId) p.set("tmdb_id", req.tmdbId);
    else if (req.type === "episode" && req.parentTmdbId) p.set("parent_tmdb_id", req.parentTmdbId);
    else if (req.type === "episode" && req.parentImdbId) p.set("parent_imdb_id", req.parentImdbId.replace(/^tt/i, ""));
    else if (req.title) p.set("query", req.title.trim().toLowerCase());

    if (req.type) p.set("type", req.type);
    if (req.year && !req.imdbId && !req.tmdbId) p.set("year", req.year);
    if (req.season != null) p.set("season_number", String(req.season));
    if (req.episode != null) p.set("episode_number", String(req.episode));
    const langs = (req.languages && req.languages.length ? req.languages : ["es", "en"])
      .map((l) => l.trim().toLowerCase()).filter(Boolean).sort();
    p.set("languages", langs.join(","));
    p.set("order_by", "download_count");
    return p.toString();
  }

  async searchSubtitles(req: SubtitleSearchRequest): Promise<SubtitleResult[]> {
    if (!this.config.relayBase && !this.config.apiKey) throw new SubtitleError("no_api_key", "Falta la API key");
    const qs = this.buildQuery(req);
    const cacheKey = `search:${qs}`;
    const cached = this.cache.get<SubtitleResult[]>(cacheKey);
    if (cached) {
      this.log.info("search.cache_hit", { results: cached.length });
      return cached;
    }
    const started = this.now();
    let dto: OsSearchDto;
    try {
      const res = await this.request(this.searchUrl(qs));
      dto = (await res.json()) as OsSearchDto;
    } catch (e) {
      this.log.error("search.error", { code: (e as SubtitleError).code, ms: this.now() - started });
      throw e instanceof SubtitleError ? e : new SubtitleError("unknown", "Error inesperado en la búsqueda");
    }
    const results: SubtitleResult[] = [];
    for (const d of dto.data ?? []) {
      const a = d.attributes;
      const fileId = a?.files?.[0]?.file_id;
      if (!fileId) continue;
      results.push({
        id: String(d.id ?? fileId),
        fileId,
        language: (a?.language ?? "??").toUpperCase(),
        languageCode: (a?.language ?? "").toLowerCase(),
        release: a?.release ?? "—",
        uploader: a?.uploader?.name ?? "—",
        downloads: a?.download_count ?? 0,
        rating: a?.ratings ?? 0,
        hearingImpaired: !!a?.hearing_impaired,
        fileName: a?.files?.[0]?.file_name ?? a?.release ?? "subtitle",
      });
    }
    this.cache.set(cacheKey, results);
    this.log.info("search.ok", { provider: "opensubtitles", results: results.length, ms: this.now() - started });
    return results;
  }

  async downloadSubtitle(fileId: number): Promise<SubtitleFile> {
    const cacheKey = `file:${fileId}`;
    const cached = this.cache.get<SubtitleFile>(cacheKey);
    if (cached) return cached;
    const started = this.now();
    try {
      const res = await this.request(this.downloadUrl(), { method: "POST", body: JSON.stringify({ file_id: fileId }) });
      // El relay devuelve el SRT como texto; la API directa devuelve {link}.
      const ctype = res.headers.get("content-type") ?? "";
      let srt: string;
      if (ctype.includes("application/json")) {
        const j = (await res.json()) as { link?: string; message?: string };
        if (!j.link) throw new SubtitleError("not_found", j.message || "Sin enlace de descarga");
        const fileRes = await this.fetchFn(j.link);
        if (!fileRes.ok) throw this.httpError(fileRes.status);
        srt = await fileRes.text();
      } else {
        srt = await res.text();
      }
      const file: SubtitleFile = { content: srtToVtt(srt), format: "vtt", encoding: "utf-8" };
      this.cache.set(cacheKey, file);
      this.log.info("download.ok", { fileId, ms: this.now() - started });
      return file;
    } catch (e) {
      this.log.error("download.error", { code: (e as SubtitleError).code, fileId });
      throw e instanceof SubtitleError ? e : new SubtitleError("unknown", "No se pudo descargar el subtítulo");
    }
  }

  async getSupportedLanguages(): Promise<Language[]> {
    const cached = this.cache.get<Language[]>("languages");
    if (cached) return cached;
    try {
      const res = await this.request(this.languagesUrl());
      const j = (await res.json()) as { data?: Array<{ language_code?: string; language_name?: string }> };
      const langs = (j.data ?? [])
        .filter((l) => l.language_code && l.language_name)
        .map((l) => ({ code: l.language_code as string, name: l.language_name as string }));
      const out = langs.length ? langs : DEFAULT_LANGUAGES;
      this.cache.set("languages", out);
      return out;
    } catch {
      // Degradar a lista estática si el endpoint falla: no rompemos la UI.
      return DEFAULT_LANGUAGES;
    }
  }
}

export const DEFAULT_LANGUAGES: Language[] = [
  { code: "es", name: "Español" },
  { code: "en", name: "Inglés" },
  { code: "pt-br", name: "Portugués (BR)" },
  { code: "pt-pt", name: "Portugués (PT)" },
  { code: "fr", name: "Francés" },
  { code: "it", name: "Italiano" },
  { code: "de", name: "Alemán" },
];
