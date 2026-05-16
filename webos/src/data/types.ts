export type MediaKind = "live" | "movie" | "series-episode";

export interface Channel {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl?: string;
  groupTitle?: string;
  tvgId?: string;
  kind: MediaKind;
}

export interface Movie {
  id: string;
  name: string;
  streamUrl: string;
  posterUrl?: string;
  category?: string;
  plot?: string;
  rating?: string;
  year?: string;
}

export interface SeriesInfo {
  id: string;
  name: string;
  posterUrl?: string;
  category?: string;
  plot?: string;
}

export interface Episode {
  id: string;
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  streamUrl: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface EpgProgram {
  channelTvgId: string;
  title: string;
  description?: string;
  startMs: number;
  stopMs: number;
}

export interface Catalog {
  liveChannels: Channel[];
  liveCategories: Category[];
  movies: Movie[];
  movieCategories: Category[];
  series: SeriesInfo[];
  seriesCategories: Category[];
}

export type SourceConfig =
  | { kind: "m3u"; playlistUrl: string; epgUrl?: string }
  | { kind: "xtream"; server: string; username: string; password: string };

export function xtreamPlayerApi(s: Extract<SourceConfig, { kind: "xtream" }>): string {
  return `${s.server.replace(/\/$/, "")}/player_api.php?username=${encodeURIComponent(
    s.username,
  )}&password=${encodeURIComponent(s.password)}`;
}

export function xtreamStreamLive(
  s: Extract<SourceConfig, { kind: "xtream" }>,
  streamId: number,
  ext = "ts",
): string {
  return `${s.server.replace(/\/$/, "")}/live/${s.username}/${s.password}/${streamId}.${ext}`;
}

export function xtreamStreamMovie(
  s: Extract<SourceConfig, { kind: "xtream" }>,
  streamId: number,
  ext: string,
): string {
  return `${s.server.replace(/\/$/, "")}/movie/${s.username}/${s.password}/${streamId}.${ext}`;
}

export function xtreamStreamSeries(
  s: Extract<SourceConfig, { kind: "xtream" }>,
  episodeId: string | number,
  ext: string,
): string {
  return `${s.server.replace(/\/$/, "")}/series/${s.username}/${s.password}/${episodeId}.${ext}`;
}

export function xtreamXmltvUrl(s: Extract<SourceConfig, { kind: "xtream" }>): string {
  return `${s.server.replace(/\/$/, "")}/xmltv.php?username=${encodeURIComponent(
    s.username,
  )}&password=${encodeURIComponent(s.password)}`;
}
