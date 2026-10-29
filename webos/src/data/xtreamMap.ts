// Armado de películas y series a partir de las respuestas de Xtream.
//
// Código puro (sin DOM ni red): lo usa el Web Worker que parsea los catálogos
// grandes y también el camino de respaldo en el hilo principal, así el
// resultado es idéntico por cualquiera de los dos.

import type { Movie, SeriesInfo, SourceConfig } from "./types";
import { xtreamStreamMovie } from "./types";
import { addVariantFields, assignVariantGroups } from "./variants";

export type XtreamSource = Extract<SourceConfig, { kind: "xtream" }>;

export interface XtCategoryDto {
  category_id: string;
  category_name: string;
}

export interface CategoryRef {
  id: string;
  name: string;
}

export interface XtMovieDto {
  stream_id: number;
  name: string;
  stream_icon?: string;
  container_extension?: string;
  category_id?: string;
  rating?: string;
  plot?: string;
  releaseDate?: string;
  added?: string;
  genre?: string;
}

export interface XtSeriesDto {
  series_id: number;
  name: string;
  cover?: string;
  category_id?: string;
  plot?: string;
  releaseDate?: string;
  last_modified?: string;
  genre?: string;
}

/**
 * Índice id → nombre de categoría. Antes se buscaba con find() dentro del
 * map de cada contenido: 40.000 películas × cientos de categorías eran
 * millones de comparaciones en el hilo principal de la TV.
 */
export function categoryIndex(list: CategoryRef[]): (id: string | number | undefined) => string | undefined {
  const byId = new Map<string, string>();
  for (const c of list) if (!byId.has(String(c.id))) byId.set(String(c.id), c.name);
  return (id) => (id == null || id === "" ? undefined : byId.get(String(id)));
}

export function mapMovie(d: XtMovieDto, source: XtreamSource, catName: (id: string | undefined) => string | undefined): Movie {
  return addVariantFields<Movie>({
    id: `xt-vod-${d.stream_id}`,
    name: d.name,
    streamUrl: xtreamStreamMovie(source, d.stream_id, d.container_extension || "mp4"),
    posterUrl: d.stream_icon || undefined,
    category: catName(d.category_id),
    plot: d.plot,
    rating: d.rating,
    year: d.releaseDate,
    addedAt: d.added ? Number(d.added) || undefined : undefined,
    genre: d.genre || undefined,
  });
}

export function mapSeries(d: XtSeriesDto, catName: (id: string | undefined) => string | undefined): SeriesInfo {
  return addVariantFields<SeriesInfo>({
    id: String(d.series_id),
    name: d.name,
    posterUrl: d.cover || undefined,
    category: catName(d.category_id),
    plot: d.plot,
    year: d.releaseDate ? d.releaseDate.slice(0, 4) : undefined,
    addedAt: d.last_modified ? Number(d.last_modified) || undefined : undefined,
    genre: d.genre || undefined,
  });
}

export type CatalogJob =
  | { kind: "movies"; cats: CategoryRef[]; source: XtreamSource }
  | { kind: "series"; cats: CategoryRef[] };

/** Mapea una lista ya parseada según el trabajo (película o serie). */
export function mapCatalogList(job: CatalogJob, list: unknown): Array<Movie | SeriesInfo> {
  if (!Array.isArray(list)) {
    // Algunos paneles contestan un objeto de error (credenciales, cuenta vencida).
    throw new Error("El servidor devolvió una respuesta inesperada para el catálogo.");
  }
  const name = categoryIndex(job.cats);
  const src = job.kind === "movies" ? job.source : undefined;
  const items: Array<Movie | SeriesInfo> = src
    ? (list as XtMovieDto[]).map((d) => mapMovie(d, src, name))
    : (list as XtSeriesDto[]).map((d) => mapSeries(d, name));
  // Versiones del mismo título: se numeran acá (en el worker) una sola vez.
  assignVariantGroups(items);
  return items;
}
