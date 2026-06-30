import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FocusContext,
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";

type SectionId = "live" | "movies" | "series" | "favorites";

interface Tile {
  id: SectionId;
  title: string;
  subtitle: string;
  icon: string;
}

export function Hub() {
  const navigate = useNavigate();
  const source = useAppStore((s) => s.source);
  const sources = useAppStore((s) => s.sources);
  const activeSourceId = useAppStore((s) => s.activeSourceId);
  const catalog = useAppStore((s) => s.catalog);
  const favorites = useAppStore((s) => s.favorites);
  const loading = useAppStore((s) => s.loading);
  const loadingStep = useAppStore((s) => s.loadingStep);
  const loadingProgress = useAppStore((s) => s.loadingProgress);
  const error = useAppStore((s) => s.error);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const reload = useAppStore((s) => s.reload);

  const activeName = sources.find((s) => s.id === activeSourceId)?.name ?? "Sin lista";

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HUB" });
  useEffect(() => {
    setFocus("HUB_TILE_0");
  }, []);

  const tiles: Tile[] = [
    {
      id: "live",
      title: "En vivo",
      subtitle: catalog.liveChannels.length ? `${catalog.liveChannels.length} canales` : "—",
      icon: "live_tv",
    },
    {
      id: "movies",
      title: "Películas",
      subtitle: loadedSections.movies ? `${catalog.movies.length} películas` : "Cargar al entrar",
      icon: "movie",
    },
    {
      id: "series",
      title: "Series",
      subtitle: loadedSections.series ? `${catalog.series.length} series` : "Cargar al entrar",
      icon: "video_library",
    },
    {
      id: "favorites",
      title: "Favoritos",
      subtitle: `${favorites.length} guardados`,
      icon: "star",
    },
  ];

  const onSelect = async (id: SectionId) => {
    if (id === "movies" && !loadedSections.movies) await ensureMovies();
    if (id === "series" && !loadedSections.series) await ensureSeries();
    navigate(`/home?tab=${id}`);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page hub-aurora" ref={ref}>
        <div className="a-top">
          <div className="a-logo">POTR<span>I</span></div>
          <div className="a-spacer" />
          <FocusableButton className="hub-active" onEnterPress={() => navigate("/setup")}>
            <Icon name="playlist_play" />
            <span className="hub-active-label">Lista activa</span>
            <span className="hub-active-name">{activeName}</span>
          </FocusableButton>
          <FocusableButton className="a-railbtn hub-top-btn" onEnterPress={reload}>
            <Icon name="refresh" />
          </FocusableButton>
        </div>

        {loading || loadingStep ? (
          <div className="hub-status">
            <div className="spinner" />
            <div className="hub-status-step">{loadingStep ?? "Cargando…"}</div>
            {loadingProgress ? (
              <div className="hub-status-prog">{loadingProgress.current} / {loadingProgress.total}</div>
            ) : null}
          </div>
        ) : error ? (
          <div className="hub-status">
            <Icon name="wifi_off" className="hub-status-icon" />
            <div className="error" style={{ padding: 0 }}>{error}</div>
            <div style={{ display: "flex", gap: 16 }}>
              <FocusableButton className="btn primary" onEnterPress={reload}>Reintentar</FocusableButton>
              <FocusableButton className="btn" onEnterPress={() => navigate("/setup")}>Editar lista</FocusableButton>
            </div>
          </div>
        ) : (
          <div className="hub-grid">
            {tiles.map((t, i) => (
              <FocusableButton
                key={t.id}
                focusKey={`HUB_TILE_${i}`}
                className="hub-tile"
                onEnterPress={() => onSelect(t.id)}
              >
                <Icon name={t.icon} className="hub-tile-icon" />
                <div className="hub-tile-title">{t.title}</div>
                <div className="hub-tile-sub">{t.subtitle}</div>
              </FocusableButton>
            ))}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}
