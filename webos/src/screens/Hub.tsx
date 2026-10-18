import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { PinDialog } from "../components/PinDialog";
import { PosterImg } from "../components/PosterImg";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints, HINTS_NAV } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { restoreFocus, focusWhenReady } from "../navigation/focusMemory";
import { computeBecauseRowCached, computeCatalogRowsCached, type BillItem, type RailItem } from "../data/hubRows";
import type { HistoryItem } from "../store/useAppStore";

type SectionId = "live" | "movies" | "series" | "favorites";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function Hub() {
  const navigate = useNavigate();
  const railNav = useRailNav();
  const source = useAppStore((s) => s.source);
  // Cada sección por separado: el Hub no recalcula sus filas de películas
  // cuando lo único que cambió es el vivo (o al revés).
  const liveChannels = useAppStore((s) => s.catalog.liveChannels);
  // Diferidos: cuando llegan miles de películas o series, el Hub primero se
  // re-renderiza con las filas que ya tenía y recalcula las nuevas en un
  // render de baja prioridad que React interrumpe si apretás una tecla.
  const movies = useDeferredValue(useAppStore((s) => s.catalog.movies));
  const series = useDeferredValue(useAppStore((s) => s.catalog.series));
  const favorites = useAppStore((s) => s.favorites);
  const history = useAppStore((s) => s.history);
  const loading = useAppStore((s) => s.loading);
  // Booleanos y no los objetos: cada paso de carga no re-renderiza el Inicio.
  const busy = useAppStore((s) => s.loading || !!s.loadingStep);
  const error = useAppStore((s) => s.error);
  const moviesLoaded = useAppStore((s) => s.loadedSections.movies);
  const seriesLoaded = useAppStore((s) => s.loadedSections.series);
  // Conteos directos del store (no los diferidos): sin "0 títulos" de un render.
  const movieCount = useAppStore((s) => s.catalog.movies.length);
  const seriesCount = useAppStore((s) => s.catalog.series.length);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const reload = useAppStore((s) => s.reload);
  const setUi = useAppStore((s) => s.setUi);
  const progress = useAppStore((s) => s.progress);

  // Modo Felix (niños)
  const kidsMode = useAppStore((s) => s.kidsMode);
  const setKidsMode = useAppStore((s) => s.setKidsMode);
  const parentalPin = useAppStore((s) => s.parentalPin);
  const kidsPrefs = useAppStore((s) => s.kidsPrefs);
  const kidsTimerEndsAt = useAppStore((s) => s.kidsTimerEndsAt);
  const setKidsTimer = useAppStore((s) => s.setKidsTimer);
  const [pinOpen, setPinOpen] = useState(false);

  // Refrescar "quedan X min" del temporizador cada 30 s.
  const [, timerTick] = useState(0);
  useEffect(() => {
    if (!kidsMode || !kidsTimerEndsAt) return;
    const t = window.setInterval(() => timerTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, [kidsMode, kidsTimerEndsAt]);
  const remainMin = kidsTimerEndsAt ? Math.max(0, Math.ceil((kidsTimerEndsAt - Date.now()) / 60000)) : null;

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HUB" });
  // Enfocar cuando los tiles existen (solo el estado de error sin catálogo los oculta).
  const hubBlocked = !!error && !liveChannels.length;
  useEffect(() => {
    if (!hubBlocked) restoreFocus("hub:tiles", "HUB_T_0");
  }, [hubBlocked, kidsMode]);

  // Conteo de contenido apto (para los tiles del modo Felix).
  const kidsCounts = useMemo(() => {
    if (!kidsMode) return { live: 0, movies: 0, series: 0 };
    const items = new Set(kidsPrefs.items);
    const live = new Set(kidsPrefs.live);
    const mov = new Set(kidsPrefs.movies);
    const ser = new Set(kidsPrefs.series);
    return {
      live: liveChannels.filter((c) => live.has(c.groupTitle ?? "") || items.has(c.id)).length,
      movies: movies.filter((m) => mov.has(m.category ?? "") || items.has(m.id)).length,
      series: series.filter((s) => ser.has(s.category ?? "") || items.has(s.id)).length,
    };
  }, [kidsMode, kidsPrefs, liveChannels, movies, series]);

  const tiles: { id: SectionId; title: string; sub: string; icon: string }[] = kidsMode
    ? [
        { id: "live", title: "Tele", sub: kidsCounts.live ? `${kidsCounts.live} canales` : "Sin canales aptos", icon: "smart_display" },
        { id: "movies", title: "Pelis", sub: moviesLoaded ? `${kidsCounts.movies} pelis` : "Cargar al entrar", icon: "animation" },
        { id: "series", title: "Dibujitos", sub: seriesLoaded ? `${kidsCounts.series} series` : "Cargar al entrar", icon: "smart_toy" },
      ]
    : [
        { id: "live", title: "En vivo", sub: liveChannels.length ? `${liveChannels.length.toLocaleString()} canales` : busy ? "Cargando…" : "—", icon: "live_tv" },
        { id: "movies", title: "Películas", sub: moviesLoaded ? `${movieCount.toLocaleString()} títulos` : "Cargar al entrar", icon: "movie" },
        { id: "series", title: "Series", sub: seriesLoaded ? `${seriesCount.toLocaleString()} títulos` : "Cargar al entrar", icon: "video_library" },
        { id: "favorites", title: "Favoritos", sub: `${favorites.length} guardados`, icon: "star" },
      ];

  // "Seguir viendo" lleva al detalle (película/serie) o al canal, no directo al player.
  const openHistory = useCallback((h: { id: string; name: string; kind: string; route: string }) => {
    if (h.kind === "movie") navigate(`/movie/${h.id}`);
    else if (h.kind === "series-episode") navigate(`/series/${h.id.replace(/^series:/, "")}?name=${encodeURIComponent(h.name)}`);
    else { setUi({ tab: "live", selectedChannelId: h.id }); navigate("/home?tab=live"); }
  }, [navigate, setUi]);

  const onTile = (id: SectionId) => {
    // Navegamos al instante; la sección muestra su propio spinner mientras carga.
    if (id === "movies" && !moviesLoaded) ensureMovies();
    else if (id === "series" && !seriesLoaded) ensureSeries();
    navigate(`/home?tab=${id}`);
  };

  // Filtro para títulos VOD en las filas del Inicio: excluye las categorías
  // que el usuario ocultó (Gestionar categorías) y, en modo Felix, lo no apto.
  const catPrefs = useAppStore((s) => s.catPrefs);
  const vodAllowed = useMemo(() => {
    const items = new Set(kidsPrefs.items);
    const mov = new Set(kidsPrefs.movies);
    const ser = new Set(kidsPrefs.series);
    const hiddenMov = new Set(catPrefs.movies.hidden);
    const hiddenSer = new Set(catPrefs.series.hidden);
    return {
      movie: (m: { id: string; category?: string | null }) =>
        !hiddenMov.has(m.category ?? "") && (!kidsMode || mov.has(m.category ?? "") || items.has(m.id)),
      series: (s: { id: string; category?: string | null }) =>
        !hiddenSer.has(s.category ?? "") && (!kidsMode || ser.has(s.category ?? "") || items.has(s.id)),
    };
  }, [kidsMode, kidsPrefs, catPrefs]);

  // ===== Historial ("Seguir viendo") =====
  // Categoría y alta de cada ítem, resueltas en una sola pasada por el catálogo
  // y solo para los ids del historial (antes: un find() por ítem en cada render).
  const historyMeta = useMemo(() => {
    const wantM = new Set<string>(), wantS = new Set<string>(), wantL = new Set<string>();
    for (const h of history) {
      if (h.kind === "movie") wantM.add(h.id);
      else if (h.kind === "series-episode") wantS.add(h.id.replace(/^series:/, ""));
      else wantL.add(h.id.replace(/^ct:/, ""));
    }
    const category = new Map<string, string | undefined>();
    const seriesAddedAt = new Map<string, number>();
    if (wantM.size) for (const m of movies) if (wantM.has(m.id)) category.set(`movie:${m.id}`, m.category);
    if (wantS.size) for (const x of series) {
      if (!wantS.has(x.id)) continue;
      category.set(`series:${x.id}`, x.category);
      if (x.addedAt) seriesAddedAt.set(x.id, x.addedAt);
    }
    if (wantL.size) for (const c of liveChannels) if (wantL.has(c.id)) category.set(`live:${c.id}`, c.groupTitle);
    return { category, seriesAddedAt };
  }, [history, movies, series, liveChannels]);

  const shownHistory = useMemo(() => {
    const hiddenMov = new Set(catPrefs.movies.hidden);
    const hiddenSer = new Set(catPrefs.series.hidden);
    const hiddenLive = new Set(catPrefs.live.hidden);
    const items = new Set(kidsPrefs.items);
    const kLive = new Set(kidsPrefs.live), kMov = new Set(kidsPrefs.movies), kSer = new Set(kidsPrefs.series);
    const out: typeof history = [];
    for (const h of history) {
      const sid = h.id.replace(/^series:/, "");
      const lid = h.id.replace(/^ct:/, "");
      const key = h.kind === "movie" ? `movie:${h.id}` : h.kind === "series-episode" ? `series:${sid}` : `live:${lid}`;
      // Manda la categoría real del catálogo; la guardada en el historial es
      // el respaldo mientras esa sección todavía no cargó.
      const cat = historyMeta.category.get(key) ?? h.category;
      const hidden = h.kind === "movie" ? hiddenMov : h.kind === "series-episode" ? hiddenSer : hiddenLive;
      if (cat !== undefined && hidden.has(cat)) continue; // categoría oculta por el usuario
      // Ítem viejo sin categoría y la sección todavía sin cargar: si hay
      // categorías ocultas no se puede saber si es de una de ellas, así que
      // se espera a verificarlo antes de mostrarlo.
      const sectionLoaded = h.kind === "movie" ? moviesLoaded : h.kind === "series-episode" ? seriesLoaded : liveChannels.length > 0;
      if (cat === undefined && hidden.size > 0 && !sectionLoaded) continue;
      if (kidsMode) {
        const kids = h.kind === "movie" ? kMov : h.kind === "series-episode" ? kSer : kLive;
        const ok = items.has(h.id) || items.has(sid) || (cat !== undefined && kids.has(cat));
        if (!ok) continue;
      }
      out.push(h);
      if (out.length >= 8) break;
    }
    return out;
  }, [history, historyMeta, catPrefs, kidsMode, kidsPrefs, moviesLoaded, seriesLoaded, liveChannels.length]);

  // ===== Filas estilo Netflix (una pasada por el catálogo; ver data/hubRows) =====
  const seenIds = useMemo(
    () => new Set(history.map((h) => (h.kind === "series-episode" ? h.id.replace(/^series:/, "") : h.id))),
    [history],
  );
  // La semilla de "Porque viste" sale del historial YA filtrado: nada de una
  // categoría oculta (o no apta en modo Felix) puede asomar en el Inicio.
  const seed = useMemo(() => shownHistory.find((h) => h.kind === "movie" || h.kind === "series-episode"), [shownHistory]);
  const becauseRow = useMemo(
    () => computeBecauseRowCached(seed, movies, series, vodAllowed.movie, vodAllowed.series, seenIds),
    [seed, movies, series, vodAllowed, seenIds],
  );
  const becauseGenre = becauseRow?.genre ?? "";
  const { newest, bill: billItems, genreRows } = useMemo(
    () => computeCatalogRowsCached(movies, series, vodAllowed.movie, vodAllowed.series, becauseGenre),
    [movies, series, vodAllowed, becauseGenre],
  );


  const openNew = useCallback((n: { id: string; name: string; kind: "movie" | "series" }) => {
    if (n.kind === "movie") navigate(`/movie/${n.id}`);
    else navigate(`/series/${n.id}?name=${encodeURIComponent(n.name)}`);
  }, [navigate]);

  const enterKids = () => { setKidsMode(true); focusWhenReady("HUB_T_0"); };
  const exitKids = () => {
    if (parentalPin) setPinOpen(true);
    else { setKidsMode(false); focusWhenReady("HUB_T_0"); }
  };


  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title={kidsMode ? "Modo Felix" : "Inicio"} />
        <div className="a-body">
          <Rail active="hub" onSelect={railNav} reloading={loading} />
          <div className="a-screen">
            {error && !liveChannels.length ? (
              <div className="ld">
                <Icon name="wifi_off" className="eo-ic" />
                <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                <div style={{ display: "flex", gap: 14 }}>
                  <FocusableButton className="btn primary" onEnterPress={reload}>Reintentar</FocusableButton>
                  <FocusableButton className="btn" onEnterPress={() => navigate("/setup")}>Editar lista</FocusableButton>
                </div>
              </div>
            ) : (
              <div className="hub">
                <div className="hub-hero">
                  <div>
                    <div className="hub-greet">{kidsMode ? "¡Hola, Felix! 🦖" : greeting()}</div>
                    <div className="hub-title">{kidsMode ? <>¿Qué vamos a <span>ver</span>?</> : <>¿Qué querés <span>ver</span> hoy?</>}</div>
                  </div>
                </div>
                <HubBillboard items={billItems} onOpen={openNew} />
                <FocusZone zone="hub:tiles" preferred="HUB_T_0" className="hub-grid">
                  {tiles.map((t, i) => (
                    <FocusableButton key={t.id} focusKey={`HUB_T_${i}`} className="hub-tile" onEnterPress={() => onTile(t.id)}>
                      <div className="hub-tile-ic"><Icon name={t.icon} /></div>
                      <div className="hub-tile-b">
                        <div className="hub-tile-t">{t.title}</div>
                        <div className="hub-tile-s">{t.sub}</div>
                      </div>
                    </FocusableButton>
                  ))}
                  {kidsMode ? (
                    <FocusableButton focusKey={`HUB_T_${tiles.length}`} className="hub-tile hub-exit" onEnterPress={exitKids}>
                      <div className="hub-tile-ic"><Icon name="lock" /></div>
                      <div className="hub-tile-b">
                        <div className="hub-tile-t">Grandes</div>
                        <div className="hub-tile-s">{parentalPin ? "Salir con PIN" : "Salir del modo Felix"}</div>
                      </div>
                    </FocusableButton>
                  ) : (
                    <FocusableButton focusKey={`HUB_T_${tiles.length}`} className="hub-tile hub-felix" onEnterPress={enterKids}>
                      <div className="hub-tile-ic"><Icon name="child_care" /></div>
                      <div className="hub-tile-b">
                        <div className="hub-tile-t">Felix</div>
                        <div className="hub-tile-s">Modo niños</div>
                      </div>
                    </FocusableButton>
                  )}
                </FocusZone>
                {kidsMode ? (
                  <div className="hub-cont">
                    <div className="hub-cont-h">Temporizador</div>
                    <FocusZone zone="hub:timer" className="gsr-kinds hub-timer">
                      {[{ m: 30, l: "30 min" }, { m: 60, l: "1 hora" }, { m: 90, l: "1 hora y media" }].map(({ m, l }) => (
                        <FocusableButton key={m} className="chip" onEnterPress={() => setKidsTimer(m)}>{l}</FocusableButton>
                      ))}
                      <FocusableButton className={`chip ${!kidsTimerEndsAt ? "on" : ""}`} onEnterPress={() => setKidsTimer(null)}>Sin límite</FocusableButton>
                      {remainMin !== null ? (
                        <span className="hub-timer-left"><Icon name="schedule" /> quedan {remainMin} min</span>
                      ) : null}
                    </FocusZone>
                  </div>
                ) : null}
                {newest.length ? (
                  <HubRail title="Novedades" zone="hub:new" keyPrefix="HUB_N" items={newest} onOpen={openNew} withNewTag />
                ) : null}
                {shownHistory.length ? (
                  <HubHistory items={shownHistory} progress={progress} seriesAddedAt={historyMeta.seriesAddedAt} onOpen={openHistory} />
                ) : null}
                {[becauseRow, ...genreRows].filter((r): r is { title: string; items: RailItem[] } => !!r).map((row, ri) => (
                  <HubRail key={row.title} title={row.title} zone={`hub:rail${ri}`} keyPrefix={`HUB_R${ri}`} items={row.items} onOpen={openNew} />
                ))}
              </div>
            )}
          </div>
        </div>
        {pinOpen ? (
          <PinDialog
            mode="verify"
            expected={parentalPin}
            title="Modo grandes"
            onSuccess={() => { setPinOpen(false); setKidsMode(false); focusWhenReady("HUB_T_0"); }}
            onClose={() => setPinOpen(false)}
          />
        ) : null}
        <Hints items={HINTS_NAV} />
      </div>
    </FocusContext.Provider>
  );
}

// ===== Piezas del Inicio, memorizadas =====
// Cada una se re-renderiza solo si cambian sus datos: la rotación del
// billboard, el reloj o un paso de carga ya no re-dibujan todas las filas.

function newTag(at: number): string {
  const d = Math.floor((Date.now() / 1000 - at) / 86400);
  return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : `Hace ${d} días`;
}

/** Novedad destacada rotativa con sinopsis. Rota sola, sin tocar el resto. */
const HubBillboard = memo(function HubBillboard({ items, onOpen }: {
  items: BillItem[];
  onOpen: (n: BillItem) => void;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = window.setInterval(() => setIdx((i) => i + 1), 10000);
    return () => window.clearInterval(t);
  }, [items.length]);
  const bill = items.length ? items[idx % items.length] : null;
  if (!bill) return null;
  return (
    <FocusableButton focusKey="HUB_BILL" className="hub-bill" onEnterPress={() => onOpen(bill)}>
      {bill.posterUrl ? <PosterImg className="hub-bill-img" src={bill.posterUrl} /> : null}
      <div className="hub-bill-grad" />
      <div className="hub-bill-c">
        <div className="hub-bill-tag">NOVEDAD · {bill.kind === "movie" ? "PELÍCULA" : "SERIE"}</div>
        <div className="hub-bill-t">{bill.name}</div>
        {bill.year || bill.genre ? <div className="hub-bill-m">{[bill.year, bill.genre].filter(Boolean).join(" · ")}</div> : null}
        {bill.plot ? <div className="hub-bill-p">{bill.plot}</div> : null}
        <div className="hub-bill-hint"><Icon name="play_circle" /> OK para ver la ficha</div>
      </div>
      {items.length > 1 ? (
        <div className="hub-bill-dots">
          {items.map((_, i) => <span key={i} className={i === idx % items.length ? "on" : ""} />)}
        </div>
      ) : null}
    </FocusableButton>
  );
});

