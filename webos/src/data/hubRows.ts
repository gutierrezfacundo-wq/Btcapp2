// Filas del Inicio (Novedades, billboard, "Porque viste…", géneros).
//
// Antes se armaban con varios filter/map/sort sobre todo el catálogo —con una
// lista grande, 50.000 títulos recorridos y ordenados varias veces— cada vez
// que cambiaba cualquier cosa del catálogo. En la TV eso era casi un segundo
// de pantalla trabada. Acá: una pasada por título, "top N" sin ordenar todo, y
// el género sin regex.

import type { Movie, SeriesInfo } from "./types";

export type HubKind = "movie" | "series";

export interface RailItem {
  id: string;
  name: string;
  posterUrl?: string;
  kind: HubKind;
  /** Fecha de alta en el proveedor (epoch en segundos); 0 si no se sabe. */
  at: number;
}

export interface BillItem extends RailItem {
  plot?: string;
  year?: string;
  genre?: string;
}

export interface HubRow {
  title: string;
  items: RailItem[];
}

type Allow<T> = (item: T) => boolean;

/** "Drama, Acción" → "Drama". Sin regex: se llama una vez por título. */
export function firstGenre(g?: string): string {
  if (!g) return "";
  let end = g.length;
  for (let i = 0; i < g.length; i++) {
    const c = g.charCodeAt(i);
    if (c === 44 /* , */ || c === 47 /* / */ || c === 124 /* | */) { end = i; break; }
  }
  return g.slice(0, end).trim();
}

/** Inserta en un top-N ordenado por `at` (más nuevo primero). N es chico. */
function pushTop<T extends { at: number }>(top: T[], item: T, n: number) {
  if (top.length === n && item.at <= top[n - 1].at) return;
  let i = top.length;
  while (i > 0 && top[i - 1].at < item.at) i--;
  top.splice(i, 0, item);
  if (top.length > n) top.pop();
}

function movieItem(m: Movie): RailItem {
  return { id: m.id, name: m.name, posterUrl: m.posterUrl, kind: "movie", at: m.addedAt ?? 0 };
}
function seriesItem(s: SeriesInfo): RailItem {
  return { id: s.id, name: s.name, posterUrl: s.posterUrl, kind: "series", at: s.addedAt ?? 0 };
}

export interface CatalogRows {
  /** Lo último que agregó el proveedor (pelis + series), hasta 10. */
  newest: RailItem[];
  /** Los 6 primeros de `newest`, con sinopsis/año/género para el billboard. */
  bill: BillItem[];
  /** Las dos filas por género con más títulos (solo de lo permitido). */
  genreRows: HubRow[];
}

/**
 * Novedades + billboard + filas por género, en dos pasadas por el catálogo.
 * `skipGenre`: género (en minúsculas) que no hace falta repetir porque ya
 * tiene su fila ("Porque viste…").
 */
