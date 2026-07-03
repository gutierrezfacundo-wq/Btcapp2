import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Channel, EpgProgram } from "../data/types";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type Hls from "hls.js";
import { useAppStore, applyCatPrefs } from "../store/useAppStore";
import { findNextProgram, findNowPlaying } from "../data/xmltv";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { Icon } from "../components/Icon";
import { Rail, type RailId } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { VideoPreview } from "../components/VideoPreview";
import { VirtualList } from "../components/VirtualList";
import { TrackSheet } from "../components/TrackSheet";
import { FocusZone } from "../components/FocusZone";
import { useBack } from "../navigation/backStack";
import { focusWhenReady, restoreFocus } from "../navigation/focusMemory";

type Tab = "live" | "movies" | "series" | "favorites";
// Listas y grilla VOD se virtualizan (VirtualList): se renderizan completas sin tope.

function initials(s: string) {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function quality(name: string): string | null {
  if (/4k|uhd|2160/i.test(name)) return "4K";
  if (/fhd|1080/i.test(name)) return "FHD";
  if (/\bhd\b|720/i.test(name)) return "HD";
  if (/\bsd\b|480/i.test(name)) return "SD";
  return null;
}
function fmtClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Fila de canal memoizada: al seleccionar/mover el foco solo se re-renderizan las
 * filas cuyo `sel`/`fav` cambió, no las 250. Los callbacks deben ser estables.
 */
const ChannelRow = memo(function ChannelRow({
  channel, num, sel, fav, epg, epgOff, onEnter, onFav,
}: {
  channel: Channel;
  num: number | string;
  sel: boolean;
  fav: boolean;
  epg: Map<string, EpgProgram[]>;
  epgOff: number;
  onEnter: (id: string) => void;
  onFav: (c: Channel) => void;
}) {
  const now = findNowPlaying(epg, channel.tvgId, epgOff);
  const ql = quality(channel.name);
  return (
    <FocusableButton
      focusKey={`CH_${channel.id}`}
      className={`a-ch ${sel ? "playing" : ""}`}
      onEnterPress={() => onEnter(channel.id)}
    >
      <span className="a-ch-num">{num}</span>
      <span className="a-ch-logo">{channel.logoUrl ? <img src={channel.logoUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 11 }} /> : initials(channel.name)}</span>
      <span className="a-ch-info">
        <div className="a-ch-name">{channel.name}</div>
        {now ? <div className="a-ch-now">{now.title}</div> : null}
        {now && now.stopMs > now.startMs ? (
          <div className="a-ch-prog"><i style={{ width: `${Math.max(0, Math.min(100, ((Date.now() - now.startMs) / (now.stopMs - now.startMs)) * 100))}%` }} /></div>
        ) : null}
      </span>
      {channel.archiveDays ? <span className="a-ch-arch"><Icon name="history" /></span> : null}
      {ql ? <span className="a-ch-q">{ql}</span> : null}
      {fav ? <span className="a-ch-fav" onClick={(e) => { e.stopPropagation(); onFav(channel); }}><Icon name="star" /></span> : null}
    </FocusableButton>
  );
});

