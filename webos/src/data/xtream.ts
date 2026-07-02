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
    director?: string;
    cast?: string;
    actors?: string;
  };
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
    director: i.director || undefined,
    cast: i.cast || i.actors || undefined,
  };
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
