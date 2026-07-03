import type {
  Catalog,
  Category,
  Channel,
  Episode,
  Movie,
  SeriesInfo,
  SeriesMeta,
  SourceConfig,
} from "./types";
import { fetchJson } from "./http";
import {
  xtreamPlayerApi,
  xtreamStreamLive,
  xtreamStreamMovie,
  xtreamStreamSeries,
} from "./types";

interface XtCategoryDto {
  category_id: string;
  category_name: string;
}

interface XtLiveDto {
  stream_id: number;
  name: string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id?: string;
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
}

interface XtMovieDto {
  stream_id: number;
  name: string;
  stream_icon?: string;
  container_extension?: string;
  category_id?: string;
  rating?: string;
  plot?: string;
  releaseDate?: string;
  added?: string;
}

interface XtSeriesDto {
  series_id: number;
  name: string;
  cover?: string;
  category_id?: string;
  plot?: string;
  releaseDate?: string;
  last_modified?: string;
}

interface XtSeriesInfoDto {
  info?: {
    rating?: string | number;
    rating_5based?: number;
    releaseDate?: string;
    release_date?: string;
    genre?: string;
    plot?: string;
    cover?: string;
    backdrop_path?: string[] | string;
    tmdb?: string | number;
    tmdb_id?: string | number;
  };
  episodes?: Record<string, Array<{
    id: string;
    title: string;
    container_extension?: string;
    episode_num?: number;
    season?: number;
    info?: {
      movie_image?: string;
      duration?: string;
      plot?: string;
    };
  }>>;
}


async function getJson<T>(url: string): Promise<T> {
  return fetchJson<T>(url);
}

function toCategories(dtos: XtCategoryDto[]): Category[] {
  return dtos.map((c) => ({ id: c.category_id, name: c.category_name }));
}

