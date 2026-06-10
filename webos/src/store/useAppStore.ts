import { create } from "zustand";
import type { Catalog, EpgProgram, MediaKind, SourceConfig } from "../data/types";
import { xtreamXmltvUrl } from "../data/types";
import { loadM3uCatalog } from "../data/m3uCatalog";
import { loadXtreamCatalog } from "../data/xtream";
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
  error: string | null;
  favorites: FavoriteItem[];
  epgByChannel: Map<string, EpgProgram[]>;

  setSource: (s: SourceConfig) => Promise<void>;
  clearSource: () => void;
  reload: () => Promise<void>;
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
  error: null,
  favorites: loadFavorites(),
  epgByChannel: new Map(),

  setSource: async (s) => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
    set({ source: s });
    await get().reload();
  },

  clearSource: () => {
    localStorage.removeItem(SOURCE_KEY);
    set({ source: null, catalog: emptyCatalog, epgByChannel: new Map() });
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

    // 2) Refrescar de red
    try {
      const catalog =
        source.kind === "m3u"
          ? await loadM3uCatalog(source)
          : await loadXtreamCatalog(source);
      set({ catalog, loading: false, error: null });
      saveCatalogCache(source, catalog);

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
        set({ loading: false, error: msg });
      } else {
        set({ loading: false });
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
