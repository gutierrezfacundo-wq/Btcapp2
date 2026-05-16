import type { Catalog, Category, Movie, SeriesInfo, SourceConfig } from "./types";
import { parseM3u } from "./m3u";

export async function loadM3uCatalog(
  source: Extract<SourceConfig, { kind: "m3u" }>,
): Promise<Catalog> {
  const r = await fetch(source.playlistUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status} al obtener la lista`);
  const text = await r.text();
  const all = parseM3u(text);

  const live = all.filter((c) => c.kind === "live");
  const movies: Movie[] = all
    .filter((c) => c.kind === "movie")
    .map((c) => ({
      id: c.id,
      name: c.name,
      streamUrl: c.streamUrl,
      posterUrl: c.logoUrl,
      category: c.groupTitle,
    }));
  const series: SeriesInfo[] = all
    .filter((c) => c.kind === "series-episode")
    .map((c) => ({
      id: c.id,
      name: c.name,
      posterUrl: c.logoUrl,
      category: c.groupTitle,
    }));

  function categoriesFrom(values: Array<string | undefined>): Category[] {
    const seen = new Set<string>();
    const out: Category[] = [];
    for (const v of values) {
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push({ id: v, name: v });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    liveChannels: live,
    liveCategories: categoriesFrom(live.map((c) => c.groupTitle)),
    movies,
    movieCategories: categoriesFrom(movies.map((m) => m.category)),
    series,
    seriesCategories: categoriesFrom(series.map((s) => s.category)),
  };
}
