import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FocusContext,
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { findNextProgram, findNowPlaying } from "../data/xmltv";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { PosterCard } from "../components/PosterCard";
import { VideoPreview } from "../components/VideoPreview";
import { isBackKey } from "../webos/remote-keys";
import type Hls from "hls.js";

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
  const ui = useAppStore((s) => s.ui);
  const setUi = useAppStore((s) => s.setUi);

  // Estado respaldado en el store: al volver de otra pantalla se restaura
  // donde estabas (pestaña, categoria, canal elegido).
  const [tab, setTabState] = useState<Tab>((search.get("tab") as Tab) ?? ui.tab ?? initialTab);
  const [category, setCategoryState] = useState<string | null>(ui.category);
  const [selectedChannelId, setSelectedChannelIdState] = useState<string | null>(
    ui.selectedChannelId,
  );
  const setTab = (t: Tab) => { setTabState(t); setUi({ tab: t }); };
  const setCategory = (c: string | null) => { setCategoryState(c); setUi({ category: c }); };
  const setSelectedChannelId = (id: string | null) => {
    setSelectedChannelIdState(id);
    setUi({ selectedChannelId: id });
  };

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  // Reset de filtros SOLO al cambiar de pestaña (no en el primer render,
  // para no pisar el estado restaurado).
  const firstTabRun = useRef(true);
  useEffect(() => {
    if (firstTabRun.current) {
      firstTabRun.current = false;
      return;
    }
    setCategory(null);
    setQuery("");
    setSearchOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HOME" });

  // Foco inicial: si hay un canal recordado lo maneja el efecto de
  // restauracion; si no, a la primera categoria.
  const restoredFocus = useRef(false);
  useEffect(() => {
    if (tab === "live" && ui.selectedChannelId && !restoredFocus.current) return;
    setFocus("CAT_0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Restaurar el foco al canal donde estabas (una sola vez, cuando la lista
  // ya esta renderizada).
  useEffect(() => {
    if (restoredFocus.current) return;
    if (tab !== "live" || !selectedChannelId) {
      restoredFocus.current = true;
      return;
    }
    const idx = filteredChannels.findIndex((c) => c.id === selectedChannelId);
    if (idx >= 0 && idx < RENDER_CAP) {
      restoredFocus.current = true;
      window.setTimeout(() => setFocus(`CH_${selectedChannelId}`), 60);
    } else if (filteredChannels.length > 0) {
      // El canal recordado no esta en la vista actual: foco normal.
      restoredFocus.current = true;
      setFocus("CAT_0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedChannelId, filteredChannels]);

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

  // Numeracion global y estable: el numero de cada canal es su posicion en
  // la lista completa del proveedor. No depende de la categoria ni del
  // filtro, asi nunca hay dos canales "1".
  const channelNumbers = useMemo(() => {
    const map = new Map<string, number>();
    catalog.liveChannels.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [catalog.liveChannels]);

  // Pre-calcular conteos por categoría una sola vez por pestaña.
  // Antes esto se hacia O(N) por cada categoria en cada render -> con 55k
  // canales y 56 categorias eran 3 millones de ops por render = lag enorme.
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    const incr = (key?: string) => {
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + 1);
    };
    if (tab === "live") catalog.liveChannels.forEach((c) => incr(c.groupTitle));
    else if (tab === "movies") catalog.movies.forEach((m) => incr(m.category ?? undefined));
    else if (tab === "series") catalog.series.forEach((s) => incr(s.category ?? undefined));
    return map;
  }, [tab, catalog]);

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
                  <div className="hot-cat-total">TOTAL: {categoryCounts.get(c.name) ?? 0}</div>
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
                channelNumbers={channelNumbers}
                onChannelEnter={(c) => {
                  // OK 1: arranca en el preview con sonido.
                  // OK 2 (mismo canal): expande a pantalla completa SIN recargar
                  // (es el mismo <video> del preview, solo cambia el layout).
                  if (selectedChannelId === c.id) setFullscreen(true);
                  else setSelectedChannelId(c.id);
                }}
                epgByChannel={epgByChannel}
                isFavorite={isFavorite}
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
              <FavoritesList favorites={favorites} channelNumbers={channelNumbers} onPlay={play} />
            )}
          </main>

          {/* Columna 4: preview (solo en En vivo) */}
          {tab === "live" ? (
            <PreviewPanel
              channel={
                selectedChannelId
                  ? catalog.liveChannels.find((c) => c.id === selectedChannelId) ?? null
                  : null
              }
              channelNumber={
                selectedChannelId ? channelNumbers.get(selectedChannelId) ?? null : null
              }
              epgByChannel={epgByChannel}
              fullscreen={fullscreen}
              onEnterFullscreen={() => setFullscreen(true)}
              onExitFullscreen={() => setFullscreen(false)}
            />
          ) : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}

interface PreviewChannel {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl?: string;
  tvgId?: string;
}

/** Detecta la calidad declarada en el nombre del canal (4K| UHD, FHD, etc). */
function qualityFromName(name: string): string | null {
  if (/4k|uhd|2160/i.test(name)) return "4K UHD";
  if (/fhd|1080/i.test(name)) return "FHD";
  if (/\bhd\b|720/i.test(name)) return "HD";
  if (/\bsd\b|480/i.test(name)) return "SD";
  return null;
}

interface PreviewProps {
  channel: PreviewChannel | null;
  channelNumber: number | null;
  epgByChannel: unknown;
  fullscreen: boolean;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
}

function PreviewPanel({
  channel, channelNumber, epgByChannel, fullscreen, onEnterFullscreen, onExitFullscreen,
}: PreviewProps) {
  const now = channel ? findNowPlaying(epgByChannel as never, channel.tvgId) : null;
  const next = channel ? findNextProgram(epgByChannel as never, channel.tvgId) : null;
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [fsOverlay, setFsOverlay] = useState(true);
  const fsTimer = useRef<number | null>(null);
  const prevFs = useRef(false);
  const [hls, setHls] = useState<Hls | null>(null);
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);
  const [tracksOpen, setTracksOpen] = useState(false);
  const tracksOpenRef = useRef(false);
  tracksOpenRef.current = tracksOpen;
  const quality = channel ? qualityFromName(channel.name) : null;

  // Al cambiar de canal, resetear estado de pausa y menu de pistas.
  useEffect(() => {
    setPaused(false);
    setTracksOpen(false);
  }, [channel?.id]);

  const togglePause = () => {
    const v = videoElRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => undefined);
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const pokeOverlay = () => {
    setFsOverlay(true);
    if (fsTimer.current !== null) window.clearTimeout(fsTimer.current);
    fsTimer.current = window.setTimeout(() => {
      // No esconder los controles mientras el menu de pistas este abierto.
      if (!tracksOpenRef.current) setFsOverlay(false);
    }, 5000);
  };

  // Manejo de teclas en fullscreen: back sale (el video sigue en el preview),
  // flechas verticales no escapan a la lista de atras, cualquier tecla
  // re-muestra el overlay de controles.
  useEffect(() => {
    if (!fullscreen) {
      // Al salir de fullscreen, volver el foco al canal en la lista.
      if (prevFs.current) setFocus(channel ? `CH_${channel.id}` : "PV_PAUSE");
      prevFs.current = false;
      return;
    }
    prevFs.current = true;
    pokeOverlay();
    setFocus("FS_PAUSE");
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (tracksOpenRef.current) {
          setTracksOpen(false);
          setFocus("FS_TRACKS");
        } else {
          onExitFullscreen();
        }
        return;
      }
      if (!tracksOpenRef.current && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // Evitar que el foco se escape a la lista que quedo detras.
        // (Con el menu de pistas abierto, las flechas navegan el menu.)
        e.stopPropagation();
      }
      pokeOverlay();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (fsTimer.current !== null) window.clearTimeout(fsTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  return (
    <aside className="hot-preview">
      <div
        className={`hot-preview-video ${fullscreen ? "fs" : ""}`}
        onClick={() => {
          // Click/tap sobre la vista previa = pantalla completa.
          if (!fullscreen && channel) onEnterFullscreen();
        }}
      >
        <VideoPreview
          url={channel?.streamUrl ?? null}
          muted={false}
          onVideoEl={(el) => { videoElRef.current = el; }}
          onHls={setHls}
          onResolution={(w, h) => setRes(w > 0 ? { w, h } : null)}
        />
        {fullscreen ? (
          <div className={`fs-overlay ${fsOverlay ? "visible" : ""}`}>
            <div className="fs-top">
              <div className="fs-name">{channel?.name}</div>
              <div className="fs-meta">
                {channelNumber !== null ? <span className="chip blue">Nº {channelNumber}</span> : null}
                {quality ? <span className="chip yellow">{quality}</span> : null}
                {res ? <span className="chip dark">REPRODUCIENDO {res.w} x {res.h}</span> : null}
              </div>
              {now ? <div className="fs-now">AHORA · {now.title}</div> : null}
            </div>
            <div className="fs-bottom">
              <FocusableButton
                focusKey="FS_PAUSE"
                className="btn hot-ctrl"
                onEnterPress={togglePause}
              >
                {paused ? "▶ Reproducir" : "⏸ Pausa"}
              </FocusableButton>
              <FocusableButton
                focusKey="FS_TRACKS"
                className="btn hot-ctrl"
                onEnterPress={() => {
                  setTracksOpen((v) => !v);
                  pokeOverlay();
                  window.setTimeout(() => setFocus("TRK_FIRST"), 60);
                }}
              >
                ⚙ Calidad / Audio / Sub
              </FocusableButton>
              <FocusableButton className="btn hot-ctrl" onEnterPress={onExitFullscreen}>
                ← Volver a la lista
              </FocusableButton>
            </div>
            {tracksOpen ? (
              <TrackMenu
                hls={hls}
                onClose={() => {
                  setTracksOpen(false);
                  setFocus("FS_TRACKS");
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {channel ? (
        <>
          <div className="hot-preview-controls">
            <FocusableButton focusKey="PV_PAUSE" className="btn hot-ctrl" onEnterPress={togglePause}>
              {paused ? "▶ Reproducir" : "⏸ Pausa"}
            </FocusableButton>
            <FocusableButton
              className="btn hot-ctrl primary"
              onEnterPress={onEnterFullscreen}
            >
              ⛶ Pantalla completa
            </FocusableButton>
          </div>
          <div className="hot-preview-info">
            {channel.logoUrl ? (
              <img className="hot-preview-logo" src={channel.logoUrl} alt="" />
            ) : null}
            <div className="hot-preview-name">{channel.name}</div>
            <div className="hot-preview-meta">
              {channelNumber !== null ? <span className="chip blue">Nº {channelNumber}</span> : null}
              {quality ? <span className="chip yellow">{quality}</span> : null}
              {res ? <span className="chip dark">{res.w} x {res.h}</span> : null}
            </div>
            {now ? (
              <>
                <div className="hot-preview-now-label">AHORA</div>
                <div className="hot-preview-now">{now.title}</div>
                {now.description ? (
                  <div className="hot-preview-desc">{now.description}</div>
                ) : null}
              </>
            ) : null}
            {next ? (
              <>
                <div className="hot-preview-now-label next">DESPUÉS · {
                  new Date(next.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }</div>
                <div className="hot-preview-next">{next.title}</div>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <div className="hot-preview-info muted">
          Apretá OK en un canal para verlo acá con sonido. OK de nuevo: pantalla completa.
        </div>
      )}
    </aside>
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
  channelNumbers: Map<string, number>;
  onChannelEnter: (c: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: "live" | "movie" | "series-episode" }) => void;
  epgByChannel: Map<string, ReturnType<typeof findNowPlaying> extends { title?: string } | undefined ? unknown : never> | Map<string, unknown>;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (c: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: "live" | "movie" | "series-episode" }) => void;
}

function LiveChannelList({
  channels, totalFiltered, cap, selectedChannelId, channelNumbers, onChannelEnter, epgByChannel,
  isFavorite, onToggleFavorite,
}: LiveListProps) {
  if (channels.length === 0) return <div className="hot-status">No hay canales</div>;
  return (
    <div className="hot-channels-scroll">
      {channels.map((c) => {
        const now = findNowPlaying(epgByChannel as never, c.tvgId);
        const isSel = c.id === selectedChannelId;
        return (
          <FocusableButton
            key={c.id}
            focusKey={`CH_${c.id}`}
            className={`hot-channel ${isSel ? "selected" : ""}`}
            onEnterPress={() => onChannelEnter(c)}
          >
            <div className="hot-channel-num">{channelNumbers.get(c.id) ?? "—"}</div>
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

function FavoritesList({ favorites, channelNumbers, onPlay }: {
  favorites: Array<{ id: string; name: string; streamUrl: string; logoUrl?: string; kind: string }>;
  channelNumbers: Map<string, number>;
  onPlay: (url: string, title: string) => void;
}) {
  if (favorites.length === 0) return <div className="hot-status">Sin favoritos</div>;
  return (
    <div className="hot-channels-scroll">
      {favorites.map((f) => (
        <FocusableButton
          key={f.id}
          className="hot-channel"
          onEnterPress={() => onPlay(f.streamUrl, f.name)}
        >
          <div className="hot-channel-num">{channelNumbers.get(f.id) ?? "★"}</div>
          <div className="hot-channel-logo">
            {f.logoUrl ? <img src={f.logoUrl} alt="" /> : <div className="hot-channel-logo-placeholder">★</div>}
          </div>
          <div className="hot-channel-info">
            <div className="hot-channel-name">{f.name}</div>
          </div>
        </FocusableButton>
      ))}
    </div>
  );
}

/** Menu de pistas: calidad (niveles HLS), audio y subtitulos. */
function TrackMenu({ hls, onClose }: { hls: Hls | null; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  if (!hls) {
    return (
      <div className="trk-menu">
        <div className="trk-title">Pistas</div>
        <div className="trk-empty">
          Este stream no permite cambiar calidad, audio ni subtítulos
          (reproducción directa sin variantes).
        </div>
        <FocusableButton focusKey="TRK_FIRST" className="btn hot-ctrl" onEnterPress={onClose}>
          Cerrar
        </FocusableButton>
      </div>
    );
  }

  const levels = hls.levels ?? [];
  const audioTracks = hls.audioTracks ?? [];
  const subTracks = hls.subtitleTracks ?? [];

  const levelLabel = (l: { height?: number; bitrate?: number }) =>
    l.height ? `${l.height}p` : `${Math.round((l.bitrate ?? 0) / 1000)} kbps`;

  return (
    <div className="trk-menu">
      <div className="trk-title">Pistas</div>
      <div className="trk-scroll">
        <div className="trk-section">CALIDAD</div>
        <FocusableButton
          focusKey="TRK_FIRST"
          className={`trk-item ${hls.autoLevelEnabled ? "on" : ""}`}
          onEnterPress={() => { hls.currentLevel = -1; refresh(); }}
        >
          Auto {hls.autoLevelEnabled ? "✓" : ""}
        </FocusableButton>
        {levels.map((l, i) => (
          <FocusableButton
            key={`lv-${i}`}
            className={`trk-item ${!hls.autoLevelEnabled && hls.currentLevel === i ? "on" : ""}`}
            onEnterPress={() => { hls.currentLevel = i; refresh(); }}
          >
            {levelLabel(l)} {!hls.autoLevelEnabled && hls.currentLevel === i ? "✓" : ""}
          </FocusableButton>
        ))}

        {audioTracks.length > 0 ? (
          <>
            <div className="trk-section">AUDIO</div>
            {audioTracks.map((t, i) => (
              <FocusableButton
                key={`au-${i}`}
                className={`trk-item ${hls.audioTrack === i ? "on" : ""}`}
                onEnterPress={() => { hls.audioTrack = i; refresh(); }}
              >
                {t.name || t.lang || `Pista ${i + 1}`} {hls.audioTrack === i ? "✓" : ""}
              </FocusableButton>
            ))}
          </>
        ) : null}

        <div className="trk-section">SUBTÍTULOS</div>
        <FocusableButton
          className={`trk-item ${hls.subtitleTrack === -1 ? "on" : ""}`}
          onEnterPress={() => { hls.subtitleTrack = -1; refresh(); }}
        >
          Desactivados {hls.subtitleTrack === -1 ? "✓" : ""}
        </FocusableButton>
        {subTracks.map((t, i) => (
          <FocusableButton
            key={`su-${i}`}
            className={`trk-item ${hls.subtitleTrack === i ? "on" : ""}`}
            onEnterPress={() => { hls.subtitleTrack = i; refresh(); }}
          >
            {t.name || t.lang || `Sub ${i + 1}`} {hls.subtitleTrack === i ? "✓" : ""}
          </FocusableButton>
        ))}
        {subTracks.length === 0 ? (
          <div className="trk-empty small">Este canal no trae subtítulos.</div>
        ) : null}
      </div>
      <FocusableButton className="btn hot-ctrl" onEnterPress={onClose}>
        Cerrar
      </FocusableButton>
    </div>
  );
}
