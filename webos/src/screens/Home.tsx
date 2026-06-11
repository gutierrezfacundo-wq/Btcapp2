import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { findNowPlaying } from "../data/xmltv";
import { FocusableButton } from "../components/FocusableButton";
import { ChannelRow } from "../components/ChannelRow";
import { PosterCard } from "../components/PosterCard";
import { CategoryChips } from "../components/CategoryChips";

type Tab = "live" | "movies" | "series" | "favorites";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "En vivo" },
  { id: "movies", label: "Películas" },
  { id: "series", label: "Series" },
  { id: "favorites", label: "Favoritos" },
];

export function Home() {
  const navigate = useNavigate();
  const { catalog, loading, error, favorites, reload, source } = useAppStore();
  const loadingStep = useAppStore((s) => s.loadingStep);
  const loadingProgress = useAppStore((s) => s.loadingProgress);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const isFavorite = useAppStore((s) => s.isFavorite);
  const epgByChannel = useAppStore((s) => s.epgByChannel);

  const [search] = useSearchParams();
  const initialTab = (search.get("tab") as Tab) ?? "live";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      navigate("/setup");
      return;
    }
    if (catalog.liveChannels.length === 0 && !loading) reload();
  }, [source, catalog.liveChannels.length, loading, navigate, reload]);

  useEffect(() => {
    setFocus("HOME");
  }, [tab]);

  useEffect(() => setCategory(null), [tab]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "HOME" });

  const filteredLive = useMemo(
    () =>
      category
        ? catalog.liveChannels.filter((c) => c.groupTitle === category)
        : catalog.liveChannels,
    [catalog.liveChannels, category],
  );
  const filteredMovies = useMemo(
    () => (category ? catalog.movies.filter((m) => m.category === category) : catalog.movies),
    [catalog.movies, category],
  );
  const filteredSeries = useMemo(
    () => (category ? catalog.series.filter((s) => s.category === category) : catalog.series),
    [catalog.series, category],
  );

  const play = (url: string, title: string) =>
    navigate(`/player?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);

  const openSeries = (id: string, title: string) =>
    navigate(`/series/${id}?title=${encodeURIComponent(title)}`);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page" ref={ref}>
        <div className="topbar">
          <span>IPTV Player</span>
          <div className="actions">
            <FocusableButton className="btn" onEnterPress={reload}>↻</FocusableButton>
            <FocusableButton className="btn" onEnterPress={() => navigate("/setup")}>⚙</FocusableButton>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <FocusableButton
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onEnterPress={() => setTab(t.id)}
            >
              {t.label}
            </FocusableButton>
          ))}
        </div>

        {loading ? (
          <div className="loading" style={{ flexDirection: "column", gap: 16 }}>
            <div className="spinner" />
            {loadingStep ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{loadingStep}</div>
                {loadingProgress ? (
                  <div style={{ fontSize: 18, opacity: 0.6, marginTop: 6 }}>
                    {loadingProgress.current} / {loadingProgress.total}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="error" style={{ flexDirection: "column", gap: 16 }}>
            <div>{error}</div>
            <FocusableButton className="btn primary" onEnterPress={() => reload()}>
              Reintentar
            </FocusableButton>
            <FocusableButton className="btn" onEnterPress={() => navigate("/setup")}>
              Revisar configuración
            </FocusableButton>
          </div>
        ) : (
          <>
            {tab === "live" && (
              <>
                <CategoryChips
                  categories={catalog.liveCategories}
                  selected={category}
                  onSelect={setCategory}
                />
                <div className="scroll" style={{ flex: 1 }}>
                  {filteredLive.length === 0 ? (
                    <div className="empty">No hay canales</div>
                  ) : (
                    filteredLive.map((c) => {
                      const now = findNowPlaying(epgByChannel, c.tvgId);
                      return (
                        <ChannelRow
                          key={c.id}
                          name={c.name}
                          subtitle={now?.title ?? c.groupTitle}
                          logoUrl={c.logoUrl}
                          isFavorite={isFavorite(c.id)}
                          onPlay={() => play(c.streamUrl, c.name)}
                          onToggleFavorite={() =>
                            toggleFavorite({
                              id: c.id,
                              name: c.name,
                              streamUrl: c.streamUrl,
                              logoUrl: c.logoUrl,
                              kind: c.kind,
                            })
                          }
                        />
                      );
                    })
                  )}
                </div>
              </>
            )}

            {tab === "movies" && (
              <>
                <CategoryChips
                  categories={catalog.movieCategories}
                  selected={category}
                  onSelect={setCategory}
                />
                <div className="scroll" style={{ flex: 1 }}>
                  {filteredMovies.length === 0 ? (
                    <div className="empty">No hay películas</div>
                  ) : (
                    <div className="poster-grid">
                      {filteredMovies.map((m) => (
                        <PosterCard
                          key={m.id}
                          title={m.name}
                          posterUrl={m.posterUrl}
                          onSelect={() => play(m.streamUrl, m.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === "series" && (
              <>
                <CategoryChips
                  categories={catalog.seriesCategories}
                  selected={category}
                  onSelect={setCategory}
                />
                <div className="scroll" style={{ flex: 1 }}>
                  {filteredSeries.length === 0 ? (
                    <div className="empty">No hay series</div>
                  ) : (
                    <div className="poster-grid">
                      {filteredSeries.map((s) => (
                        <PosterCard
                          key={s.id}
                          title={s.name}
                          posterUrl={s.posterUrl}
                          onSelect={() => openSeries(s.id, s.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === "favorites" && (
              <div className="scroll" style={{ flex: 1 }}>
                {favorites.length === 0 ? (
                  <div className="empty">Todavía no hay favoritos</div>
                ) : (
                  favorites.map((f) => (
                    <ChannelRow
                      key={f.id}
                      name={f.name}
                      logoUrl={f.logoUrl}
                      isFavorite
                      onPlay={() => play(f.streamUrl, f.name)}
                      onToggleFavorite={() => toggleFavorite(f)}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FocusContext.Provider>
  );
}
