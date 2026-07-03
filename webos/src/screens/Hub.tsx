import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { PinDialog } from "../components/PinDialog";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints, HINTS_NAV } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { restoreFocus, focusWhenReady } from "../navigation/focusMemory";

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
  const catalog = useAppStore((s) => s.catalog);
  const favorites = useAppStore((s) => s.favorites);
  const history = useAppStore((s) => s.history);
  const loading = useAppStore((s) => s.loading);
  const loadingStep = useAppStore((s) => s.loadingStep);
  const error = useAppStore((s) => s.error);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const reload = useAppStore((s) => s.reload);
  const setUi = useAppStore((s) => s.setUi);

  // Modo Félix (niños)
  const kidsMode = useAppStore((s) => s.kidsMode);
  const setKidsMode = useAppStore((s) => s.setKidsMode);
  const parentalPin = useAppStore((s) => s.parentalPin);
  const kidsPrefs = useAppStore((s) => s.kidsPrefs);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HUB" });
  // Enfocar cuando los tiles existen (solo el estado de error sin catálogo los oculta).
  const hubBlocked = !!error && !catalog.liveChannels.length;
  useEffect(() => {
    if (!hubBlocked) restoreFocus("hub:tiles", "HUB_T_0");
  }, [hubBlocked, kidsMode]);

  // ¿Un ítem del historial es apto para el modo Félix?
  const kidsAllowedHistory = useMemo(() => {
    const items = new Set(kidsPrefs.items);
    const live = new Set(kidsPrefs.live);
    const mov = new Set(kidsPrefs.movies);
    const ser = new Set(kidsPrefs.series);
    return (h: { id: string; kind: string }): boolean => {
      if (h.kind === "movie") {
        if (items.has(h.id)) return true;
        const m = catalog.movies.find((x) => x.id === h.id);
        return !!m && mov.has(m.category ?? "");
      }
      if (h.kind === "series-episode") {
        const sid = h.id.replace(/^series:/, "");
        if (items.has(sid) || items.has(h.id)) return true;
        const s = catalog.series.find((x) => x.id === sid);
        return !!s && ser.has(s.category ?? "");
      }
      if (items.has(h.id)) return true;
      const c = catalog.liveChannels.find((x) => x.id === h.id);
      return !!c && live.has(c.groupTitle ?? "");
    };
  }, [kidsPrefs, catalog]);

  // Conteo de contenido apto (para los tiles del modo Félix).
  const kidsCounts = useMemo(() => {
    if (!kidsMode) return { live: 0, movies: 0, series: 0 };
    const items = new Set(kidsPrefs.items);
    const live = new Set(kidsPrefs.live);
    const mov = new Set(kidsPrefs.movies);
    const ser = new Set(kidsPrefs.series);
    return {
      live: catalog.liveChannels.filter((c) => live.has(c.groupTitle ?? "") || items.has(c.id)).length,
      movies: catalog.movies.filter((m) => mov.has(m.category ?? "") || items.has(m.id)).length,
      series: catalog.series.filter((s) => ser.has(s.category ?? "") || items.has(s.id)).length,
    };
  }, [kidsMode, kidsPrefs, catalog]);

  const tiles: { id: SectionId; title: string; sub: string; icon: string }[] = kidsMode
    ? [
        { id: "live", title: "Tele", sub: kidsCounts.live ? `${kidsCounts.live} canales` : "Sin canales aptos", icon: "smart_display" },
        { id: "movies", title: "Pelis", sub: loadedSections.movies ? `${kidsCounts.movies} pelis` : "Cargar al entrar", icon: "animation" },
        { id: "series", title: "Dibujitos", sub: loadedSections.series ? `${kidsCounts.series} series` : "Cargar al entrar", icon: "smart_toy" },
      ]
    : [
        { id: "live", title: "En vivo", sub: catalog.liveChannels.length ? `${catalog.liveChannels.length.toLocaleString()} canales` : loading || loadingStep ? "Cargando…" : "—", icon: "live_tv" },
        { id: "movies", title: "Películas", sub: loadedSections.movies ? `${catalog.movies.length.toLocaleString()} títulos` : "Cargar al entrar", icon: "movie" },
        { id: "series", title: "Series", sub: loadedSections.series ? `${catalog.series.length.toLocaleString()} títulos` : "Cargar al entrar", icon: "video_library" },
        { id: "favorites", title: "Favoritos", sub: `${favorites.length} guardados`, icon: "star" },
      ];

  // "Seguir viendo" lleva al detalle (película/serie) o al canal, no directo al player.
  const openHistory = (h: { id: string; name: string; kind: string; route: string }) => {
    if (h.kind === "movie") navigate(`/movie/${h.id}`);
    else if (h.kind === "series-episode") navigate(`/series/${h.id.replace(/^series:/, "")}?name=${encodeURIComponent(h.name)}`);
    else { setUi({ tab: "live", selectedChannelId: h.id }); navigate("/home?tab=live"); }
  };

  const onTile = (id: SectionId) => {
    // Navegamos al instante; la sección muestra su propio spinner mientras carga.
    if (id === "movies" && !loadedSections.movies) ensureMovies();
    else if (id === "series" && !loadedSections.series) ensureSeries();
    navigate(`/home?tab=${id}`);
  };

  const enterKids = () => { setKidsMode(true); focusWhenReady("HUB_T_0"); };
  const exitKids = () => {
    if (parentalPin) setPinOpen(true);
    else { setKidsMode(false); focusWhenReady("HUB_T_0"); }
  };

  const shownHistory = (kidsMode ? history.filter(kidsAllowedHistory) : history).slice(0, 8);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title={kidsMode ? "Modo Félix" : "Inicio"} />
        <div className="a-body">
          <Rail active="hub" onSelect={railNav} reloading={loading} />
          <div className="a-screen">
            {error && !catalog.liveChannels.length ? (
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
                    <div className="hub-greet">{kidsMode ? "¡Hola, Félix! 🦖" : greeting()}</div>
                    <div className="hub-title">{kidsMode ? <>¿Qué vamos a <span>ver</span>?</> : <>¿Qué querés <span>ver</span> hoy?</>}</div>
                  </div>
                </div>
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
                        <div className="hub-tile-s">{parentalPin ? "Salir con PIN" : "Salir del modo Félix"}</div>
                      </div>
                    </FocusableButton>
                  ) : (
                    <FocusableButton focusKey={`HUB_T_${tiles.length}`} className="hub-tile hub-felix" onEnterPress={enterKids}>
                      <div className="hub-tile-ic"><Icon name="child_care" /></div>
                      <div className="hub-tile-b">
                        <div className="hub-tile-t">Félix</div>
                        <div className="hub-tile-s">Modo niños</div>
                      </div>
                    </FocusableButton>
                  )}
                </FocusZone>
                {shownHistory.length ? (
                  <div className="hub-cont">
                    <div className="hub-cont-h">Seguir viendo</div>
                    <FocusZone zone="hub:cont" className="hub-rowscroll scroll">
                      {shownHistory.map((h, i) => (
                        <FocusableButton key={h.id} focusKey={`HUB_C_${i}`} className="hub-mini" onEnterPress={() => openHistory(h)}>
                          <div className="hub-mini-p">
                            {h.posterUrl ? <img src={h.posterUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                            {h.sub ? <span className="hub-mini-tag">{h.sub}</span> : null}
                          </div>
                          <div className="hub-mini-t">{h.name}</div>
                        </FocusableButton>
                      ))}
                    </FocusZone>
                  </div>
                ) : null}
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