export function computeCatalogRows(
  movies: Movie[],
  series: SeriesInfo[],
  allowMovie: Allow<Movie>,
  allowSeries: Allow<SeriesInfo>,
  skipGenre = "",
): CatalogRows {
  const newestTop: { at: number; m?: Movie; s?: SeriesInfo }[] = [];
  const counts = new Map<string, { label: string; n: number }>();
  // Género ya calculado por posición (null = no permitido o sin género).
  const movieGenre: (string | null)[] = new Array(movies.length);
  const seriesGenre: (string | null)[] = new Array(series.length);

  const countGenre = (raw: string | undefined): string | null => {
    const label = firstGenre(raw);
    if (label.length < 2) return null;
    const k = label.toLowerCase();
    const e = counts.get(k);
    if (e) e.n += 1;
    else counts.set(k, { label, n: 1 });
    return k;
  };

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    if (!allowMovie(m)) { movieGenre[i] = null; continue; }
    movieGenre[i] = countGenre(m.genre);
    const at = m.addedAt ?? 0;
    if (at > 0) pushTop(newestTop, { at, m }, 10);
  }
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    if (!allowSeries(s)) { seriesGenre[i] = null; continue; }
    seriesGenre[i] = countGenre(s.genre);
    const at = s.addedAt ?? 0;
    if (at > 0) pushTop(newestTop, { at, s }, 10);
  }

  const newest = newestTop.map((x) => (x.m ? movieItem(x.m) : seriesItem(x.s!)));
  const bill: BillItem[] = newestTop.slice(0, 6).map((x) =>
    x.m
      ? { ...movieItem(x.m), plot: x.m.plot, year: x.m.year?.slice(0, 4), genre: x.m.genre || x.m.category }
      : { ...seriesItem(x.s!), plot: x.s!.plot, year: x.s!.year, genre: x.s!.genre || x.s!.category },
  );

  const top = [...counts.entries()]
    .filter(([k, e]) => e.n >= 6 && k !== skipGenre)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 2);
  const genreRows: HubRow[] = [];
  for (const [k, e] of top) {
    const items: RailItem[] = [];
    for (let i = 0; i < movies.length; i++) if (movieGenre[i] === k) pushTop(items, movieItem(movies[i]), 10);
    for (let i = 0; i < series.length; i++) if (seriesGenre[i] === k) pushTop(items, seriesItem(series[i]), 10);
    if (items.length >= 4) genreRows.push({ title: e.label, items });
  }
  return { newest, bill, genreRows };
}

/**
 * "Porque viste X": títulos del mismo género (o categoría) que lo último que
 * se vio. Corta apenas junta 10, en vez de filtrar todo el catálogo.
 */
export function computeBecauseRow(
  seed: { kind: string; id: string } | undefined,
  movies: Movie[],
  series: SeriesInfo[],
  allowMovie: Allow<Movie>,
  allowSeries: Allow<SeriesInfo>,
  seenIds: Set<string>,
): (HubRow & { genre: string }) | null {
  if (!seed) return null;
  const sid = seed.id.replace(/^series:/, "");
  const src: Movie | SeriesInfo | undefined = seed.kind === "movie"
    ? movies.find((m) => m.id === seed.id)
    : series.find((s) => s.id === sid);
  if (!src) return null;
  // Una semilla de una categoría oculta (o no apta en modo Felix) no puede
  // aparecer en el Inicio, ni siquiera como título de la fila.
  if (seed.kind === "movie" ? !allowMovie(src as Movie) : !allowSeries(src as SeriesInfo)) return null;
  const g = firstGenre(src.genre).toLowerCase();
  const cat = src.category;
  if (!g && !cat) return null;
  const match = (it: { genre?: string; category?: string }) =>
    g ? (it.genre ?? "").toLowerCase().includes(g) : it.category === cat;

  const items: RailItem[] = [];
  for (const m of movies) {
    if (items.length >= 10) break;
    if (m.id !== seed.id && !seenIds.has(m.id) && allowMovie(m) && match(m)) items.push(movieItem(m));
  }
  for (const s of series) {
    if (items.length >= 10) break;
    if (s.id !== sid && !seenIds.has(s.id) && allowSeries(s) && match(s)) items.push(seriesItem(s));
  }
  return items.length >= 4 ? { title: `Porque viste ${src.name}`, items, genre: g } : null;
}

/**
 * Recuerda el último resultado por identidad de argumentos. Va fuera de React
 * a propósito: si un render diferido del Hub se interrumpe y se descarta, su
 * useMemo se pierde con él y el cálculo se repetía entero; esto sobrevive.
 */
function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null;
  let last!: R;
  return (...args: A) => {
    if (lastArgs && lastArgs.length === args.length && lastArgs.every((x, i) => x === args[i])) return last;
    last = fn(...args);
    lastArgs = args;
    return last;
  };
}

export const computeCatalogRowsCached = memoLast(computeCatalogRows);
export const computeBecauseRowCached = memoLast(computeBecauseRow);
