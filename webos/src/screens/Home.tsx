import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FocusContext,
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { findNowPlaying } from "../data/xmltv";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { PosterCard } from "../components/PosterCard";

type Tab = "live" | "movies" | "series" | "favorites";

const SIDEBAR_ITEMS: {
  id: Tab | "search" | "reload" | "settings" | "hub";
  emoji: string;
  label: string;
}[] = [
  { id: "hub", emoji: "⌂", label: "Inicio" },
  { id: "live", emoji: "📺", label: "En vivo" },
  { id: "movies", emoji: "🎬", label: "Películas" },
  { id: "series", emoji: "🎞️", label: "Series" },
  { id: "favorites", emoji: "★", label: "Favoritos" },
  { id: "search", emoji: "🔍", label: "Buscar" },
  { id: "reload", emoji: "↻", label: "Recargar" },
  { id: "settings", emoji: "⚙", label: "Ajustes" },
];

const RENDER_CAP = 500;

export function Home() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const initialTab = (search.get("tab") as Tab) ?? "live";

  const catalog = useAppStore((s) => s.catalog);
  const favorites = useAppStore((s) => s.favorites);
  const loading = useAppStore((s) => s.loading);
  const loadingStep = useAppStore((s) => s.loadingStep);
  const loadingProgress = useAppStore((s) => s.loadingProgress);
  const error = useAppStore((s) => s.error);
  const source = useAppStore((s) => s.source);
  const reload = useAppStore((s) => s.reload);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const isFavorite = useAppStore((s) => s.isFavorite);
  const epgByChannel = useAppStore((s) => s.epgByChannel);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  useEffect(() => {
    setCategory(null);
    setQuery("");
    setSearchOpen(false);
  }, [tab]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HOME" });

  useEffect(() => {
    setFocus("CAT_0");
  }, [tab]);

  // === Datos por pestaña ===
  const tabData = useMemo(() => {
    if (tab === "live") {
      return {
        categories: catalog.liveCategories,
        getCategoryItems: (cat: string | null) =>
          cat ? catalog.liveChannels.filter((c) => c.groupTitle === cat) : catalog.liveChannels,
        totalCount: catalog.liveChannels.length,
      };
    }
    if (tab === "movies") {
      return {
        categories: catalog.movieCategories,
        getCategoryItems: () => [], // gestionado abajo
        totalCount: catalog.movies.length,
      };
    }
    if (tab === "series") {
      return {
        categories: catalog.seriesCategories,
        getCategoryItems: () => [],
        totalCount: catalog.series.length,
      };
    }
    return {
      categories: [],
      getCategoryItems: () => [],
      totalCount: favorites.length,
    };
  }, [tab, catalog, favorites]);

  const filteredChannels = useMemo(() => {
    if (tab !== "live") return [];
    const byCat = category
      ? catalog.liveChannels.filter((c) => c.groupTitle === category)
      : catalog.liveChannels;
    const norm = query.trim().toLowerCase();
    return norm ? byCat.filter((c) => c.name.toLowerCase().includes(norm)) : byCat;
  }, [tab, catalog.liveChannels, category, query]);

  const filteredMovies = useMemo(() => {
    if (tab !== "movies") return [];
    const byCat = category
      ? catalog.movies.filter((m) => m.category === category)
      : catalog.movies;
    const norm = query.trim().toLowerCase();
    return norm ? byCat.filter((m) => m.name.toLowerCase().includes(norm)) : byCat;
  }, [tab, catalog.movies, category, query]);

  const filteredSeries = useMemo(() => {
    if (tab !== "series") return [];
    const byCat = category
      ? catalog.series.filter((s) => s.category === category)
      : catalog.series;
    const norm = query.trim().toLowerCase();
    return norm ? byCat.filter((s) => s.name.toLowerCase().includes(norm)) : byCat;
  }, [tab, catalog.series, category, query]);

  const totalForCategory = (catName: string): number => {
    if (tab === "live") return catalog.liveChannels.filter((c) => c.groupTitle === catName).length;
    if (tab === "movies") return catalog.movies.filter((m) => m.category === catName).length;
    if (tab === "series") return catalog.series.filter((s) => s.category === catName).length;
    return 0;
  };

  const onSidebarPress = (id: typeof SIDEBAR_ITEMS[number]["id"]) => {
    if (id === "hub") navigate("/hub");
    else if (id === "search") setSearchOpen((v) => !v);
    else if (id === "reload") reload();
    else if (id === "settings") navigate("/setup");
    else setTab(id);
  };

  const play = (url: string, title: string) => {
    navigate(`/player?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
  };
  const openSeries = (id: string, name: string) => {
    navigate(`/series/${id}?name=${encodeURIComponent(name)}`);
  };

  // === Render ===
  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page hot" ref={ref}>
        {/* Topbar mini con logo + indicador "Live" */}
        <div className="hot-topbar">
          <span className="hot-logo">🔥 IPTV Player</span>
          {tab === "live" && category ? (
            <span className="hot-badge">{category}</span>
          ) : null}
          {loadingStep ? (
            <span className="hot-loading">
              {loadingStep}
              {loadingProgress ? ` (${loadingProgress.current}/${loadingProgress.total})` : ""}
            </span>
          ) : null}
        </div>

        <div className="hot-body">
          {/* Sidebar de iconos */}
          <nav className="hot-icons">
            {SIDEBAR_ITEMS.map((it) => (
              <FocusableButton
                key={it.id}
                className={`hot-icon ${
                  (it.id === tab || (it.id === "search" && searchOpen)) ? "active" : ""
                }`}
                onEnterPress={() => onSidebarPress(it.id)}
              >
                <span className="hot-icon-glyph">{it.emoji}</span>
              </FocusableButton>
            ))}
          </nav>

          {/* Columna 2: categorias */}
          <aside className="hot-cats">
            <div className="hot-cats-header">
              <div className="hot-cats-title">
                {tab === "live" ? "EN VIVO" :
                  tab === "movies" ? "PELÍCULAS" :
                    tab === "series" ? "SERIES" : "FAVORITOS"}
              </div>
              <div className="hot-cats-sub">TOTAL: {tabData.totalCount}</div>
            </div>
            {searchOpen ? (
              <div style={{ padding: "8px 12px" }}>
                <FocusableInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar…"
                  focusKey="SEARCH_INPUT"
                />
              </div>
            ) : null}
            <div className="hot-cats-list">
              <FocusableButton
                className={`hot-cat ${category === null ? "selected" : ""}`}
                focusKey="CAT_0"
                onEnterPress={() => setCategory(null)}
              >
                <div className="hot-cat-name">Todas</div>
                <div className="hot-cat-total">TOTAL: {tabData.totalCount}</div>
              </FocusableButton>
              {tabData.categories.map((c) => (
                <FocusableButton
                  key={c.id}
                  className={`hot-cat ${category === c.name ? "selected" : ""}`}
                  onEnterPress={() => setCategory(c.name)}
                >
                  <div className="hot-cat-name">{c.name}</div>
                  <div className="hot-cat-total">TOTAL: {totalForCategory(c.name)}</div>
                </FocusableButton>
              ))}
            </div>
          </aside>

          {/* Columna 3: items */}
          <main className="hot-items">
            {loading && !catalog.liveChannels.length ? (
              <div className="hot-status"><div className="spinner" /> Cargando…</div>
            ) : error ? (
              <div className="hot-status">
                <div className="error" style={{ padding: 0 }}>{error}</div>
                <FocusableButton className="btn primary" onEnterPress={reload}>Reintentar</FocusableButton>
              </div>
            ) : tab === "live" ? (
              <LiveChannelList
                channels={filteredChannels.slice(0, RENDER_CAP)}
                totalFiltered={filteredChannels.length}
                cap={RENDER_CAP}
                selectedChannelId={selectedChannelId}
                onFocusChannel={setSelectedChannelId}
                epgByChannel={epgByChannel}
                isFavorite={isFavorite}
                onPlay={play}
                onToggleFavorite={(c) =>
                  toggleFavorite({
                    id: c.id, name: c.name, streamUrl: c.streamUrl, logoUrl: c.logoUrl, kind: c.kind,
                  })
                }
              />
            ) : tab === "movies" ? (
              <PosterGrid
                items={filteredMovies.slice(0, RENDER_CAP).map((m) => ({
                  id: m.id, title: m.name, posterUrl: m.posterUrl, onSelect: () => play(m.streamUrl, m.name),
                }))}
                total={filteredMovies.length}
                cap={RENDER_CAP}
              />
            ) : tab === "series" ? (
              <PosterGrid
                items={filteredSeries.slice(0, RENDER_CAP).map((s) => ({
                  id: s.id, title: s.name, posterUrl: s.posterUrl, onSelect: () => openSeries(s.id, s.name),
                }))}
                total={filteredSeries.length}
                cap={RENDER_CAP}
              />
            ) : (
              <FavoritesList favorites={favorites} onPlay={play} />
            )}
          </main>
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ===== Sub-componentes =====

interface LiveListProps {
  channels: Array<{
    id: string; name: string; streamUrl: string; logoUrl?: string;
    groupTitle?: string; tvgId?: string; kind: "live" | "movie" | "series-episode";
  }>;
  totalFiltered: number;
  cap: number;
  selectedChannelId: string | null;
  onFocusChannel: (id: string) => void;
  epgByChannel: Map<string, ReturnType<typeof findNowPlaying> extends { title?: string } | undefined ? unknown : never> | Map<string, unknown>;
  isFavorite: (id: string) => boolean;
  onPlay: (url: string, title: string) => void;
  onToggleFavorite: (c: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: "live" | "movie" | "series-episode" }) => void;
}

function LiveChannelList({
  channels, totalFiltered, cap, selectedChannelId, onFocusChannel, epgByChannel,
  isFavorite, onPlay, onToggleFavorite,
}: LiveListProps) {
  if (channels.length === 0) return <div className="hot-status">No hay canales</div>;
  return (
    <div className="hot-channels-scroll">
      {channels.map((c, idx) => {
        const now = findNowPlaying(epgByChannel as never, c.tvgId);
        const isSel = c.id === selectedChannelId;
        return (
          <FocusableButton
            key={c.id}
            className={`hot-channel ${isSel ? "selected" : ""}`}
            onFocus={() => onFocusChannel(c.id)}
            onEnterPress={() => onPlay(c.streamUrl, c.name)}
          >
            <div className="hot-channel-logo">
              {c.logoUrl ? (
                <img src={c.logoUrl} alt="" />
              ) : (
                <div className="hot-channel-logo-placeholder">📺</div>
              )}
            </div>
            <div className="hot-channel-info">
              <div className="hot-channel-name">{c.name}</div>
              {now ? <div className="hot-channel-now">{now.title}</div> : null}
            </div>
            {isFavorite(c.id) ? <span className="hot-channel-fav" onClick={(e) => { e.stopPropagation(); onToggleFavorite(c); }}>★</span> : null}
            <div className="hot-channel-num">{idx + 1}</div>
          </FocusableButton>
        );
      })}
      {totalFiltered > cap ? (
        <div className="hot-status" style={{ padding: 16 }}>
          Mostrando {cap} de {totalFiltered}. Elegí una categoría o buscá.
        </div>
      ) : null}
    </div>
  );
}

function PosterGrid({ items, total, cap }: {
  items: Array<{ id: string; title: string; posterUrl?: string; onSelect: () => void }>;
  total: number; cap: number;
}) {
  if (items.length === 0) return <div className="hot-status">Sin contenido</div>;
  return (
    <div className="poster-grid hot-poster-grid">
      {items.map((it) => (
        <PosterCard key={it.id} title={it.title} posterUrl={it.posterUrl} onSelect={it.onSelect} />
      ))}
      {total > cap ? (
        <div className="hot-status" style={{ gridColumn: "1 / -1" }}>
          Mostrando {cap} de {total}. Elegí una categoría o buscá.
        </div>
      ) : null}
    </div>
  );
}

function FavoritesList({ favorites, onPlay }: {
  favorites: Array<{ id: string; name: string; streamUrl: string; logoUrl?: string; kind: string }>;
  onPlay: (url: string, title: string) => void;
}) {
  if (favorites.length === 0) return <div className="hot-status">Sin favoritos</div>;
  return (
    <div className="hot-channels-scroll">
      {favorites.map((f, idx) => (
        <FocusableButton
          key={f.id}
          className="hot-channel"
          onEnterPress={() => onPlay(f.streamUrl, f.name)}
        >
          <div className="hot-channel-logo">
            {f.logoUrl ? <img src={f.logoUrl} alt="" /> : <div className="hot-channel-logo-placeholder">★</div>}
          </div>
          <div className="hot-channel-info">
            <div className="hot-channel-name">{f.name}</div>
          </div>
          <div className="hot-channel-num">{idx + 1}</div>
        </FocusableButton>
      ))}
    </div>
  );
}
