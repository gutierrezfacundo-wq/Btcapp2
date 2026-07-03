import { create } from "zustand";
import type { Catalog, EpgProgram, MediaKind, SavedSource, SourceConfig } from "../data/types";
import { xtreamXmltvUrl } from "../data/types";
import { loadM3uCatalog } from "../data/m3uCatalog";
import { loadXtreamLive, loadXtreamMovies, loadXtreamSeries } from "../data/xtream";
import { groupByChannel, parseXmltv } from "../data/xmltv";
import { fetchText } from "../data/http";

const SOURCE_KEY = "iptv.source.v1";          // legacy (fuente unica) — se migra
const SOURCES_KEY = "iptv.sources.v1";        // nuevo: array de listas guardadas
const ACTIVE_KEY = "iptv.activeSource.v1";    // nuevo: id de la lista activa
const FAVORITES_KEY = "iptv.favorites.v1";
const CATALOG_CACHE_KEY = "iptv.catalog.v1";
const HISTORY_KEY = "iptv.history.v1";
const PROGRESS_KEY = "iptv.progress.v1";      // posición de reproducción por contenido (continuar viendo)
const COMPANION_KEY = "iptv.companionUrl.v1"; // URL del companion (web app + relay) para vincular con el celular
const NATIVESUBS_KEY = "iptv.nativeSubs.v1";  // usar pipeline nativo de webOS para exponer subtítulos embebidos
const SUBSCALE_KEY = "iptv.subtitleScale.v1"; // tamaño de subtítulos (s/m/l)
const EPGOFF_KEY = "iptv.epgOffset.v1";      // corrección horaria de la guía (horas)
const UI_KEY = "iptv.ui.v1";                  // navegación del Home (canal/categoría/tab): sobrevive al reinicio
const CATPREFS_KEY = "iptv.catPrefs.v1";     // + ":<sourceKey>": ocultar/reordenar categorías por lista
const KIDSMODE_KEY = "iptv.kidsMode.v1";     // modo Felix activo (sobrevive al reinicio)
const PIN_KEY = "iptv.parentalPin.v1";       // PIN parental (protege la salida del modo Felix)
const KIDSPREFS_KEY = "iptv.kidsPrefs.v1";   // + ":<sourceKey>": contenido apto para niños
const KIDSTIMER_KEY = "iptv.kidsTimer.v1";   // fin del temporizador del modo Felix (ms epoch)
const REMOTECODE_KEY = "iptv.remoteCode.v1"; // código fijo del control remoto por celular

