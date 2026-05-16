import type {
  Catalog,
  Category,
  Channel,
  Episode,
  Movie,
  SeriesInfo,
  SourceConfig,
} from "./types";
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
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

function toCategories(dtos: XtCategoryDto[]): Category[] {
  return dtos.map((c) => ({ id: c.category_id, name: c.category_name }));
}

function categoryName(list: Category[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return list.find((c) => c.id === id)?.name;
}

export async function loadXtreamCatalog(
  source: Extract<SourceConfig, { kind: "xtream" }>,
): Promise<Catalog> {
  const base = xtreamPlayerApi(source);

  const [liveCatsDto, liveDto, vodCatsDto, movieDto, seriesCatsDto, seriesDto] = await Promise.all([
    getJson<XtCategoryDto[]>(`${base}&action=get_live_categories`),
    getJson<XtLiveDto[]>(`${base}&action=get_live_streams`),
    getJson<XtCategoryDto[]>(`${base}&action=get_vod_categories`),
    getJson<XtMovieDto[]>(`${base}&action=get_vod_streams`),
    getJson<XtCategoryDto[]>(`${base}&action=get_series_categories`),
    getJson<XtSeriesDto[]>(`${base}&action=get_series`),
  ]);

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
