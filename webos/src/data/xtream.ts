import type {
  Catalog,
  Category,
  Channel,
  Episode,
  Movie,
  SeriesInfo,
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
}

interface XtSeriesDto {
  series_id: number;
  name: string;
  cover?: string;
  category_id?: string;
  plot?: string;
}

interface XtSeriesInfoDto {
  episodes?: Record<string, Array<{
    id: string;
    title: string;
    container_extension?: string;
    episode_num?: number;
    season?: number;
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

export async function loadXtreamCatalog(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  onProgress?: LoadProgress,
): Promise<Catalog> {
  const base = xtreamPlayerApi(source);
  const TOTAL = 6;
  // Pedidos en SERIE para que la TV no tenga que cargar 6 JSON grandes a la vez.
  // Tambien con timeouts largos: los listados grandes pueden tardar 60s+ en
  // bajar por wifi de TV.
  const longTimeout = 120000;

  onProgress?.("Categorías de canales", 1, TOTAL);
  const liveCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_live_categories`,
  );
  onProgress?.("Canales en vivo", 2, TOTAL);
  const liveDto = await fetchJson<XtLiveDto[]>(
    `${base}&action=get_live_streams`,
    longTimeout,
  );
  onProgress?.("Categorías de películas", 3, TOTAL);
  const vodCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_vod_categories`,
  );
  onProgress?.("Películas", 4, TOTAL);
  const movieDto = await fetchJson<XtMovieDto[]>(
    `${base}&action=get_vod_streams`,
    longTimeout,
  );
  onProgress?.("Categorías de series", 5, TOTAL);
  const seriesCatsDto = await fetchJson<XtCategoryDto[]>(
    `${base}&action=get_series_categories`,
  );
  onProgress?.("Series", 6, TOTAL);
  const seriesDto = await fetchJson<XtSeriesDto[]>(
    `${base}&action=get_series`,
    longTimeout,
  );

  const liveCats = toCategories(liveCatsDto);
  const vodCats = toCategories(vodCatsDto);
  const seriesCats = toCategories(seriesCatsDto);

  const liveChannels: Channel[] = liveDto.map((d) => ({
    id: `xt-live-${d.stream_id}`,
    name: d.name,
    streamUrl: xtreamStreamLive(source, d.stream_id),
    logoUrl: d.stream_icon || undefined,
    groupTitle: categoryName(liveCats, d.category_id),
    tvgId: d.epg_channel_id || undefined,
    kind: "live",
  }));

  const movies: Movie[] = movieDto.map((d) => ({
    id: `xt-vod-${d.stream_id}`,
    name: d.name,
    streamUrl: xtreamStreamMovie(source, d.stream_id, d.container_extension || "mp4"),
    posterUrl: d.stream_icon || undefined,
    category: categoryName(vodCats, d.category_id),
    plot: d.plot,
    rating: d.rating,
    year: d.releaseDate,
  }));

  const series: SeriesInfo[] = seriesDto.map((d) => ({
    id: String(d.series_id),
    name: d.name,
    posterUrl: d.cover || undefined,
    category: categoryName(seriesCats, d.category_id),
    plot: d.plot,
  }));

  return {
    liveChannels,
    liveCategories: liveCats,
    movies,
    movieCategories: vodCats,
    series,
    seriesCategories: seriesCats,
  };
}

export async function loadSeriesEpisodes(
  source: Extract<SourceConfig, { kind: "xtream" }>,
  seriesId: string,
): Promise<Episode[]> {
  const url = `${xtreamPlayerApi(source)}&action=get_series_info&series_id=${seriesId}`;
  const info = await getJson<XtSeriesInfoDto>(url);
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
      });
    }
  }
  episodes.sort((a, b) =>
    a.seasonNumber !== b.seasonNumber
      ? a.seasonNumber - b.seasonNumber
      : a.episodeNumber - b.episodeNumber,
  );
  return episodes;
}
