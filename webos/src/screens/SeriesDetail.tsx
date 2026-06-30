import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadSeriesEpisodes } from "../data/xtream";
import type { Episode } from "../data/types";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";

export function SeriesDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const title = params.get("name") ?? params.get("title") ?? "Serie";
  const navigate = useNavigate();
  const source = useAppStore((s) => s.source);
  const series = useAppStore((s) => s.catalog.series);
  const info = useMemo(() => series.find((s) => s.id === id), [series, id]);

  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SERIES" });

  useEffect(() => {
    if (!source || source.kind !== "xtream") {
      setError("El detalle de serie solo está disponible con Xtream");
      return;
    }
    loadSeriesEpisodes(source, id)
      .then((eps) => {
        setEpisodes(eps);
        if (eps.length) setSeason(eps[0].seasonNumber);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [source, id]);

  useEffect(() => {
    setFocus("SER_PLAY");
  }, [episodes]);

  const seasons = useMemo(() => {
    if (!episodes) return [];
    return [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b);
  }, [episodes]);

  const seasonEpisodes = useMemo(
    () => (episodes ?? []).filter((e) => e.seasonNumber === season),
    [episodes, season],
  );

  const play = (ep: Episode) => {
    const ft = `${title} — T${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`;
    navigate(`/player?url=${encodeURIComponent(ep.streamUrl)}&title=${encodeURIComponent(ft)}`);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page series-aurora" ref={ref}>
        <div className="a-top">
          <FocusableButton className="a-railbtn back-inline" onEnterPress={() => navigate(-1)}>
            <Icon name="arrow_back" />
          </FocusableButton>
          <div className="a-logo">POTR<span>I</span></div>
        </div>

        {error ? (
          <div className="hub-status">
            <Icon name="wifi_off" className="hub-status-icon" />
            <div className="error" style={{ padding: 0 }}>{error}</div>
          </div>
        ) : episodes === null ? (
          <div className="hub-status"><div className="spinner" /></div>
        ) : (
          <div className="ser-body">
            <div className="ser-hero">
              <div className="ser-cover">
                {info?.posterUrl ? <img src={info.posterUrl} alt="" /> : <Icon name="video_library" />}
              </div>
              <div className="ser-meta">
                <div className="ser-title">{title}</div>
                {info?.category ? <div className="ser-tags">{info.category}</div> : null}
                {info?.plot ? <div className="ser-plot">{info.plot}</div> : null}
                {seasonEpisodes[0] ? (
                  <FocusableButton
                    focusKey="SER_PLAY"
                    className="btn primary ser-playbtn"
                    onEnterPress={() => play(seasonEpisodes[0])}
                  >
                    <Icon name="play_arrow" /> Reproducir T{seasonEpisodes[0].seasonNumber}·E{seasonEpisodes[0].episodeNumber}
                  </FocusableButton>
                ) : null}
              </div>
            </div>

            {seasons.length > 1 ? (
              <div className="ser-seasons">
                {seasons.map((s) => (
                  <FocusableButton
                    key={s}
                    className={`chip ${s === season ? "active" : ""}`}
                    onEnterPress={() => setSeason(s)}
                  >
                    Temporada {s}
                  </FocusableButton>
                ))}
              </div>
            ) : null}

            <div className="ser-eps scroll">
              {seasonEpisodes.length === 0 ? (
                <div className="empty">Sin episodios</div>
              ) : (
                seasonEpisodes.map((ep) => (
                  <FocusableButton key={ep.id} className="ser-ep" onEnterPress={() => play(ep)}>
                    <span className="ser-ep-n">E{String(ep.episodeNumber).padStart(2, "0")}</span>
                    <span className="ser-ep-title">{ep.title}</span>
                    <Icon name="play_arrow" className="ser-ep-play" />
                  </FocusableButton>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}