function categoryName(list: Category[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return list.find((c) => c.id === id)?.name;
}

/** Estado de la cuenta Xtream (player_api user_info + server_info). */
export interface AccountInfo {
  status?: string;
  expDate?: number;        // ms
  activeCons?: number;
  maxCons?: number;
  trial?: boolean;
  /** Formatos de salida que permite el proveedor para en vivo (m3u8/ts/rtmp). */
  allowedFormats?: string[];
  /**
   * Desfasaje detectado entre el reloj del proveedor y el de la TV (ms).
   * Positivo = la guía del proveedor viene "adelantada" respecto de acá.
   * Redondeado a 15 min; 0 si la diferencia es menor a 5 min.
   */
  epgAutoOffsetMs?: number;
}

interface XtUserInfoDto {
  user_info?: {
    status?: string;
    exp_date?: string | number | null;
    active_cons?: string | number;
    max_connections?: string | number;
    is_trial?: string | number;
    allowed_output_formats?: string[];
  };
  server_info?: {
    time_now?: string;       // "YYYY-MM-DD HH:MM:SS" en hora local del servidor
    timestamp_now?: string | number;
    timezone?: string;
  };
}

/**
 * El XMLTV de muchos proveedores viene en hora local del servidor etiquetada
 * como UTC: comparando time_now (parseado como UTC) contra el reloj real de
 * la TV sale la corrección que hay que aplicarle a la guía.
 */
function computeEpgAutoOffset(timeNow: string | undefined): number | undefined {
  if (!timeNow) return undefined;
  const m = timeNow.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return undefined;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const deltaMs = Date.now() - asUtc; // cuánto hay que correr la guía
  if (Math.abs(deltaMs) < 5 * 60000) return 0;
  if (Math.abs(deltaMs) > 14 * 3600000) return undefined; // reloj roto: no confiar
  const q = 15 * 60000;
  return Math.round(deltaMs / q) * q;
}

export async function loadAccountInfo(
  source: Extract<SourceConfig, { kind: "xtream" }>,
): Promise<AccountInfo> {
  const dto = await getJson<XtUserInfoDto>(xtreamPlayerApi(source));
  const u = dto.user_info ?? {};
  const s = dto.server_info ?? {};
  return {
    status: u.status || undefined,
    expDate: u.exp_date ? Number(u.exp_date) * 1000 || undefined : undefined,
    activeCons: u.active_cons != null ? Number(u.active_cons) : undefined,
    maxCons: u.max_connections != null ? Number(u.max_connections) : undefined,
    trial: Number(u.is_trial) === 1,
    allowedFormats: Array.isArray(u.allowed_output_formats)
      ? u.allowed_output_formats.map((f) => String(f).toLowerCase())
      : undefined,
    epgAutoOffsetMs: computeEpgAutoOffset(s.time_now),
  };
}

/**
 * Diagnóstico al fallar un stream: si la cuenta está al límite de conexiones
 * (o vencida), devuelve un mensaje claro; si no, null.
 */
export async function diagnoseStreamError(
  source: Extract<SourceConfig, { kind: "xtream" }>,
): Promise<string | null> {
  try {
    const a = await loadAccountInfo(source);
    if (a.status && a.status.toLowerCase() !== "active") {
      return `La cuenta figura "${a.status}" en el proveedor.`;
    }
    if (a.expDate && a.expDate < Date.now()) {
      return "La lista está vencida: renovala con tu proveedor.";
    }
    if (a.maxCons && a.activeCons != null && a.activeCons >= a.maxCons) {
      return `Estás usando todas las conexiones de la cuenta (${a.activeCons}/${a.maxCons}). Cerrá la reproducción en otro dispositivo y reintentá.`;
    }
    return null;
  } catch {
    return null;
  }
}

export type LoadProgress = (step: string, current: number, total: number) => void;

const LONG_TIMEOUT = 120000;

/** Carga SOLO la seccion En Vivo (rapido, bajo consumo de memoria). */
export async function loadXtreamLive(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  onProgress?: LoadProgress,
): Promise<Pick<Catalog, "liveChannels" | "liveCategories">> {
  const base = xtreamPlayerApi(source);
  onProgress?.("Categorías de canales", 1, 2);
  const liveCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_live_categories`,
  );
  onProgress?.("Canales en vivo", 2, 2);
  const liveDto = await fetchJson<XtLiveDto[]>(
    `${base}&action=get_live_streams`,
    LONG_TIMEOUT,
  );
  const liveCats = toCategories(liveCatsDto);
  const liveChannels: Channel[] = liveDto.map((d) => ({
    id: `xt-live-${d.stream_id}`,
    name: d.name,
    streamUrl: xtreamStreamLive(source, d.stream_id),
    logoUrl: d.stream_icon || undefined,
    groupTitle: categoryName(liveCats, d.category_id),
    tvgId: d.epg_channel_id || undefined,
    kind: "live",
    archiveDays: Number(d.tv_archive) ? Number(d.tv_archive_duration) || 1 : undefined,
  }));
  return { liveChannels, liveCategories: liveCats };
}

/** Carga la seccion Peliculas a demanda. */
export async function loadXtreamMovies(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  onProgress?: LoadProgress,
): Promise<Pick<Catalog, "movies" | "movieCategories">> {
  const base = xtreamPlayerApi(source);
  onProgress?.("Categorías de películas", 1, 2);
  const vodCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_vod_categories`,
  );
  onProgress?.("Películas", 2, 2);
  const movieDto = await fetchJson<XtMovieDto[]>(
    `${base}&action=get_vod_streams`,
    LONG_TIMEOUT,
  );
  const vodCats = toCategories(vodCatsDto);
  const movies: Movie[] = movieDto.map((d) => ({
    id: `xt-vod-${d.stream_id}`,
    name: d.name,
    streamUrl: xtreamStreamMovie(source, d.stream_id, d.container_extension || "mp4"),
    posterUrl: d.stream_icon || undefined,
    category: categoryName(vodCats, d.category_id),
    plot: d.plot,
    rating: d.rating,
    year: d.releaseDate,
    addedAt: d.added ? Number(d.added) || undefined : undefined,
  }));
  return { movies, movieCategories: vodCats };
}

