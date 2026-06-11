import { create } from "zustand";
import type { Catalog, EpgProgram, MediaKind, SourceConfig } from "../data/types";
import { xtreamXmltvUrl } from "../data/types";
import { loadM3uCatalog } from "../data/m3uCatalog";
import { loadXtreamLive, loadXtreamMovies, loadXtreamSeries } from "../data/xtream";
import { groupByChannel, parseXmltv } from "../data/xmltv";
import { fetchText } from "../data/http";

const SOURCE_KEY = "iptv.source.v1";
const FAVORITES_KEY = "iptv.favorites.v1";
const CATALOG_CACHE_KEY = "iptv.catalog.v1";

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

export interface FavoriteItem {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl?: string;
  kind: MediaKind;
}

function loadSource(): SourceConfig | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    return raw ? (JSON.parse(raw) as SourceConfig) : null;
  } catch {
    return null;
  }
}

function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

interface AppState {
  source: SourceConfig | null;
  catalog: Catalog;
  loading: boolean;
  loadingStep: string | null;
  loadingProgress: { current: number; total: number } | null;
  error: string | null;
  favorites: FavoriteItem[];
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

  setSource: (s: SourceConfig) => Promise<void>;
  clearSource: () => void;
  reload: () => Promise<void>;
  ensureMovies: () => Promise<void>;
  ensureSeries: () => Promise<void>;
  toggleFavorite: (item: FavoriteItem) => void;
  isFavorite: (id: string) => boolean;
}

const emptyCatalog: Catalog = {
  liveChannels: [],
  liveCategories: [],
  movies: [],
  movieCategories: [],
  series: [],
  seriesCategories: [],
};

export const useAppStore = create<AppState>((set, get) => ({
  source: loadSource(),
  catalog: emptyCatalog,
  loading: false,
  loadingStep: null,
  loadingProgress: null,
  error: null,
  favorites: loadFavorites(),
  epgByChannel: new Map(),
  loadedSections: { movies: false, series: false },
  ui: { tab: "live", category: null, selectedChannelId: null },
  setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),

  setSource: async (s) => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
    set({ source: s });
    await get().reload();
  },

  clearSource: () => {
    localStorage.removeItem(SOURCE_KEY);
    set({
      source: null,
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
}));

async function loadEpg(url: string) {
  const xml = await fetchText(url, 60000);
  return groupByChannel(parseXmltv(xml));
}