function genId(): string {
  return `src-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Código corto legible (sin O/0/I/1) para vincular el control remoto. */
function genRemoteCode(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/** Carga las listas guardadas, migrando la fuente unica vieja si hace falta. */
function loadSavedSources(): { sources: SavedSource[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (raw) {
      const sources = JSON.parse(raw) as SavedSource[];
      const activeId = localStorage.getItem(ACTIVE_KEY) || sources[0]?.id || null;
      return { sources, activeId };
    }
  } catch {
    /* ignore */
  }
  // Migracion: fuente unica legacy -> primer SavedSource activo
  try {
    const legacy = localStorage.getItem(SOURCE_KEY);
    if (legacy) {
      const config = JSON.parse(legacy) as SourceConfig;
      const migrated: SavedSource = {
        id: genId(),
        name: config.kind === "xtream" ? "Mi lista Xtream" : "Mi lista M3U",
        config,
      };
      localStorage.setItem(SOURCES_KEY, JSON.stringify([migrated]));
      localStorage.setItem(ACTIVE_KEY, migrated.id);
      return { sources: [migrated], activeId: migrated.id };
    }
  } catch {
    /* ignore */
  }
  return { sources: [], activeId: null };
}

function persistSources(sources: SavedSource[], activeId: string | null) {
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

interface CatalogCacheEntry {
  sourceKey: string;
  savedAt: number;
  catalog: Catalog;
}

function sourceKeyOf(s: SourceConfig): string {
  return s.kind === "m3u" ? `m3u:${s.playlistUrl}` : `xt:${s.server}:${s.username}`;
}

function loadCatalogCache(s: SourceConfig): Catalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CatalogCacheEntry;
    return entry.sourceKey === sourceKeyOf(s) ? entry.catalog : null;
  } catch {
    return null;
  }
}

function saveCatalogCache(s: SourceConfig, catalog: Catalog) {
  try {
    const entry: CatalogCacheEntry = {
      sourceKey: sourceKeyOf(s),
      savedAt: Date.now(),
      catalog,
    };
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Catalogo demasiado grande para localStorage: seguimos sin cache.
    try {
      localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}

// ===== Preferencias de categorías (ocultar / reordenar), por lista =====
export interface SectionCatPrefs {
  /** Nombres de categorías en el orden elegido (las que falten van al final). */
  order: string[];
  /** Nombres de categorías ocultas. */
  hidden: string[];
}
export interface CatPrefs {
  live: SectionCatPrefs;
  movies: SectionCatPrefs;
  series: SectionCatPrefs;
}
export type CatSection = keyof CatPrefs;

const emptySectionPrefs = (): SectionCatPrefs => ({ order: [], hidden: [] });
const emptyCatPrefs = (): CatPrefs => ({ live: emptySectionPrefs(), movies: emptySectionPrefs(), series: emptySectionPrefs() });

function loadCatPrefs(s: SourceConfig | null): CatPrefs {
  if (!s) return emptyCatPrefs();
  try {
    const raw = localStorage.getItem(`${CATPREFS_KEY}:${sourceKeyOf(s)}`);
    if (raw) return { ...emptyCatPrefs(), ...(JSON.parse(raw) as Partial<CatPrefs>) };
  } catch {
    /* ignore */
  }
  return emptyCatPrefs();
}

/** Aplica orden + ocultas a una lista de categorías (por nombre). */
export function applyCatPrefs<T extends { name: string }>(cats: T[], prefs: SectionCatPrefs, includeHidden = false): T[] {
  const hidden = new Set(prefs.hidden);
  const list = includeHidden ? cats : cats.filter((c) => !hidden.has(c.name));
  if (!prefs.order.length) return list;
  const pos = new Map(prefs.order.map((n, i) => [n, i]));
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const pa = pos.get(a.c.name);
      const pb = pos.get(b.c.name);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return a.i - b.i; // no listadas: al final, en orden del proveedor
    })
    .map((x) => x.c);
}

// ===== Modo Felix (niños): contenido apto, por lista =====
export interface KidsPrefs {
  /** Nombres de categorías aptas, por sección. */
  live: string[];
  movies: string[];
  series: string[];
  /** Ids de contenido suelto marcado como apto (canal, película o serie). */
  items: string[];
}
const emptyKidsPrefs = (): KidsPrefs => ({ live: [], movies: [], series: [], items: [] });

function loadKidsPrefs(s: SourceConfig | null): KidsPrefs {
  if (!s) return emptyKidsPrefs();
  try {
    const raw = localStorage.getItem(`${KIDSPREFS_KEY}:${sourceKeyOf(s)}`);
    if (raw) return { ...emptyKidsPrefs(), ...(JSON.parse(raw) as Partial<KidsPrefs>) };
  } catch {
    /* ignore */
  }
  return emptyKidsPrefs();
}

export interface FavoriteItem {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl?: string;
  kind: MediaKind;
  /** Subtítulo enriquecido para la fila de Favoritos (ej. "Nº 415 · 4K", "2024 · Acción"). */
  meta?: string;
}

function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

/** Item "Seguir viendo": ultimo contenido abierto (canal / pelicula / serie). */
export interface HistoryItem {
  id: string;
  name: string;
  /** Ruta para volver a abrirlo (player o detalle de serie). */
  route: string;
  posterUrl?: string;
  sub?: string;
  kind: MediaKind;
  at: number;
}

const HISTORY_MAX = 12;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

interface AppState {
  /** Listas guardadas y cual esta activa. */
  sources: SavedSource[];
  activeSourceId: string | null;
  /** Config de la fuente activa (derivado; null si no hay activa). */
  source: SourceConfig | null;

  catalog: Catalog;
  loading: boolean;
  loadingStep: string | null;
  loadingProgress: { current: number; total: number } | null;
  error: string | null;
  favorites: FavoriteItem[];
  history: HistoryItem[];
  /** Posición de reproducción por contenido (segundos) para "continuar viendo". */
  progress: Record<string, { pos: number; dur: number }>;
  /** URL base del companion (web app + relay) para vincular con el celular vía QR. */
  companionUrl: string;
  /** Pipeline nativo de webOS (source+MIME) para exponer subtítulos embebidos. */
  nativeSubs: boolean;
  /** Tamaño de los subtítulos en el reproductor. */
  subtitleScale: "s" | "m" | "l";
  /** Corrección horaria de la guía EPG, en horas (-12..12). */
  epgOffsetH: number;
  /** Ocultar/reordenar categorías de la lista activa. */
  catPrefs: CatPrefs;
  /** Modo Felix (niños) activo: toda la app queda restringida a lo apto. */
  kidsMode: boolean;
  /** PIN parental (4 dígitos, "" = sin PIN). */
  parentalPin: string;
  /** Contenido apto para niños de la lista activa. */
  kidsPrefs: KidsPrefs;
  /** Temporizador del modo Felix: momento de apagado (ms epoch), null = sin límite. */
  kidsTimerEndsAt: number | null;
  /** Código fijo del control remoto por celular (se genera una sola vez). */
  remoteCode: string;
  /** Cola de reproducción (episodios de la temporada en curso) para "siguiente episodio". */
  playQueue: { route: string; label: string; url: string }[];
  epgByChannel: Map<string, EpgProgram[]>;

  /** Indica si una seccion VOD ya se cargo a demanda. */
  loadedSections: { movies: boolean; series: boolean };

  /** Estado de navegacion del Home: sobrevive al ir/volver de otras pantallas. */
  ui: {
    tab: "live" | "movies" | "series" | "favorites";
    category: string | null;
    selectedChannelId: string | null;
  };
  setUi: (patch: Partial<AppState["ui"]>) => void;

  // Multi-lista
  addSource: (name: string, config: SourceConfig) => string;
  updateSource: (id: string, patch: { name?: string; config?: SourceConfig }) => void;
  removeSource: (id: string) => void;
  setActiveSource: (id: string) => Promise<void>;

  clearSource: () => void;
  reload: () => Promise<void>;
  ensureMovies: () => Promise<void>;
  ensureSeries: () => Promise<void>;
  toggleFavorite: (item: FavoriteItem) => void;
  isFavorite: (id: string) => boolean;
  pushHistory: (item: Omit<HistoryItem, "at">) => void;
  saveProgress: (id: string, pos: number, dur: number) => void;
  clearProgress: (id: string) => void;
  setCompanionUrl: (url: string) => void;
  setNativeSubs: (on: boolean) => void;
  setSubtitleScale: (s: "s" | "m" | "l") => void;
  setEpgOffsetH: (h: number) => void;
  setCatPrefs: (section: CatSection, prefs: SectionCatPrefs) => void;
  setKidsMode: (on: boolean) => void;
  setParentalPin: (pin: string) => void;
  toggleKidsCategory: (section: CatSection, name: string) => void;
  toggleKidsItem: (id: string) => void;
  /** Arranca el temporizador del modo Felix (minutos) o lo apaga (null). */
  setKidsTimer: (minutes: number | null) => void;
  setPlayQueue: (q: { route: string; label: string; url: string }[]) => void;
}

const emptyCatalog: Catalog = {
  liveChannels: [],
  liveCategories: [],
  movies: [],
  movieCategories: [],
  series: [],
  seriesCategories: [],
};

const initial = loadSavedSources();

export const useAppStore = create<AppState>((set, get) => ({
  sources: initial.sources,
  activeSourceId: initial.activeId,
  source: initial.sources.find((s) => s.id === initial.activeId)?.config ?? null,
  catalog: emptyCatalog,
  loading: false,
  loadingStep: null,
  loadingProgress: null,
  error: null,
  favorites: loadFavorites(),
  history: loadHistory(),
  progress: (() => { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}"); } catch { return {}; } })(),
  companionUrl: (() => { try { return localStorage.getItem(COMPANION_KEY) ?? ""; } catch { return ""; } })(),
  nativeSubs: (() => { try { return localStorage.getItem(NATIVESUBS_KEY) !== "0"; } catch { return true; } })(),
  subtitleScale: (() => { try { return (localStorage.getItem(SUBSCALE_KEY) as "s" | "m" | "l") || "m"; } catch { return "m"; } })(),
  playQueue: [],
  epgOffsetH: (() => { try { const v = Number(localStorage.getItem(EPGOFF_KEY)); return Number.isFinite(v) ? Math.max(-12, Math.min(12, v)) : 0; } catch { return 0; } })(),
  catPrefs: loadCatPrefs(initial.sources.find((s) => s.id === initial.activeId)?.config ?? null),
  kidsMode: (() => { try { return localStorage.getItem(KIDSMODE_KEY) === "1"; } catch { return false; } })(),
  parentalPin: (() => { try { return localStorage.getItem(PIN_KEY) ?? ""; } catch { return ""; } })(),
  kidsPrefs: loadKidsPrefs(initial.sources.find((s) => s.id === initial.activeId)?.config ?? null),
  // Un temporizador vencido de una sesión anterior no se arrastra: se limpia.
  kidsTimerEndsAt: (() => {
    try {
      const v = Number(localStorage.getItem(KIDSTIMER_KEY));
      if (Number.isFinite(v) && v > Date.now()) return v;
      localStorage.removeItem(KIDSTIMER_KEY);
    } catch { /* ignore */ }
    return null;
  })(),
  remoteCode: (() => {
    try {
      let c = localStorage.getItem(REMOTECODE_KEY);
      if (!c) { c = genRemoteCode(); localStorage.setItem(REMOTECODE_KEY, c); }
      return c;
    } catch { return genRemoteCode(); }
  })(),
  epgByChannel: new Map(),
  loadedSections: { movies: false, series: false },
  ui: (() => {
    const base = { tab: "live" as const, category: null, selectedChannelId: null };
    try { return { ...base, ...JSON.parse(localStorage.getItem(UI_KEY) ?? "{}") }; } catch { return base; }
  })(),
  setUi: (patch) => {
    const ui = { ...get().ui, ...patch };
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* ignore */ }
    set({ ui });
  },

  addSource: (name, config) => {
    const entry: SavedSource = { id: genId(), name: name.trim() || "Lista", config };
    const sources = [...get().sources, entry];
    persistSources(sources, get().activeSourceId);
    set({ sources });
    return entry.id;
  },

  updateSource: (id, patch) => {
    const sources = get().sources.map((s) =>
      s.id === id ? { ...s, ...(patch.name != null ? { name: patch.name } : {}), ...(patch.config ? { config: patch.config } : {}) } : s,
    );
    persistSources(sources, get().activeSourceId);
    const isActive = id === get().activeSourceId;
    set({
      sources,
      ...(isActive ? { source: sources.find((s) => s.id === id)?.config ?? null } : {}),
    });
  },

  removeSource: (id) => {
    const remaining = get().sources.filter((s) => s.id !== id);
    let activeId = get().activeSourceId;
    if (activeId === id) activeId = remaining[0]?.id ?? null;
    persistSources(remaining, activeId);
    const nextConfig = remaining.find((s) => s.id === activeId)?.config ?? null;
    set({
      sources: remaining,
      activeSourceId: activeId,
      source: nextConfig,
      catPrefs: loadCatPrefs(nextConfig),
      kidsPrefs: loadKidsPrefs(nextConfig),
    });
    if (activeId) void get().reload();
    else set({ catalog: emptyCatalog, epgByChannel: new Map() });
  },

  setActiveSource: async (id) => {
    const src = get().sources.find((s) => s.id === id);
    if (!src) return;
    persistSources(get().sources, id);
    set({
      activeSourceId: id,
      source: src.config,
      catalog: emptyCatalog,
      loadedSections: { movies: false, series: false },
      ui: { tab: "live", category: null, selectedChannelId: null },
      catPrefs: loadCatPrefs(src.config),
      kidsPrefs: loadKidsPrefs(src.config),
    });
    try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: "live", category: null, selectedChannelId: null })); } catch { /* ignore */ }
    await get().reload();
  },

  clearSource: () => {
    set({
      catalog: emptyCatalog,
      epgByChannel: new Map(),
      loadedSections: { movies: false, series: false },
    });
  },

  ensureMovies: async () => {
    const s = get();
    if (s.loadedSections.movies || !s.source || s.source.kind !== "xtream") return;
    set({ loadingStep: "Películas", loadingProgress: { current: 0, total: 2 } });
    try {
      const onProgress = (step: string, current: number, total: number) => {
        set({ loadingStep: step, loadingProgress: { current, total } });
      };
      const mv = await loadXtreamMovies(s.source, onProgress);
      const merged: Catalog = { ...get().catalog, ...mv };
      set({
        catalog: merged,
        loadingStep: null,
        loadingProgress: null,
        loadedSections: { ...get().loadedSections, movies: true },
      });
      saveCatalogCache(s.source, merged);
    } catch (e) {
      set({
        loadingStep: null,
        loadingProgress: null,
        error: e instanceof Error ? e.message : "Error cargando películas",
      });
    }
  },

  ensureSeries: async () => {
    const s = get();
    if (s.loadedSections.series || !s.source || s.source.kind !== "xtream") return;
    set({ loadingStep: "Series", loadingProgress: { current: 0, total: 2 } });
    try {
      const onProgress = (step: string, current: number, total: number) => {
        set({ loadingStep: step, loadingProgress: { current, total } });
      };
      const sr = await loadXtreamSeries(s.source, onProgress);
      const merged: Catalog = { ...get().catalog, ...sr };
      set({
        catalog: merged,
        loadingStep: null,
        loadingProgress: null,
        loadedSections: { ...get().loadedSections, series: true },
      });
      saveCatalogCache(s.source, merged);
    } catch (e) {
      set({
        loadingStep: null,
        loadingProgress: null,
        error: e instanceof Error ? e.message : "Error cargando series",
      });
    }
  },

  reload: async () => {
    const source = get().source;
    if (!source) return;

    // 1) Mostrar cache al instante si existe
    const cached = loadCatalogCache(source);
    if (cached && cached.liveChannels.length > 0) {
      set({ catalog: cached, loading: false, error: null });
    } else {
      set({ loading: true, error: null });
    }

    // 2) Refrescar de red.
    // En Xtream cargamos SOLO en-vivo al inicio (rapido, bajo consumo). Peliculas
    // y series se cargan a demanda al entrar a esas secciones.
    try {
      const onProgress = (step: string, current: number, total: number) => {
        set({ loadingStep: step, loadingProgress: { current, total } });
      };
      set({ loadingStep: "Conectando…", loadingProgress: { current: 0, total: 2 } });
      if (source.kind === "m3u") {
        const catalog = await loadM3uCatalog(source);
        set({
          catalog,
          loading: false,
          loadingStep: null,
          loadingProgress: null,
          error: null,
          loadedSections: { movies: true, series: true },
        });
        saveCatalogCache(source, catalog);
      } else {
        const live = await loadXtreamLive(source, onProgress);
        const partial: Catalog = { ...emptyCatalog, ...live };
        set({
          catalog: partial,
          loading: false,
          loadingStep: null,
          loadingProgress: null,
          error: null,
          loadedSections: { movies: false, series: false },
        });
        saveCatalogCache(source, partial);
        // Precargar Películas y Series en segundo plano (secuencial, para no
        // castigar al proveedor): entrar a esas secciones queda instantáneo.
        void get().ensureMovies().then(() => get().ensureSeries());
      }
      const catalogForEpg = get().catalog;
      void catalogForEpg;

      const epgUrl = source.kind === "m3u" ? source.epgUrl : xtreamXmltvUrl(source);
      if (epgUrl) {
        loadEpg(epgUrl)
          .then((map) => set({ epgByChannel: map }))
          .catch(() => set({ epgByChannel: new Map() }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      // Si hay cache visible, no pisamos la lista con el error.
      if (!cached || cached.liveChannels.length === 0) {
        set({ loading: false, loadingStep: null, loadingProgress: null, error: msg });
      } else {
        set({ loading: false, loadingStep: null, loadingProgress: null });
      }
    }
  },

  toggleFavorite: (item) => {
    const list = get().favorites;
    const exists = list.some((f) => f.id === item.id);
    const next = exists ? list.filter((f) => f.id !== item.id) : [...list, item];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    set({ favorites: next });
  },

  isFavorite: (id) => get().favorites.some((f) => f.id === id),

  pushHistory: (item) => {
    const entry: HistoryItem = { ...item, at: Date.now() };
    const next = [entry, ...get().history.filter((h) => h.id !== item.id)].slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    set({ history: next });
  },

  saveProgress: (id, pos, dur) => {
    // El pipeline nativo de webOS puede reportar duration Infinity/0 (MKV/TS):
    // guardamos igual con dur=0 (desconocida) para no perder el progreso.
    if (!id || !isFinite(pos)) return;
    const d = isFinite(dur) && dur > 0 ? dur : 0;
    const next = { ...get().progress };
    // Recién empezado, o (con duración conocida) cerca del final: no guardar.
    if (pos < 15 || (d > 0 && pos > d - 30)) delete next[id];
    else next[id] = { pos, dur: d };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    set({ progress: next });
  },
  clearProgress: (id) => {
    const next = { ...get().progress };
    delete next[id];
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    set({ progress: next });
  },

  setCompanionUrl: (url) => {
    const u = url.trim().replace(/\/+$/, "");
    try { localStorage.setItem(COMPANION_KEY, u); } catch { /* ignore */ }
    set({ companionUrl: u });
  },

  setNativeSubs: (on) => {
    try { localStorage.setItem(NATIVESUBS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    set({ nativeSubs: on });
  },

  setSubtitleScale: (s) => {
    try { localStorage.setItem(SUBSCALE_KEY, s); } catch { /* ignore */ }
    set({ subtitleScale: s });
  },

  setPlayQueue: (q) => set({ playQueue: q }),

  setEpgOffsetH: (h) => {
    const v = Math.max(-12, Math.min(12, Math.round(h)));
    try { localStorage.setItem(EPGOFF_KEY, String(v)); } catch { /* ignore */ }
    set({ epgOffsetH: v });
  },

  setCatPrefs: (section, prefs) => {
    const next = { ...get().catPrefs, [section]: prefs };
    const src = get().source;
    if (src) {
      try { localStorage.setItem(`${CATPREFS_KEY}:${sourceKeyOf(src)}`, JSON.stringify(next)); } catch { /* ignore */ }
    }
    set({ catPrefs: next });
  },

  setKidsMode: (on) => {
    try { localStorage.setItem(KIDSMODE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    // Al salir del modo se apaga también el temporizador.
    if (!on) {
      try { localStorage.removeItem(KIDSTIMER_KEY); } catch { /* ignore */ }
      set({ kidsMode: on, kidsTimerEndsAt: null });
      return;
    }
    set({ kidsMode: on });
  },

  setKidsTimer: (minutes) => {
    const endsAt = minutes ? Date.now() + minutes * 60000 : null;
    try {
      if (endsAt) localStorage.setItem(KIDSTIMER_KEY, String(endsAt));
      else localStorage.removeItem(KIDSTIMER_KEY);
    } catch { /* ignore */ }
    set({ kidsTimerEndsAt: endsAt });
  },

  setParentalPin: (pin) => {
    try { localStorage.setItem(PIN_KEY, pin); } catch { /* ignore */ }
    set({ parentalPin: pin });
  },

  toggleKidsCategory: (section, name) => {
    const prefs = get().kidsPrefs;
    const list = prefs[section].includes(name)
      ? prefs[section].filter((n) => n !== name)
      : [...prefs[section], name];
    const next = { ...prefs, [section]: list };
    const src = get().source;
    if (src) {
      try { localStorage.setItem(`${KIDSPREFS_KEY}:${sourceKeyOf(src)}`, JSON.stringify(next)); } catch { /* ignore */ }
    }
    set({ kidsPrefs: next });
  },

  toggleKidsItem: (id) => {
    const prefs = get().kidsPrefs;
    const items = prefs.items.includes(id) ? prefs.items.filter((i) => i !== id) : [...prefs.items, id];
    const next = { ...prefs, items };
    const src = get().source;
    if (src) {
      try { localStorage.setItem(`${KIDSPREFS_KEY}:${sourceKeyOf(src)}`, JSON.stringify(next)); } catch { /* ignore */ }
    }
    set({ kidsPrefs: next });
  },
}));

async function loadEpg(url: string) {
  const xml = await fetchText(url, 60000);
  return groupByChannel(parseXmltv(xml));
}