/** Carga la seccion Series a demanda. */
export async function loadXtreamSeries(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  onProgress?: LoadProgress,
): Promise<Pick<Catalog, "series" | "seriesCategories">> {
  const base = xtreamPlayerApi(source);
  onProgress?.("Categorías de series", 1, 2);
  const seriesCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_series_categories`,
  );
  onProgress?.("Series", 2, 2);
  const seriesDto = await fetchJson<XtSeriesDto[]>(
    `${base}&action=get_series`,
    LONG_TIMEOUT,
  );
  const seriesCats = toCategories(seriesCatsDto);
  const series: SeriesInfo[] = seriesDto.map((d) => ({
    id: String(d.series_id),
    name: d.name,
    posterUrl: d.cover || undefined,
    category: categoryName(seriesCats, d.category_id),
    plot: d.plot,
    year: d.releaseDate ? d.releaseDate.slice(0, 4) : undefined,
    addedAt: d.last_modified ? Number(d.last_modified) || undefined : undefined,
  }));
  return { series, seriesCategories: seriesCats };
}

/** Carga TODO el catalogo (compat M3U; uso desafiante en TV con listas grandes). */
export async function loadXtreamCatalog(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  onProgress?: LoadProgress,
): Promise<Catalog> {
  const live = await loadXtreamLive(source, (s, c) => onProgress?.(s, c, 6));
  const movies = await loadXtreamMovies(source, (s, c) => onProgress?.(s, c + 2, 6));
  const series = await loadXtreamSeries(source, (s, c) => onProgress?.(s, c + 4, 6));
  return { ...live, ...movies, ...series };
}

/** Metadatos del detalle de película (get_vod_info), mejor esfuerzo. */
export interface MovieDetails {
  /** Nombre y stream (de movie_data): permiten renderizar el detalle sin el catálogo. */
  name?: string;
  streamUrl?: string;
  plot?: string;
  genre?: string;
  rating?: string;
  year?: string;
  duration?: string;
  posterUrl?: string;
  /** Imagen apaisada para el fondo del hero (backdrop). */
  backdropUrl?: string;
  director?: string;
  cast?: string;
}

interface XtVodInfoDto {
  movie_data?: {
    name?: string;
    container_extension?: string;
  };
  info?: {
    plot?: string;
    description?: string;
    genre?: string;
    rating?: string | number;
    releasedate?: string;
    releaseDate?: string;
    duration?: string;
    movie_image?: string;
    cover_big?: string;
    backdrop_path?: string[] | string;
    director?: string;
    cast?: string;
    actors?: string;
  };
}

/** backdrop_path puede venir como array o string; devolvemos la primera URL válida. */
function firstBackdrop(b: string[] | string | undefined): string | undefined {
  const v = Array.isArray(b) ? b[0] : b;
  return v && /^https?:\/\//.test(v) ? v : undefined;
}

export async function loadMovieInfo(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  streamId: string,
): Promise<MovieDetails> {
  const url = `${xtreamPlayerApi(source)}&action=get_vod_info&vod_id=${streamId}`;
  const dto = await getJson<XtVodInfoDto>(url);
  const i = dto.info ?? {};
  const yearRaw = i.releasedate || i.releaseDate || "";
  const rating = i.rating != null ? String(i.rating).trim() : "";
  const md = dto.movie_data;
  return {
    name: md?.name || undefined,
    streamUrl: xtreamStreamMovie(source, Number(streamId), md?.container_extension || "mp4"),
    plot: i.plot || i.description || undefined,
    genre: i.genre || undefined,
    rating: rating && rating !== "0" ? rating : undefined,
    year: yearRaw ? String(yearRaw).slice(0, 4) : undefined,
    duration: i.duration || undefined,
    posterUrl: i.movie_image || i.cover_big || undefined,
    backdropUrl: firstBackdrop(i.backdrop_path),
    director: i.director || undefined,
    cast: i.cast || i.actors || undefined,
  };
}

/** Programa de la guía del canal (get_simple_data_table). */
export interface CatchupProgram {
  title: string;
  /** "YYYY-MM-DD HH:MM:SS" en hora del proveedor (se usa tal cual para timeshift). */
  start: string;
  end: string;
  startTs: number;
  stopTs: number;
  durationMins: number;
  /** Terminado y con archivo: reproducible vía timeshift. */
  hasArchive: boolean;
}

interface XtEpgDto {
  epg_listings?: Array<{
    title?: string;
    start?: string;
    end?: string;
    stop?: string;
    start_timestamp?: string | number;
    stop_timestamp?: string | number;
    has_archive?: number | string;
  }>;
}

function b64Title(t: string | undefined): string {
  if (!t) return "Programa";
  try { return decodeURIComponent(escape(atob(t))); } catch { return t; }
}

/** Guía completa del canal: pasada (con flag de archivo), actual y futura. */
export async function loadChannelGuide(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  streamId: string,
): Promise<CatchupProgram[]> {
  const url = `${xtreamPlayerApi(source)}&action=get_simple_data_table&stream_id=${streamId}`;
  const dto = await getJson<XtEpgDto>(url);
  const nowTs = Math.floor(Date.now() / 1000);
  const out: CatchupProgram[] = [];
  for (const e of dto.epg_listings ?? []) {
    const startTs = Number(e.start_timestamp) || 0;
    const stopTs = Number(e.stop_timestamp) || 0;
    if (!startTs || !stopTs) continue;
    out.push({
      title: b64Title(e.title),
      start: e.start ?? "",
      end: e.end ?? e.stop ?? "",
      startTs,
      stopTs,
      durationMins: Math.max(1, Math.round((stopTs - startTs) / 60)),
      hasArchive: Number(e.has_archive) === 1 && stopTs < nowTs,
    });
  }
  out.sort((a, b) => a.startTs - b.startTs);
  return out;
}

/** Programa "ahora / después" de get_short_epg (respaldo cuando no hay XMLTV). */
export interface ShortEpgProgram {
  title: string;
  startMs: number;
  stopMs: number;
}

/**
 * EPG corto de un canal directo del proveedor. Respaldo del preview cuando el
 * XMLTV no trae ese canal (o todavía no cargó).
 */
export async function loadShortEpg(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  streamId: string,
  limit = 2,
): Promise<ShortEpgProgram[]> {
  const url = `${xtreamPlayerApi(source)}&action=get_short_epg&stream_id=${streamId}&limit=${limit}`;
  const dto = await getJson<XtEpgDto>(url);
  const out: ShortEpgProgram[] = [];
  for (const e of dto.epg_listings ?? []) {
    const startTs = Number(e.start_timestamp) || 0;
    const stopTs = Number(e.stop_timestamp) || 0;
    if (!startTs || !stopTs) continue;
    out.push({ title: b64Title(e.title), startMs: startTs * 1000, stopMs: stopTs * 1000 });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

export async function loadSeriesEpisodes(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  seriesId: string,
): Promise<{ episodes: Episode[]; meta: SeriesMeta }> {
  const url = `${xtreamPlayerApi(source)}&action=get_series_info&series_id=${seriesId}`;
  const info = await getJson<XtSeriesInfoDto>(url);
  const yearRaw = info.info?.releaseDate || info.info?.release_date || "";
  const ratingNum = info.info?.rating != null ? String(info.info.rating).trim() : "";
  const tmdbRaw = info.info?.tmdb_id ?? info.info?.tmdb;
  const meta: SeriesMeta = {
    rating: ratingNum && ratingNum !== "0" ? ratingNum : undefined,
    year: yearRaw ? yearRaw.slice(0, 4) : undefined,
    genre: info.info?.genre || undefined,
    plot: info.info?.plot || undefined,
    posterUrl: info.info?.cover || undefined,
    backdropUrl: firstBackdrop(info.info?.backdrop_path),
    tmdbId: tmdbRaw != null && String(tmdbRaw).trim() ? String(tmdbRaw).trim() : undefined,
  };
  const episodes: Episode[] = [];
  for (const [seasonKey, list] of Object.entries(info.episodes ?? {})) {
    const seasonFromKey = parseInt(seasonKey, 10) || 0;
    for (const e of list) {
      const ext = e.container_extension || "mp4";
      episodes.push({
        id: `xt-series-${seriesId}-${e.id}`,
        seriesId,
        seasonNumber: e.season ?? seasonFromKey,
        episodeNumber: e.episode_num ?? 0,
        title: e.title,
        streamUrl: xtreamStreamSeries(source, e.id, ext),
        thumbUrl: e.info?.movie_image || undefined,
        duration: e.info?.duration || undefined,
        plot: e.info?.plot || undefined,
      });
    }
  }
  episodes.sort((a, b) =>
    a.seasonNumber !== b.seasonNumber
      ? a.seasonNumber - b.seasonNumber
      : a.episodeNumber - b.episodeNumber,
  );
  return { episodes, meta };
}