const POSTER_FILL = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } as const;

/** Fila horizontal de pósters (Novedades, "Porque viste…", géneros). */
const HubRail = memo(function HubRail({ title, zone, keyPrefix, items, onOpen, withNewTag }: {
  title: string;
  zone: string;
  keyPrefix: string;
  items: RailItem[];
  onOpen: (n: RailItem) => void;
  withNewTag?: boolean;
}) {
  return (
    <div className="hub-cont">
      <div className="hub-cont-h">{title}</div>
      <FocusZone zone={zone} className="hub-rowscroll scroll">
        {items.map((n, i) => (
          <FocusableButton key={`${n.kind}-${n.id}`} focusKey={`${keyPrefix}_${i}`} className="hub-mini" onEnterPress={() => onOpen(n)}>
            <div className="hub-mini-p">
              {n.posterUrl ? <PosterImg src={n.posterUrl} style={POSTER_FILL} /> : null}
              {withNewTag ? <span className="hub-mini-tag">{newTag(n.at)}</span> : null}
            </div>
            <div className="hub-mini-t">{n.name}</div>
          </FocusableButton>
        ))}
      </FocusZone>
    </div>
  );
});

/** "Seguir viendo": con barra de progreso y aviso de episodio nuevo. */
const HubHistory = memo(function HubHistory({ items, progress, seriesAddedAt, onOpen }: {
  items: HistoryItem[];
  progress: Record<string, { pos: number; dur: number }>;
  seriesAddedAt: Map<string, number>;
  onOpen: (h: HistoryItem) => void;
}) {
  return (
    <div className="hub-cont">
      <div className="hub-cont-h">Seguir viendo</div>
      <FocusZone zone="hub:cont" className="hub-rowscroll scroll">
        {items.map((h, i) => {
          // Barra de progreso (posición guardada del contenido/episodio).
          const pr = progress[h.cid ?? h.id];
          const pct = pr && pr.dur > 0 ? Math.max(2, Math.min(100, (pr.pos / pr.dur) * 100)) : null;
          // Serie con episodios nuevos desde la última vez que la viste.
          const addedAt = h.kind === "series-episode" ? seriesAddedAt.get(h.id.replace(/^series:/, "")) : undefined;
          const hasNew = !!(addedAt && addedAt * 1000 > h.at);
          return (
            <FocusableButton key={h.id} focusKey={`HUB_C_${i}`} className="hub-mini" onEnterPress={() => onOpen(h)}>
              <div className="hub-mini-p">
                {h.posterUrl ? <PosterImg src={h.posterUrl} style={POSTER_FILL} /> : null}
                {hasNew ? <span className="hub-mini-tag new">NUEVO EPISODIO</span> : h.sub ? <span className="hub-mini-tag">{h.sub}</span> : null}
                {pct !== null ? <span className="hub-mini-bar"><i style={{ width: `${pct}%` }} /></span> : null}
              </div>
              <div className="hub-mini-t">{h.name}</div>
            </FocusableButton>
          );
        })}
      </FocusZone>
    </div>
  );
});
