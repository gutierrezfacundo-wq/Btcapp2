import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import type Hls from "hls.js";
import { useAppStore } from "../store/useAppStore";
import { findNextProgram, findNowPlaying } from "../data/xmltv";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { Icon } from "../components/Icon";
import { Rail, type RailId } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { VideoPreview } from "../components/VideoPreview";
import { TrackMenu } from "../components/TrackMenu";
import { isBackKey } from "../webos/remote-keys";

type Tab = "live" | "movies" | "series" | "favorites";
const RENDER_CAP = 500;

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
  const isFavorite = useAppStore((s) => s.isFavorite);
  const epgByChannel = useAppStore((s) => s.epgByChannel);
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

  useEffect(() => {
    if (tab === "movies" && !loadedSections.movies) ensureMovies();
    if (tab === "series" && !loadedSections.series) ensureSeries();
  }, [tab, loadedSections, ensureMovies, ensureSeries]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HOME" });
  const restored = useRef(false);
  useEffect(() => {
    if (tab === "live" && ui.selectedChannelId && !restored.current) return;
    setFocus("CAT_0");
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const railSelect = (id: RailId) => {
    if (id === "hub") navigate("/hub");
    else if (id === "settings") navigate("/setup");
    else if (id === "reload") reload();
    else if (id === "search") { setSearchOpen((v) => !v); window.setTimeout(() => setFocus("SEARCH_IN"), 60); }
    else { setTab(id as Tab); setCategory(null); setQuery(""); }
  };

  // ===== Datos =====
  const channelNumbers = useMemo(() => {
    const m = new Map<string, number>();
    catalog.liveChannels.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [catalog.liveChannels]);

  const categories = tab === "live" ? catalog.liveCategories
    : tab === "movies" ? catalog.movieCategories
    : tab === "series" ? catalog.seriesCategories : [];

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    const inc = (k?: string) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
    if (tab === "live") catalog.liveChannels.forEach((c) => inc(c.groupTitle));
    else if (tab === "movies") catalog.movies.forEach((x) => inc(x.category ?? undefined));
    else if (tab === "series") catalog.series.forEach((x) => inc(x.category ?? undefined));
    return m;
  }, [tab, catalog]);

  const q = query.trim().toLowerCase();
  const liveFiltered = useMemo(() => {
    if (tab !== "live") return [];
    const byCat = category ? catalog.liveChannels.filter((c) => c.groupTitle === category) : catalog.liveChannels;
    return q ? byCat.filter((c) => c.name.toLowerCase().includes(q)) : byCat;
  }, [tab, catalog.liveChannels, category, q]);
  const moviesFiltered = useMemo(() => {
    if (tab !== "movies") return [];
    const byCat = category ? catalog.movies.filter((m) => m.category === category) : catalog.movies;
    return q ? byCat.filter((m) => m.name.toLowerCase().includes(q)) : byCat;
  }, [tab, catalog.movies, category, q]);
  const seriesFiltered = useMemo(() => {
    if (tab !== "series") return [];
    const byCat = category ? catalog.series.filter((s) => s.category === category) : catalog.series;
    return q ? byCat.filter((s) => s.name.toLowerCase().includes(q)) : byCat;
  }, [tab, catalog.series, category, q]);

  useEffect(() => {
    if (restored.current || tab !== "live" || !selectedChannelId) { restored.current = true; return; }
    const idx = liveFiltered.findIndex((c) => c.id === selectedChannelId);
    restored.current = true;
    if (idx >= 0 && idx < RENDER_CAP) window.setTimeout(() => setFocus(`CH_${selectedChannelId}`), 60);
  }, [tab, selectedChannelId, liveFiltered]);

  const pushHistory = useAppStore((s) => s.pushHistory);
  const play = (url: string, title: string, hist?: { id: string; posterUrl?: string; sub?: string; kind: "live" | "movie" | "series-episode" }) => {
    const route = `/player?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}${hist?.sub ? `&meta=${encodeURIComponent(hist.sub)}` : ""}`;
    if (hist) pushHistory({ id: hist.id, name: title, route, posterUrl: hist.posterUrl, sub: hist.sub, kind: hist.kind });
    navigate(route);
  };
  const openSeries = (id: string, name: string, posterUrl?: string) => {
    const route = `/series/${id}?name=${encodeURIComponent(name)}`;
    pushHistory({ id: `series:${id}`, name, route, posterUrl, kind: "series-episode" });
    navigate(route);
  };

  const selectedChannel = selectedChannelId
    ? catalog.liveChannels.find((c) => c.id === selectedChannelId) ?? null : null;

  const title = tab === "live" ? "En vivo" : tab === "movies" ? "Películas" : tab === "series" ? "Series" : "Favoritos";

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar
          title={title}
          center={tab === "live" && category ? <div className="a-catnow">{category}</div> : undefined}
        />
        <div className="a-body">
          <Rail active={tab} onSelect={railSelect} reloading={loading} />
          <div className={`a-screen ${tab === "live" && !loading && !error ? "live-row" : ""}`}>
            {loading && !catalog.liveChannels.length ? (
              <div className="ld">
                <div className="ld-spin spinner" />
                <div className="ld-step">{loadingStep ?? "Cargando…"}</div>
                {loadingProgress ? <div className="ld-count">{loadingProgress.current} / {loadingProgress.total}</div> : null}
              </div>
            ) : error && !catalog.liveChannels.length ? (
              <div className="ld">
                <Icon name="wifi_off" className="eo-ic" />
                <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                <FocusableButton className="btn primary" onEnterPress={reload}>Reintentar</FocusableButton>
              </div>
            ) : tab === "live" ? (
              <>
                <div className="a-cats">
                  <div className="a-cats-h"><span className="a-cats-t">Categorías</span><span className="a-cats-c">{categories.length}</span></div>
                  {searchOpen ? (
                    <div className="a-search">
                      <Icon name="search" />
                      <FocusableInput focusKey="SEARCH_IN" value={query} onChange={setQuery} placeholder="Buscar canal…" />
                    </div>
                  ) : null}
                  <div className="a-cats-list scroll">
                    <FocusableButton focusKey="CAT_0" className={`a-cat ${category === null ? "sel" : ""}`} onEnterPress={() => setCategory(null)}>
                      <span className="a-cat-n">Todas</span><span className="a-cat-t">{catalog.liveChannels.length}</span>
                    </FocusableButton>
                    {categories.map((c) => (
                      <FocusableButton key={c.id} className={`a-cat ${category === c.name ? "sel" : ""}`} onEnterPress={() => setCategory(c.name)}>
                        <span className="a-cat-n">{c.name}</span><span className="a-cat-t">{counts.get(c.name) ?? 0}</span>
                      </FocusableButton>
                    ))}
                  </div>
                </div>

                <div className="a-list">
                  <div className="a-list-h">Canales · {category ?? "Todas"} · {liveFiltered.length}</div>
                  <div className="a-list-vp scroll">
                    {liveFiltered.slice(0, RENDER_CAP).map((c) => {
                      const now = findNowPlaying(epgByChannel, c.tvgId);
                      const ql = quality(c.name);
                      const sel = c.id === selectedChannelId;
                      return (
                        <FocusableButton
                          key={c.id} focusKey={`CH_${c.id}`}
                          className={`a-ch ${sel ? "playing" : ""}`}
                          onEnterPress={() => { if (sel) setFullscreen(true); else setSelectedChannelId(c.id); }}
                        >
                          <span className="a-ch-num">{channelNumbers.get(c.id) ?? "—"}</span>
                          <span className="a-ch-logo">{c.logoUrl ? <img src={c.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 11 }} /> : initials(c.name)}</span>
                          <span className="a-ch-info">
                            <div className="a-ch-name">{c.name}</div>
                            {now ? <div className="a-ch-now">{now.title}</div> : null}
                            {now && now.stopMs > now.startMs ? (
                              <div className="a-ch-prog"><i style={{ width: `${Math.max(0, Math.min(100, ((Date.now() - now.startMs) / (now.stopMs - now.startMs)) * 100))}%` }} /></div>
                            ) : null}
                          </span>
                          {ql ? <span className="a-ch-q">{ql}</span> : null}
                          {isFavorite(c.id) ? <span className="a-ch-fav" onClick={(e) => { e.stopPropagation(); toggleFavorite({ id: c.id, name: c.name, streamUrl: c.streamUrl, logoUrl: c.logoUrl, kind: c.kind }); }}><Icon name="star" /></span> : null}
                        </FocusableButton>
                      );
                    })}
                    {liveFiltered.length > RENDER_CAP ? (
                      <div className="grd-empty" style={{ padding: 20 }}>Mostrando {RENDER_CAP} de {liveFiltered.length}. Elegí categoría o buscá.</div>
                    ) : null}
                  </div>
                </div>

                <PreviewPanel
                  channel={selectedChannel}
                  channelNumber={selectedChannelId ? channelNumbers.get(selectedChannelId) ?? null : null}
                  epgByChannel={epgByChannel}
                  fullscreen={fullscreen}
                  onEnterFullscreen={() => setFullscreen(true)}
                  onExitFullscreen={() => setFullscreen(false)}
                />
              </>
            ) : tab === "favorites" ? (
              <FavScreen favorites={favorites} onPlay={(url, title, h) => play(url, title, h)} onToggle={toggleFavorite} />
            ) : (
              <GridScreen
                title={title}
                count={tab === "movies" ? moviesFiltered.length : seriesFiltered.length}
                categories={categories}
                category={category}
                onCategory={setCategory}
                query={query}
                onQuery={setQuery}
                items={
                  tab === "movies"
                    ? moviesFiltered.slice(0, RENDER_CAP).map((m) => ({
                        id: m.id, name: m.name, posterUrl: m.posterUrl, year: m.year, rating: m.rating,
                        onSelect: () => play(m.streamUrl, m.name, { id: m.id, posterUrl: m.posterUrl, sub: [m.year, m.category].filter(Boolean).join(" · ") || undefined, kind: "movie" }),
                      }))
                    : seriesFiltered.slice(0, RENDER_CAP).map((s) => ({
                        id: s.id, name: s.name, posterUrl: s.posterUrl,
                        onSelect: () => openSeries(s.id, s.name, s.posterUrl),
                      }))
                }
                total={tab === "movies" ? moviesFiltered.length : seriesFiltered.length}
              />
            )}
          </div>
        </div>
        <Hints items={tab === "live"
          ? [{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Ver / Pantalla completa" }, { k: "F", label: "Favorito" }, { k: "Esc", label: "Volver" }]
          : [{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Seleccionar" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}

// ===================== PREVIEW + FULLSCREEN + TRACKS =====================
interface PreviewChannel { id: string; name: string; streamUrl: string; logoUrl?: string; tvgId?: string }

function PreviewPanel({
  channel, channelNumber, epgByChannel, fullscreen, onEnterFullscreen, onExitFullscreen,
}: {
  channel: PreviewChannel | null;
  channelNumber: number | null;
  epgByChannel: Map<string, ReturnType<typeof findNowPlaying>[]> | unknown;
  fullscreen: boolean;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
}) {
  const now = channel ? findNowPlaying(epgByChannel as never, channel.tvgId) : null;
  const next = channel ? findNextProgram(epgByChannel as never, channel.tvgId) : null;
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

  useEffect(() => { setPaused(false); setTracksOpen(false); setBitrate(0); setRes(null); }, [channel?.id]);
  const togglePause = () => { const v = videoElRef.current; if (!v) return; if (v.paused) { v.play().catch(() => undefined); setPaused(false); } else { v.pause(); setPaused(true); } };
  const poke = () => { setFsOverlay(true); if (fsTimer.current) window.clearTimeout(fsTimer.current); fsTimer.current = window.setTimeout(() => { if (!tracksRef.current) setFsOverlay(false); }, 5000); };

  useEffect(() => {
    if (!fullscreen) { if (prevFs.current) setFocus(channel ? `CH_${channel.id}` : "PV_PAUSE"); prevFs.current = false; return; }
    prevFs.current = true; poke(); setFocus("FS_PAUSE");
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e)) { e.preventDefault(); e.stopPropagation(); if (tracksRef.current) { setTracksOpen(false); setFocus("FS_TRACKS"); } else onExitFullscreen(); return; }
      if (!tracksRef.current && (e.key === "ArrowUp" || e.key === "ArrowDown")) e.stopPropagation();
      poke();
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); if (fsTimer.current) window.clearTimeout(fsTimer.current); };
  }, [fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const progPct = now && now.stopMs > now.startMs ? Math.max(0, Math.min(100, ((Date.now() - now.startMs) / (now.stopMs - now.startMs)) * 100)) : 0;

  return (
    <aside className="a-prev">
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
                <div className="a-vid-top">
                  <span className="a-vid-live"><span className="a-livedot" /> EN VIVO</span>
                  {res || bitrate ? (
                    <span className="a-vid-feed">
                      {res ? `${res.h}p` : ""}{res && bitrate ? " · " : ""}{bitrate ? `${Math.round(bitrate / 1e6)} Mbps` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="a-vid-name">{channel.name}</div>
                <div className="a-vid-chips">
                  {channelNumber !== null ? <span className="a-chip" style={{ background: "var(--surface2)" }}>Nº {channelNumber}</span> : null}
                  {ql ? <span className="a-chip" style={{ background: "var(--accent)", color: "#1a1500" }}>{ql}</span> : null}
                </div>
              </>
            ) : (
              <>
                <div className="a-fs-grad" style={{ opacity: fsOverlay ? 1 : 0, transition: "opacity .25s" }} />
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
                      <FocusableButton focusKey="FS_TRACKS" className="a-fs-btn" onEnterPress={() => { setTracksOpen((v) => !v); poke(); window.setTimeout(() => setFocus("TRK_FIRST"), 60); }}><Icon name="tune" /> Pistas</FocusableButton>
                      <FocusableButton className="a-fs-btn" onEnterPress={onExitFullscreen}><Icon name="arrow_back" /> Volver</FocusableButton>
                    </div>
                  </div>
                  {tracksOpen ? <TrackMenu hls={hls} onClose={() => { setTracksOpen(false); setFocus("FS_TRACKS"); }} /> : null}
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
              </div>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}


// ===================== GRID (películas / series) =====================
function GridScreen({
  title, count, categories, category, onCategory, query, onQuery, items, total,
}: {
  title: string;
  count: number;
  categories: { id: string; name: string }[];
  category: string | null;
  onCategory: (c: string | null) => void;
  query: string;
  onQuery: (q: string) => void;
  items: { id: string; name: string; posterUrl?: string; year?: string; rating?: string; onSelect: () => void }[];
  total: number;
}) {
  return (
    <div className="grd">
      <div className="grd-h">
        <div className="grd-htitle"><span className="grd-title">{title}</span><span className="grd-count">{count.toLocaleString()} títulos</span></div>
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
      <div className="grd-scroll scroll">
        {items.length === 0 ? (
          <div className="grd-empty">Sin resultados{query ? ` para «${query}»` : ""}</div>
        ) : (
          <div className="grd-grid">
            {items.map((it) => (
              <FocusableButton key={it.id} className="poster" onEnterPress={it.onSelect}>
                <div className="poster-img">
                  {it.posterUrl ? <img src={it.posterUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="poster-ph">{initials(it.name)}</div>}
                  {it.rating ? <div className="poster-rate"><Icon name="star" size={15} /> {it.rating}</div> : null}
                  <div className="poster-meta">
                    <div className="poster-name">{it.name}</div>
                    {it.year ? <div className="poster-year">{it.year}</div> : null}
                  </div>
                </div>
              </FocusableButton>
            ))}
          </div>
        )}
        {total > items.length ? <div className="grd-empty" style={{ paddingTop: 24 }}>Mostrando {items.length} de {total}. Filtrá por categoría o buscá.</div> : null}
      </div>
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

function FavScreen({ favorites, onPlay, onToggle }: {
  favorites: { id: string; name: string; streamUrl: string; logoUrl?: string; kind: string }[];
  onPlay: (url: string, title: string, h?: { id: string; posterUrl?: string; sub?: string; kind: "live" | "movie" | "series-episode" }) => void;
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
          <FocusableButton key={f.id} className="fav-row" onEnterPress={() => onPlay(f.streamUrl, f.name, { id: f.id, posterUrl: f.logoUrl, sub: favBadgeLabel(f.kind), kind: f.kind as "live" | "movie" | "series-episode" })}>
            <span className={`fav-badge ${favBadge(f.kind)}`}>{favBadgeLabel(f.kind)}</span>
            <span className="fav-thumb">{f.logoUrl ? <img src={f.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }} /> : initials(f.name)}</span>
            <span className="fav-mid"><div className="fav-name">{f.name}</div><div className="fav-meta">{favBadgeLabel(f.kind)}</div></span>
            <span className="fav-star" onClick={(e) => { e.stopPropagation(); onToggle({ id: f.id, name: f.name, streamUrl: f.streamUrl, logoUrl: f.logoUrl, kind: f.kind as "live" | "movie" | "series-episode" }); }}><Icon name="star" /></span>
            <Icon name="play_circle" className="fav-go" />
          </FocusableButton>
        ))}
      </div>
    </div>
  );
}
