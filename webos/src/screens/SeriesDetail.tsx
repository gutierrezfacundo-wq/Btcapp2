import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadSeriesEpisodes } from "../data/xtream";
import type { Episode, SeriesMeta } from "../data/types";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { isBackKey } from "../webos/remote-keys";

function initials(s: string) {
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function SeriesDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const title = params.get("name") ?? params.get("title") ?? "Serie";
  const navigate = useNavigate();
  const railNav = useRailNav();
  const source = useAppStore((s) => s.source);
  const series = useAppStore((s) => s.catalog.series);
  const progress = useAppStore((s) => s.progress);
  const info = useMemo(() => series.find((s) => s.id === id), [series, id]);

  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [meta, setMeta] = useState<SeriesMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SERIES" });

  useEffect(() => {
    if (!source || source.kind !== "xtream") {
      setError("El detalle de serie solo está disponible con Xtream");
      return;
    }
    loadSeriesEpisodes(source, id)
      .then(({ episodes: eps, meta: m }) => { setEpisodes(eps); setMeta(m); if (eps.length) setSeason(eps[0].seasonNumber); })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [source, id]);

  useEffect(() => { setFocus("SER_PLAY"); }, [episodes]);

  const goBack = () => navigate("/home?tab=series");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isBackKey(e)) { e.preventDefault(); goBack(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seasons = useMemo(
    () => (episodes ? [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b) : []),
    [episodes],
  );
  const seasonEpisodes = useMemo(
    () => (episodes ?? []).filter((e) => e.seasonNumber === season),
    [episodes, season],
  );

  const pushHistory = useAppStore((s) => s.pushHistory);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const favId = `series:${id}`;
  const isFav = favorites.some((f) => f.id === favId);
  const favMeta = [meta?.year, meta?.genre, meta?.rating ? `${meta.rating} ★` : null].filter(Boolean).join(" · ") || undefined;
  const toggleFav = () => toggleFavorite({ id: favId, name: title, streamUrl: seasonEpisodes[0]?.streamUrl ?? episodes?.[0]?.streamUrl ?? "", logoUrl: info?.posterUrl ?? meta?.posterUrl, kind: "series-episode", meta: favMeta });
  const play = (ep: Episode) => {
    const ft = `${title} · T${ep.seasonNumber} · E${ep.episodeNumber}`;
    const meta = `T${ep.seasonNumber} · E${ep.episodeNumber}${ep.duration ? ` · ${ep.duration}` : ""}`;
    const route = `/player?url=${encodeURIComponent(ep.streamUrl)}&title=${encodeURIComponent(ft)}&meta=${encodeURIComponent(meta)}`;
    pushHistory({ id: `series:${id}`, name: title, route, posterUrl: info?.posterUrl, sub: meta, kind: "series-episode" });
    const fav = { id: `series:${id}`, name: title, streamUrl: ep.streamUrl, logoUrl: info?.posterUrl, kind: "series-episode" as const };
    navigate(route, { state: { from: `/series/${id}?name=${encodeURIComponent(title)}`, fav, cid: ep.id } });
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Series" />
        <div className="a-body">
          <Rail active="series" onSelect={railNav} />
          <div className="a-screen">
            {error ? (
              <div className="ld"><Icon name="wifi_off" className="eo-ic" /><div className="ld-step" style={{ color: "var(--err)" }}>{error}</div></div>
            ) : episodes === null ? (
              <div className="ld"><div className="ld-spin spinner" /><div className="ld-step">Cargando episodios…</div></div>
            ) : (
              <div className="det">
                <div className="det-top">
                  <FocusableButton className="det-back" onEnterPress={goBack}>
                    <Icon name="arrow_back" /> Volver a Series
                  </FocusableButton>
                </div>
                <div className="det-hero">
                  <div className="det-art">
                    {info?.posterUrl || meta?.posterUrl ? <img src={info?.posterUrl || meta?.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 18 }} /> : initials(title)}
                  </div>
                  <div className="det-info">
                    <div className="det-title">{title}</div>
                    <div className="det-meta">
                      {meta?.rating ? <span className="det-mchip rate"><Icon name="star" /> {meta.rating}</span> : null}
                      {meta?.year ? <span className="det-mchip">{meta.year}</span> : null}
                      {meta?.genre ? <span className="det-mchip">{meta.genre}</span> : info?.category ? <span className="det-mchip">{info.category}</span> : null}
                      {seasons.length ? <span className="det-mchip">{seasons.length} temporada{seasons.length > 1 ? "s" : ""}</span> : null}
                    </div>
                    {info?.plot || meta?.plot ? <div className="det-syn">{info?.plot || meta?.plot}</div> : null}
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      {seasonEpisodes[0] ? (
                        <FocusableButton focusKey="SER_PLAY" className="det-play" onEnterPress={() => play(seasonEpisodes[0])}>
                          <Icon name="play_arrow" /> Reproducir T{seasonEpisodes[0].seasonNumber} · E{seasonEpisodes[0].episodeNumber}
                        </FocusableButton>
                      ) : null}
                      <FocusableButton className="btn" onEnterPress={toggleFav}>
                        <Icon name={isFav ? "star" : "star_border"} /> {isFav ? "En favoritos" : "Favorito"}
                      </FocusableButton>
                    </div>
                  </div>
                </div>
                {seasons.length > 1 ? (
                  <div className="det-seasons">
                    {seasons.map((s) => (
                      <FocusableButton key={s} className={`chip ${s === season ? "on" : ""}`} onEnterPress={() => setSeason(s)}>
                        Temporada {s}
                      </FocusableButton>
                    ))}
                  </div>
                ) : null}
                <div className="det-eps scroll">
                  {seasonEpisodes.length === 0 ? (
                    <div className="grd-empty">Sin episodios</div>
                  ) : (
                    seasonEpisodes.map((ep) => {
                      const p = progress[ep.id];
                      const watched = p && p.dur > 0 && p.pos > p.dur - 60;
                      const continuing = p && p.dur > 0 && p.pos > 30 && p.pos <= p.dur - 60;
                      return (
                        <FocusableButton key={ep.id} className="ep-row" onEnterPress={() => play(ep)}>
                          <span className="ep-num">E{String(ep.episodeNumber).padStart(2, "0")}</span>
                          <span className="ep-thumb">
                            {ep.thumbUrl ? <img src={ep.thumbUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : <Icon name="play_arrow" />}
                          </span>
                          <span className="ep-mid">
                            <div className="ep-title">{ep.title}</div>
                            <div className="ep-sub">{ep.plot ? ep.plot : `T${ep.seasonNumber} · E${ep.episodeNumber}`}</div>
                          </span>
                          {watched ? <span className="ep-flag"><Icon name="check_circle" /> Visto</span>
                            : continuing ? <span className="ep-flag"><Icon name="play_circle" /> Continuar</span> : null}
                          {ep.duration ? <span className="ep-dur">{ep.duration}</span> : null}
                        </FocusableButton>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <Hints items={[{ k: "↕", label: "Navegar" }, { k: "OK", label: "Reproducir" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