export function Home() {
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const catalog = useAppStore((s) => s.catalog);
  const favorites = useAppStore((s) => s.favorites);
  const loading = useAppStore((s) => s.loading);
  const loadingStep = useAppStore((s) => s.loadingStep);
  const loadingProgress = useAppStore((s) => s.loadingProgress);
  const error = useAppStore((s) => s.error);
  const source = useAppStore((s) => s.source);
  const reload = useAppStore((s) => s.reload);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const epgByChannel = useAppStore((s) => s.epgByChannel);
  const epgOffMs = useAppStore((s) => s.epgOffsetH) * 3600000;
  const ui = useAppStore((s) => s.ui);
  const setUi = useAppStore((s) => s.setUi);

  const [tab, setTabState] = useState<Tab>((search.get("tab") as Tab) ?? ui.tab ?? "live");
  const [category, setCategoryState] = useState<string | null>(ui.category);
  const [selectedChannelId, setSelectedChannelIdState] = useState<string | null>(ui.selectedChannelId);
  const setTab = (t: Tab) => { setTabState(t); setUi({ tab: t }); };
  const setCategory = (c: string | null) => { setCategoryState(c); setUi({ category: c }); };
  const setSelectedChannelId = (id: string | null) => { setSelectedChannelIdState(id); setUi({ selectedChannelId: id }); };

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(search.get("search") === "1");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => { if (!source) navigate("/setup"); }, [source, navigate]);

  // Back: buscador abierto lo cierra; si no, vuelve al Inicio (o a los
  // resultados de búsqueda si se llegó desde el buscador global).
  // (El fullscreen del preview registra su propia capa más profunda.)
  const fromSearch = search.get("from") === "search";
  useBack(() => {
    if (searchOpen) { setSearchOpen(false); return; }
    navigate(fromSearch ? "/search" : "/hub");
  }, !fullscreen);

  useEffect(() => {
    if (tab === "movies" && !loadedSections.movies) ensureMovies();
    if (tab === "series" && !loadedSections.series) ensureSeries();
  }, [tab, loadedSections, ensureMovies, ensureSeries]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HOME" });
  // Enfocar recién cuando el contenido del tab existe (si no, el intento vence
  // durante el spinner de carga y el D-pad queda sin foco inicial). En Vivo con
  // canal seleccionado: SIEMPRE volver a ese canal (la lista lo centra sola).
  const liveReady = catalog.liveChannels.length > 0;
  useEffect(() => {
    const ready = tab === "live" ? liveReady
      : tab === "favorites" ? true
      : tab === "movies" ? loadedSections.movies : loadedSections.series;
    if (!ready) return;
    if (tab === "live" && selectedChannelId) {
      focusWhenReady(`CH_${selectedChannelId}`, 40);
      return;
    }
    restoreFocus(`home:${tab}`, "CAT_0");
  }, [tab, liveReady, loadedSections.movies, loadedSections.series]); // eslint-disable-line react-hooks/exhaustive-deps

  const railSelect = (id: RailId) => {
    if (id === "hub") navigate("/hub");
    else if (id === "settings") navigate("/setup");
    else if (id === "reload") reload();
    else if (id === "search") navigate("/search");
    else { setTab(id as Tab); setCategory(null); setQuery(""); }
  };

  // ===== Datos =====
  const channelNumbers = useMemo(() => {
    const m = new Map<string, number>();
    catalog.liveChannels.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [catalog.liveChannels]);

  // Preferencias del usuario: categorías ocultas y orden propio (por lista).
  const catPrefs = useAppStore((s) => s.catPrefs);
  const sectionPrefs = tab === "live" ? catPrefs.live
    : tab === "movies" ? catPrefs.movies
    : tab === "series" ? catPrefs.series : null;
  const rawCategories = tab === "live" ? catalog.liveCategories
    : tab === "movies" ? catalog.movieCategories
    : tab === "series" ? catalog.seriesCategories : [];
  const categories = useMemo(
    () => (sectionPrefs ? applyCatPrefs(rawCategories, sectionPrefs) : rawCategories),
    [rawCategories, sectionPrefs],
  );
  const hiddenCats = useMemo(() => new Set(sectionPrefs?.hidden ?? []), [sectionPrefs]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    const inc = (k?: string) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
    if (tab === "live") catalog.liveChannels.forEach((c) => inc(c.groupTitle));
    else if (tab === "movies") catalog.movies.forEach((x) => inc(x.category ?? undefined));
    else if (tab === "series") catalog.series.forEach((x) => inc(x.category ?? undefined));
    return m;
  }, [tab, catalog]);

  // El input se actualiza al instante; el filtrado (caro) se difiere para no trabar el tipeo.
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();

  // Orden de la grilla VOD: por defecto (proveedor) / recientes / año / A-Z.
  type SortMode = "default" | "recent" | "year" | "az";
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const collator = useMemo(() => new Intl.Collator("es", { sensitivity: "base" }), []);
  const applySort = useCallback(<T extends { name: string; year?: string; addedAt?: number }>(list: T[]): T[] => {
    if (sortMode === "default") return list;
    const out = [...list];
    if (sortMode === "recent") out.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    else if (sortMode === "year") out.sort((a, b) => (Number(b.year?.slice(0, 4)) || 0) - (Number(a.year?.slice(0, 4)) || 0));
    else out.sort((a, b) => collator.compare(a.name, b.name));
    return out;
  }, [sortMode, collator]);
  // En "Todas" también se excluye el contenido de las categorías ocultas.
  const liveFiltered = useMemo(() => {
    if (tab !== "live") return [];
    const byCat = category ? catalog.liveChannels.filter((c) => c.groupTitle === category)
      : hiddenCats.size ? catalog.liveChannels.filter((c) => !hiddenCats.has(c.groupTitle ?? "")) : catalog.liveChannels;
    return q ? byCat.filter((c) => c.name.toLowerCase().includes(q)) : byCat;
  }, [tab, catalog.liveChannels, category, q, hiddenCats]);
  const moviesFiltered = useMemo(() => {
    if (tab !== "movies") return [];
    const byCat = category ? catalog.movies.filter((m) => m.category === category)
      : hiddenCats.size ? catalog.movies.filter((m) => !hiddenCats.has(m.category ?? "")) : catalog.movies;
    return applySort(q ? byCat.filter((m) => m.name.toLowerCase().includes(q)) : byCat);
  }, [tab, catalog.movies, category, q, applySort, hiddenCats]);
  const seriesFiltered = useMemo(() => {
    if (tab !== "series") return [];
    const byCat = category ? catalog.series.filter((s) => s.category === category)
      : hiddenCats.size ? catalog.series.filter((s) => !hiddenCats.has(s.category ?? "")) : catalog.series;
    return applySort(q ? byCat.filter((s) => s.name.toLowerCase().includes(q)) : byCat);
  }, [tab, catalog.series, category, q, applySort, hiddenCats]);

  const openSeries = (id: string, name: string) => {
    navigate(`/series/${id}?name=${encodeURIComponent(name)}`);
  };

  const selectedChannel = selectedChannelId
    ? catalog.liveChannels.find((c) => c.id === selectedChannelId) ?? null : null;

  // Set de favoritos (lookup O(1)) y callbacks estables para que ChannelRow memoice.
  const favIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const selRef = useRef(selectedChannelId);
  selRef.current = selectedChannelId;
  const liveFilteredRef = useRef<Channel[]>([]);

  const liveSelIdx = useMemo(
    () => (selectedChannelId ? liveFiltered.findIndex((c) => c.id === selectedChannelId) : -1),
    [liveFiltered, selectedChannelId],
  );
  liveFilteredRef.current = liveFiltered;
  // Categorías con "Todas" al frente, para virtualizar la columna.
  const catItems = useMemo(() => [{ id: "__all__", name: "Todas" }, ...categories], [categories]);
  const selCatIdx = category === null ? 0 : catItems.findIndex((c) => c.name === category);

  // Datos livianos para la grilla virtualizada (sin closures por item).
  const gridItems = useMemo(() => {
    if (tab === "movies") return moviesFiltered.map((m) => ({ id: m.id, name: m.name, posterUrl: m.posterUrl, year: m.year, rating: m.rating, genre: m.category }));
    if (tab === "series") return seriesFiltered.map((s) => ({ id: s.id, name: s.name, posterUrl: s.posterUrl, year: s.year, rating: undefined as string | undefined, genre: s.category }));
    return [];
  }, [tab, moviesFiltered, seriesFiltered]);
  const onPickGrid = (index: number) => {
    if (tab === "movies") {
      const m = moviesFiltered[index];
      if (m) navigate(`/movie/${m.id}`);
    } else {
      const s = seriesFiltered[index];
      if (s) openSeries(s.id, s.name);
    }
  };
  const onRowEnter = useCallback((id: string) => {
    if (selRef.current === id) setFullscreen(true);
    else setSelectedChannelId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Zapping en pantalla completa: canal anterior/siguiente en la lista actual.
  const onZap = useCallback((dir: 1 | -1) => {
    const list = liveFilteredRef.current;
    if (!list.length) return;
    const idx = list.findIndex((c) => c.id === selRef.current);
    const next = list[((idx < 0 ? 0 : idx + dir) + list.length) % list.length];
    if (next) setSelectedChannelId(next.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onZapToNumber = useCallback((n: number) => {
    const c = catalog.liveChannels[n - 1];
    if (c) setSelectedChannelId(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.liveChannels]);

  const onRowFav = useCallback((c: Channel) => {
    const n = channelNumbers.get(c.id);
    const meta = [n ? `Nº ${n}` : null, quality(c.name)].filter(Boolean).join(" · ") || undefined;
    toggleFavorite({ id: c.id, name: c.name, streamUrl: c.streamUrl, logoUrl: c.logoUrl, kind: c.kind, meta });
  }, [toggleFavorite, channelNumbers]);

  const title = tab === "live" ? "En vivo" : tab === "movies" ? "Películas" : tab === "series" ? "Series" : "Favoritos";

  // Películas/Series se bajan a demanda: mostramos spinner mientras la sección carga.
  const sectionLoading =
    (tab === "movies" && !loadedSections.movies) || (tab === "series" && !loadedSections.series);
  const retrySection = () => { if (tab === "movies") ensureMovies(); else if (tab === "series") ensureSeries(); };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar
          title={title}
          center={tab === "live" && category ? <div className="a-catnow">{category}</div> : undefined}
        />
        <div className="a-body">
          <Rail active={tab} onSelect={railSelect} reloading={loading} />
          <FocusZone key={`home:${tab}`} zone={`home:${tab}`} className={`a-screen ${tab === "live" && !loading && !error ? "live-row" : ""}`}>
            {loading && !catalog.liveChannels.length ? (
              /* Skeletons con la geometría real: la pantalla nunca queda vacía. */
              <div className="a-body-sk">
                <div className="a-cats sk-side">
                  {Array.from({ length: 9 }, (_, i) => <div key={i} className="sk sk-cat" style={{ animationDelay: `${i * 60}ms` }} />)}
                </div>
                <div className="a-list sk-main">
                  <div className="a-list-h">{loadingStep ?? "Cargando…"}{loadingProgress ? ` · ${loadingProgress.current}/${loadingProgress.total}` : ""}</div>
                  {Array.from({ length: 9 }, (_, i) => <div key={i} className="sk sk-ch" style={{ animationDelay: `${i * 60}ms` }} />)}
                </div>
              </div>
            ) : error && !catalog.liveChannels.length ? (
              <div className="ld">
                <Icon name="wifi_off" className="eo-ic" />
                <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                <FocusableButton className="btn primary" onEnterPress={reload}>Reintentar</FocusableButton>
              </div>
            ) : tab === "live" ? (
              <>
                <FocusZone zone="cats" preferred="CAT_0" className="a-cats">
                  <div className="a-cats-h"><span className="a-cats-t">Categorías</span><span className="a-cats-c">{categories.length}</span></div>
                  {searchOpen ? (
                    <div className="a-search">
                      <Icon name="search" />
                      <FocusableInput focusKey="SEARCH_IN" value={query} onChange={setQuery} placeholder="Buscar canal…" />
                    </div>
                  ) : null}
                  <VirtualList
                    className="a-cats-list scroll"
                    items={catItems}
                    estRowHeight={50}
                    overscan={12}
                    scrollToIndex={selCatIdx}
                    getKey={(c) => c.id}
                    renderRow={(c) => (
                      c.id === "__all__" ? (
                        <FocusableButton focusKey="CAT_0" className={`a-cat ${category === null ? "sel" : ""}`} onEnterPress={() => setCategory(null)}>
                          <span className="a-cat-n">Todas</span><span className="a-cat-t">{catalog.liveChannels.length}</span>
                        </FocusableButton>
                      ) : (
                        <FocusableButton focusKey={`CATG_${c.id}`} className={`a-cat ${category === c.name ? "sel" : ""}`} onEnterPress={() => setCategory(c.name)}>
                          <span className="a-cat-n">{c.name}</span><span className="a-cat-t">{counts.get(c.name) ?? 0}</span>
                        </FocusableButton>
                      )
                    )}
                  />
                </FocusZone>

                <FocusZone zone="list" className="a-list">
                  <div className="a-list-h">Canales · {category ?? "Todas"} · {liveFiltered.length}</div>
                  <VirtualList
                    className="a-list-vp scroll"
                    items={liveFiltered}
                    estRowHeight={83}
                    overscan={10}
                    scrollToIndex={liveSelIdx}
                    getKey={(c) => c.id}
                    renderRow={(c) => (
                      <ChannelRow
                        channel={c}
                        num={channelNumbers.get(c.id) ?? "—"}
                        sel={c.id === selectedChannelId}
                        fav={favIds.has(c.id)}
                        epg={epgByChannel}
                        epgOff={epgOffMs}
                        onEnter={onRowEnter}
                        onFav={onRowFav}
                      />
                    )}
                  />
                </FocusZone>

                <PreviewPanel
                  channel={selectedChannel}
                  channelNumber={selectedChannelId ? channelNumbers.get(selectedChannelId) ?? null : null}
                  epgByChannel={epgByChannel}
                  fullscreen={fullscreen}
                  onEnterFullscreen={() => setFullscreen(true)}
                  onExitFullscreen={() => setFullscreen(false)}
                  onCatchup={() => { if (selectedChannelId) navigate(`/catchup/${selectedChannelId}`); }}
                  onZap={onZap}
                  onZapToNumber={onZapToNumber}
                />
              </>
            ) : tab === "favorites" ? (
              <FavScreen
                favorites={favorites}
                onOpen={(f) => {
                  if (f.kind === "movie") navigate(`/movie/${f.id}`);
                  else if (f.kind === "series-episode") navigate(`/series/${f.id.replace(/^series:/, "")}?name=${encodeURIComponent(f.name)}`);
                  else { setSelectedChannelId(f.id); setTab("live"); }
                }}
                onToggle={toggleFavorite}
              />
            ) : sectionLoading ? (
              error ? (
                <div className="ld">
                  <Icon name="wifi_off" className="eo-ic" />
                  <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                  <FocusableButton className="btn primary" onEnterPress={retrySection}>Reintentar</FocusableButton>
                </div>
              ) : (
                <div className="ld">
                  <div className="ld-spin spinner" />
                  <div className="ld-step">{loadingStep ?? (tab === "movies" ? "Cargando películas…" : "Cargando series…")}</div>
                  {loadingProgress ? <div className="ld-count">{loadingProgress.current} / {loadingProgress.total}</div> : null}
                </div>
              )
            ) : (
              <GridScreen
                title={title}
                count={tab === "movies" ? moviesFiltered.length : seriesFiltered.length}
                categories={categories}
                category={category}
                onCategory={setCategory}
                query={query}
                onQuery={setQuery}
                items={gridItems}
                onPick={onPickGrid}
                sortMode={sortMode}
                onSortChange={(m) => setSortMode(m as SortMode)}
              />
            )}
          </FocusZone>
        </div>
        <Hints items={tab === "live"
          ? [{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Ver / Pantalla completa" }, { k: "F", label: "Favorito" }, { k: "Esc", label: "Volver" }]
          : [{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Seleccionar" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}

// ===================== PREVIEW + FULLSCREEN + TRACKS =====================
interface PreviewChannel { id: string; name: string; streamUrl: string; logoUrl?: string; tvgId?: string; archiveDays?: number }

function PreviewPanel({
  channel, channelNumber, epgByChannel, fullscreen, onEnterFullscreen, onExitFullscreen, onCatchup, onZap, onZapToNumber,
}: {
  channel: PreviewChannel | null;
  channelNumber: number | null;
  epgByChannel: Map<string, ReturnType<typeof findNowPlaying>[]> | unknown;
  fullscreen: boolean;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  onCatchup: () => void;
  onZap: (dir: 1 | -1) => void;
  onZapToNumber: (n: number) => void;
}) {
  const epgOffMs = useAppStore((s) => s.epgOffsetH) * 3600000;
  const now = channel ? findNowPlaying(epgByChannel as never, channel.tvgId, epgOffMs) : null;
  const next = channel ? findNextProgram(epgByChannel as never, channel.tvgId, epgOffMs) : null;
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [hls, setHls] = useState<Hls | null>(null);
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);
  const [bitrate, setBitrate] = useState(0);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [fsOverlay, setFsOverlay] = useState(true);
  const fsTimer = useRef<number | null>(null);
  const prevFs = useRef(false);
  const tracksRef = useRef(false); tracksRef.current = tracksOpen;
  const ql = channel ? quality(channel.name) : null;
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const isFav = !!channel && favorites.some((f) => f.id === channel.id);
  const toggleFav = () => { if (channel) toggleFavorite({ id: channel.id, name: channel.name, streamUrl: channel.streamUrl, logoUrl: channel.logoUrl, kind: "live", meta: [channelNumber ? `Nº ${channelNumber}` : null, ql].filter(Boolean).join(" · ") || undefined }); };

  useEffect(() => { setPaused(false); setTracksOpen(false); setBitrate(0); setRes(null); }, [channel?.id]);
  const togglePause = () => { const v = videoElRef.current; if (!v) return; if (v.paused) { v.play().catch(() => undefined); setPaused(false); } else { v.pause(); setPaused(true); } };
  const poke = () => { setFsOverlay(true); if (fsTimer.current) window.clearTimeout(fsTimer.current); fsTimer.current = window.setTimeout(() => { if (!tracksRef.current) setFsOverlay(false); }, 5000); };

  // Back en fullscreen: si la hoja de pistas está abierta, su propio useBack
  // (más profundo) la cierra; si no, salimos a la lista.
  useBack(() => { onExitFullscreen(); }, fullscreen);

  // Zapping numérico: tipeás el número del canal y salta solo.
  const [zapBuf, setZapBuf] = useState("");
  const zapBufRef = useRef(""); zapBufRef.current = zapBuf;
  const zapTimer = useRef<number | null>(null);
  const commitZap = () => {
    const n = parseInt(zapBufRef.current, 10);
    setZapBuf("");
    if (zapTimer.current) { window.clearTimeout(zapTimer.current); zapTimer.current = null; }
    if (n > 0) onZapToNumber(n);
  };

  useEffect(() => {
    if (!fullscreen) { if (prevFs.current) focusWhenReady(channel ? `CH_${channel.id}` : "PV_PAUSE"); prevFs.current = false; return; }
    prevFs.current = true; poke(); focusWhenReady("FS_PAUSE");
    const onKey = (e: KeyboardEvent) => {
      if (!tracksRef.current) {
        // ↑↓ y CH± cambian de canal sin salir de pantalla completa.
        if (e.key === "ArrowUp" || e.keyCode === 33) { e.preventDefault(); e.stopPropagation(); onZap(-1); }
        else if (e.key === "ArrowDown" || e.keyCode === 34) { e.preventDefault(); e.stopPropagation(); onZap(1); }
        else if (/^[0-9]$/.test(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const next = (zapBufRef.current + e.key).slice(0, 4);
          setZapBuf(next); zapBufRef.current = next;
          if (zapTimer.current) window.clearTimeout(zapTimer.current);
          zapTimer.current = window.setTimeout(commitZap, 1800);
        } else if (e.key === "Enter" && zapBufRef.current) {
          e.preventDefault(); e.stopPropagation(); commitZap();
        }
      }
      poke();
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); if (fsTimer.current) window.clearTimeout(fsTimer.current); if (zapTimer.current) window.clearTimeout(zapTimer.current); };
  }, [fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const progPct = now && now.stopMs > now.startMs ? Math.max(0, Math.min(100, ((Date.now() - now.startMs) / (now.stopMs - now.startMs)) * 100)) : 0;

  return (
    <FocusZone zone="preview" className="a-prev">
      {!channel ? (
        <div className="a-prev-empty"><Icon name="live_tv" size={64} /><div>Apretá OK en un canal para verlo acá con sonido. OK de nuevo: pantalla completa.</div></div>
      ) : (
        <>
          <div className={fullscreen ? "a-fs" : "a-video"} style={fullscreen ? { position: "fixed", inset: 0, zIndex: 60, borderRadius: 0 } : undefined}
            onClick={() => { if (!fullscreen) onEnterFullscreen(); }}>
            <VideoPreview url={channel.streamUrl} muted={false}
              onVideoEl={(el) => { videoElRef.current = el; }} onHls={setHls}
              onResolution={(w, h) => setRes(w > 0 ? { w, h } : null)}
              onBitrate={setBitrate} />
            {!fullscreen ? (
              <>
                <div className="a-vid-grad" />
                {res || bitrate ? (
                  <div className="a-vid-top">
                    <span className="a-vid-feed">
                      {res ? `${res.h}p` : ""}{res && bitrate ? " · " : ""}{bitrate ? `${Math.round(bitrate / 1e6)} Mbps` : ""}
                    </span>
                  </div>
                ) : null}
                <div className="a-vid-name">{channel.name}</div>
                <div className="a-vid-chips">
                  {channelNumber !== null ? <span className="a-chip" style={{ background: "var(--surface2)" }}>Nº {channelNumber}</span> : null}
                  {ql ? <span className="a-chip" style={{ background: "var(--accent)", color: "#1a1500" }}>{ql}</span> : null}
                </div>
              </>
            ) : (
              <>
                <div className="a-fs-grad" style={{ opacity: fsOverlay ? 1 : 0, transition: "opacity .25s" }} />
                {zapBuf ? <div className="zap-num mono">{zapBuf}</div> : null}
                <div style={{ opacity: fsOverlay ? 1 : 0, transition: "opacity .25s", pointerEvents: fsOverlay ? "auto" : "none" }}>
                  <div className="a-fs-top">
                    <div className="a-fs-name">{channel.name}</div>
                    <div className="a-fs-meta">
                      {channelNumber !== null ? <span className="a-chip" style={{ background: "var(--surface2)" }}>Nº {channelNumber}</span> : null}
                      {ql ? <span className="a-chip" style={{ background: "var(--accent)", color: "#1a1500" }}>{ql}</span> : null}
                      {res ? <span className="a-chip" style={{ background: "var(--surface2)" }}>{res.w}×{res.h}</span> : null}
                      {bitrate ? <span className="a-chip" style={{ background: "var(--surface2)" }}>{Math.round(bitrate / 1e6)} Mbps</span> : null}
                    </div>
                    {now ? <div className="a-fs-now">AHORA · {now.title}</div> : null}
                  </div>
                  <div className="a-fs-bottom">
                    {now && now.stopMs > now.startMs ? (
                      <div className="a-fs-bar">
                        <span className="a-pbar-track"><i style={{ display: "block", height: "100%", width: `${progPct}%`, background: "var(--accent)", borderRadius: 4 }} /></span>
                        <span className="a-pbar-time">{fmtClock(now.stopMs)}</span>
                      </div>
                    ) : null}
                    <div className="a-fs-ctrls">
                      <FocusableButton focusKey="FS_PAUSE" className="a-fs-btn" onEnterPress={togglePause}><Icon name={paused ? "play_arrow" : "pause"} /> {paused ? "Reproducir" : "Pausa"}</FocusableButton>
                      <FocusableButton focusKey="FS_TRACKS" className="a-fs-btn" onEnterPress={() => { setTracksOpen((v) => !v); poke(); }}><Icon name="tune" /> Pistas</FocusableButton>
                      <FocusableButton className="a-fs-btn" onEnterPress={toggleFav}><Icon name={isFav ? "star" : "star_border"} /> {isFav ? "Quitar" : "Favorito"}</FocusableButton>
                      <FocusableButton className="a-fs-btn" onEnterPress={onCatchup}><Icon name="calendar_month" /> Guía</FocusableButton>
                      <FocusableButton className="a-fs-btn" onEnterPress={onExitFullscreen}><Icon name="arrow_back" /> Volver</FocusableButton>
                    </div>
                  </div>
                  {tracksOpen ? <TrackSheet hls={hls} onClose={() => { setTracksOpen(false); focusWhenReady("FS_TRACKS"); }} /> : null}
                </div>
              </>
            )}
          </div>

          {!fullscreen ? (
            <>
              <div className="a-pmeta">
                {now ? (
                  <>
                    <div className="a-plabel">Ahora</div>
                    <div className="a-ptitle">{now.title}</div>
                    <div className="a-pbar">
                      <span className="a-pbar-track"><i style={{ display: "block", height: "100%", width: `${progPct}%`, background: "var(--accent)", borderRadius: 4 }} /></span>
                      <span className="a-pbar-time">{fmtClock(now.stopMs)}</span>
                    </div>
                    {now.description ? <div className="a-pdesc">{now.description}</div> : null}
                  </>
                ) : <div className="a-pdesc">Sin guía para este canal.</div>}
                {next ? (
                  <div className="a-pnext"><span className="a-pnext-t">{fmtClock(next.startMs)} · DESPUÉS</span><span className="a-pnext-n">{next.title}</span></div>
                ) : null}
              </div>
              <div className="a-ctrls">
                <FocusableButton focusKey="PV_PAUSE" className="a-btn" onEnterPress={togglePause}><Icon name={paused ? "play_arrow" : "pause"} /> {paused ? "Reproducir" : "Pausa"}</FocusableButton>
                <FocusableButton className="a-btn primary" onEnterPress={onEnterFullscreen}><Icon name="fullscreen" /> Pantalla completa</FocusableButton>
                <FocusableButton className="a-btn" onEnterPress={toggleFav}><Icon name={isFav ? "star" : "star_border"} /> {isFav ? "Quitar" : "Favorito"}</FocusableButton>
                <FocusableButton className="a-btn" onEnterPress={onCatchup}><Icon name="calendar_month" /> Guía</FocusableButton>
              </div>
            </>
          ) : null}
        </>
      )}
    </FocusZone>
  );
}


// ===================== GRID (películas / series) =====================
interface GridData { id: string; name: string; posterUrl?: string; year?: string; rating?: string; genre?: string }

const SORT_OPTIONS = [
  { id: "default", label: "Por defecto" },
  { id: "recent", label: "Recientes" },
  { id: "year", label: "Año" },
  { id: "az", label: "A-Z" },
] as const;
const SORT_LABEL: Record<string, string> = { default: "Por defecto", recent: "Recientes", year: "Año", az: "A-Z" };

function GridScreen({
  title, count, categories, category, onCategory, query, onQuery, items, onPick, sortMode, onSortChange,
}: {
  title: string;
  count: number;
  categories: { id: string; name: string }[];
  category: string | null;
  onCategory: (c: string | null) => void;
  query: string;
  onQuery: (q: string) => void;
  items: GridData[];
  onPick: (index: number) => void;
  sortMode: string;
  onSortChange: (m: string) => void;
}) {
  // Menú de orden: lista desplegable (OK abre, ↑↓ elige, OK aplica, Back cierra).
  const [sortOpen, setSortOpen] = useState(false);
  useBack(() => { setSortOpen(false); focusWhenReady("GRD_SORT"); }, sortOpen);
  const openSort = () => {
    setSortOpen(true);
    focusWhenReady(`SORT_${sortMode}`);
  };
  const pickSort = (m: string) => {
    onSortChange(m);
    setSortOpen(false);
    focusWhenReady("GRD_SORT");
  };
  // Filas de a 6 para virtualizar la grilla (solo se montan las visibles).
  const rows = useMemo(() => {
    const r: GridData[][] = [];
    for (let i = 0; i < items.length; i += 6) r.push(items.slice(i, i + 6));
    return r;
  }, [items]);
  return (
    <div className="grd">
      <div className="grd-h">
        <div className="grd-htitle"><span className="grd-title">{title}</span><span className="grd-count">{count.toLocaleString()} títulos</span></div>
        <div className="grd-sortwrap">
          <FocusableButton focusKey="GRD_SORT" className="grd-sort" onEnterPress={openSort}>
            <Icon name="swap_vert" /> {SORT_LABEL[sortMode]}
          </FocusableButton>
          {sortOpen ? (
            <FocusZone zone="grd:sort" className="sort-pop">
              {SORT_OPTIONS.map((o) => (
                <FocusableButton key={o.id} focusKey={`SORT_${o.id}`} className={`sort-item ${sortMode === o.id ? "on" : ""}`} onEnterPress={() => pickSort(o.id)}>
                  <span className="sort-check"><Icon name="check" /></span> {o.label}
                </FocusableButton>
              ))}
            </FocusZone>
          ) : null}
        </div>
        <div className="grd-search">
          <Icon name="search" />
          <FocusableInput focusKey="SEARCH_IN" value={query} onChange={onQuery} placeholder={`Buscar ${title.toLowerCase()}…`} />
        </div>
      </div>
      <div className="grd-chips">
        <FocusableButton focusKey="CAT_0" className={`chip ${category === null ? "on" : ""}`} onEnterPress={() => onCategory(null)}>Todas</FocusableButton>
        {categories.slice(0, 30).map((c) => (
          <FocusableButton key={c.id} className={`chip ${category === c.name ? "on" : ""}`} onEnterPress={() => onCategory(c.name)}>{c.name}</FocusableButton>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="grd-scroll"><div className="grd-empty">Sin resultados{query ? ` para «${query}»` : ""}</div></div>
      ) : (
        <VirtualList
          className="grd-scroll scroll"
          items={rows}
          estRowHeight={470}
          overscan={3}
          getKey={(_r, i) => `row-${i}`}
          renderRow={(row, i) => (
            <div className="grd-row">
              {row.map((it, j) => (
                <FocusableButton key={it.id} className="poster" onEnterPress={() => onPick(i * 6 + j)}>
                  <div className="poster-img">
                    {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="poster-ph">{initials(it.name)}</div>}
                    {it.rating ? <div className="poster-rate"><Icon name="star" size={15} /> {it.rating}</div> : null}
                    <div className="poster-meta">
                      <div className="poster-name">{it.name}</div>
                      {it.year || it.genre ? <div className="poster-year">{[it.year, it.genre].filter(Boolean).join(" · ")}</div> : null}
                    </div>
                  </div>
                </FocusableButton>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}

// ===================== FAVORITOS =====================
const FAV_FILTERS: { id: string; label: string; kind: string | null }[] = [
  { id: "all", label: "Todos", kind: null },
  { id: "live", label: "En vivo", kind: "live" },
  { id: "movie", label: "Películas", kind: "movie" },
  { id: "series", label: "Series", kind: "series-episode" },
];
function favBadge(kind: string) { return kind === "live" ? "live" : kind === "movie" ? "movie" : "series"; }
function favBadgeLabel(kind: string) { return kind === "live" ? "EN VIVO" : kind === "movie" ? "PELÍCULA" : "SERIE"; }

function FavScreen({ favorites, onOpen, onToggle }: {
  favorites: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: string; meta?: string }[];
  onOpen: (f: { id: string; name: string; kind: string }) => void;
  onToggle: (i: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: "live" | "movie" | "series-episode" }) => void;
}) {
  const [filter, setFilter] = useState("all");
  const kind = FAV_FILTERS.find((f) => f.id === filter)?.kind ?? null;
  const shown = kind ? favorites.filter((f) => f.kind === kind) : favorites;
  return (
    <div className="grd">
      <div className="grd-h"><div className="grd-htitle"><span className="grd-title">Favoritos</span><span className="grd-count">{favorites.length} guardados</span></div></div>
      <div className="grd-chips">
        {FAV_FILTERS.map((f, i) => (
          <FocusableButton key={f.id} focusKey={i === 0 ? "CAT_0" : undefined} className={`chip ${filter === f.id ? "on" : ""}`} onEnterPress={() => setFilter(f.id)}>{f.label}</FocusableButton>
        ))}
      </div>
      <div className="fav-list scroll">
        {shown.length === 0 ? <div className="grd-empty">Sin favoritos</div> : shown.map((f) => (
          <FocusableButton key={f.id} className="fav-row" onEnterPress={() => onOpen(f)}>
            <span className={`fav-badge ${favBadge(f.kind)}`}>{favBadgeLabel(f.kind)}</span>
            <span className="fav-thumb">{f.logoUrl ? <img src={f.logoUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }} /> : initials(f.name)}</span>
            <span className="fav-mid"><div className="fav-name">{f.name}</div><div className="fav-meta">{f.meta || favBadgeLabel(f.kind)}</div></span>
            <span className="fav-star" onClick={(e) => { e.stopPropagation(); onToggle({ id: f.id, name: f.name, streamUrl: f.streamUrl, logoUrl: f.logoUrl, kind: f.kind as "live" | "movie" | "series-episode" }); }}><Icon name="star" /></span>
            <Icon name="play_circle" className="fav-go" />
          </FocusableButton>
        ))}
      </div>
    </div>
  );
}
