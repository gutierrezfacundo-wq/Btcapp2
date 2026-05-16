import { create } from "zustand";
import type { Catalog, EpgProgram, MediaKind, SourceConfig } from "../data/types";
import { xtreamXmltvUrl } from "../data/types";
import { loadM3uCatalog } from "../data/m3uCatalog";
import { loadXtreamCatalog } from "../data/xtream";
import { groupByChannel, parseXmltv } from "../data/xmltv";

const SOURCE_KEY = "iptv.source.v1";
const FAVORITES_KEY = "iptv.favorites.v1";

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
    set({ loading: true, error: null });
    try {
      const catalog =
        source.kind === "m3u"
          ? await loadM3uCatalog(source)
          : await loadXtreamCatalog(source);
      set({ catalog, loading: false });

      const epgUrl = source.kind === "m3u" ? source.epgUrl : xtreamXmltvUrl(source);
      if (epgUrl) {
        loadEpg(epgUrl)
          .then((map) => set({ epgByChannel: map }))
          .catch(() => set({ epgByChannel: new Map() }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      set({ loading: false, error: msg });
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
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  return groupByChannel(parseXmltv(xml));
}
