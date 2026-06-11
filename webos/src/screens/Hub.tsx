import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FocusContext,
  useFocusable,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";

type SectionId = "live" | "movies" | "series" | "favorites";

interface Tile {
  id: SectionId;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
}

export function Hub() {
  const navigate = useNavigate();
  const source = useAppStore((s) => s.source);
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
  const clearSource = useAppStore((s) => s.clearSource);

  useEffect(() => {
    if (!source) navigate("/setup");
  }, [source, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HUB" });
  useEffect(() => {
    setFocus("HUB");
  }, []);

  const tiles: Tile[] = [
    {
      id: "live",
      title: "En vivo",
      subtitle: catalog.liveChannels.length
        ? `${catalog.liveChannels.length} canales`
        : "—",
      emoji: "📺",
      color: "#1e3a8a",
    },
    {
      id: "movies",
      title: "Películas",
      subtitle: loadedSections.movies
        ? `${catalog.movies.length} películas`
        : "Cargar al entrar",
      emoji: "🎬",
      color: "#7c2d12",
    },
    {
      id: "series",
      title: "Series",
      subtitle: loadedSections.series
        ? `${catalog.series.length} series`
        : "Cargar al entrar",
      emoji: "🎞️",
      color: "#581c87",
    },
    {
      id: "favorites",
      title: "Favoritos",
      subtitle: `${favorites.length} guardados`,
      emoji: "★",
      color: "#854d0e",
    },
  ];

  const onSelect = async (id: SectionId) => {
    if (id === "movies" && !loadedSections.movies) await ensureMovies();
    if (id === "series" && !loadedSections.series) await ensureSeries();
    navigate(`/home?tab=${id}`);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page hub" ref={ref}>
        <div className="topbar" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>IPTV Player</span>
          <div style={{ display: "flex", gap: 12 }}>
            <FocusableButton className="btn" onEnterPress={reload}>↻ Recargar</FocusableButton>
            <FocusableButton
              className="btn"
              onEnterPress={() => {
                clearSource();
                navigate("/setup");
              }}
            >
              ⚙ Cambiar fuente
            </FocusableButton>
          </div>
        </div>

        {loading || loadingStep ? (
          <div className="hub-status">
            <div className="spinner" />
            <div style={{ marginTop: 12, fontSize: 22 }}>
              {loadingStep ?? "Cargando…"}
            </div>
            {loadingProgress ? (
              <div style={{ opacity: 0.6, fontSize: 18, marginTop: 4 }}>
                {loadingProgress.current} / {loadingProgress.total}
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="hub-status">
            <div className="error" style={{ padding: 0 }}>{error}</div>
            <FocusableButton className="btn primary" onEnterPress={reload}>
              Reintentar
            </FocusableButton>
          </div>
        ) : (
          <div className="hub-grid">
            {tiles.map((t) => (
              <FocusableButton
                key={t.id}
                className="hub-tile"
                style={{ background: `linear-gradient(135deg, ${t.color}, #0E0E10)` }}
                onEnterPress={() => onSelect(t.id)}
              >
                <div className="hub-tile-emoji">{t.emoji}</div>
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
