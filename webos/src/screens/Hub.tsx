import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints, HINTS_NAV } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { restoreFocus } from "../navigation/focusMemory";

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
  const loadingProgress = useAppStore((s) => s.loadingProgress);
  const error = useAppStore((s) => s.error);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const reload = useAppStore((s) => s.reload);

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HUB" });
  // Enfocar recién cuando los tiles existen: durante la carga se muestra el
  // spinner (sin focusables) y un intento en el mount moriría sin foco → D-pad muerto.
  const hubReady = !loading && !loadingStep && !error;
  useEffect(() => {
    if (hubReady) restoreFocus("hub:tiles", "HUB_T_0");
  }, [hubReady]);

  const tiles: { id: SectionId; title: string; sub: string; icon: string }[] = [
    { id: "live", title: "En vivo", sub: catalog.liveChannels.length ? `${catalog.liveChannels.length.toLocaleString()} canales` : "—", icon: "live_tv" },
    { id: "movies", title: "Películas", sub: loadedSections.movies ? `${catalog.movies.length.toLocaleString()} títulos` : "Cargar al entrar", icon: "movie" },
    { id: "series", title: "Series", sub: loadedSections.series ? `${catalog.series.length.toLocaleString()} títulos` : "Cargar al entrar", icon: "video_library" },
    { id: "favorites", title: "Favoritos", sub: `${favorites.length} guardados`, icon: "star" },
  ];

  const onTile = (id: SectionId) => {
    // Navegamos al instante; la sección muestra su propio spinner mientras carga.
    if (id === "movies" && !loadedSections.movies) ensureMovies();
    else if (id === "series" && !loadedSections.series) ensureSeries();
    navigate(`/home?tab=${id}`);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Inicio" />
        <div className="a-body">
          <Rail active="hub" onSelect={railNav} reloading={loading} />
          <div className="a-screen">
            {loading || loadingStep ? (
              <div className="ld">
                <div className="ld-spin spinner" />
                <div className="ld-step">{loadingStep ?? "Cargando…"}</div>
                {loadingProgress ? <div className="ld-count">{loadingProgress.current} / {loadingProgress.total}</div> : null}
              </div>
            ) : error ? (
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
                    <div className="hub-greet">{greeting()}</div>
                    <div className="hub-title">¿Qué querés <span>ver</span> hoy?</div>
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
                </FocusZone>
                {history.length ? (
                  <div className="hub-cont">
                    <div className="hub-cont-h">Seguir viendo</div>
                    <FocusZone zone="hub:cont" className="hub-rowscroll scroll">
                      {history.slice(0, 8).map((h, i) => (
                        <FocusableButton key={h.id} focusKey={`HUB_C_${i}`} className="hub-mini" onEnterPress={() => navigate(h.route)}>
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
        <Hints items={HINTS_NAV} />
      </div>
    </FocusContext.Provider>
  );
}
