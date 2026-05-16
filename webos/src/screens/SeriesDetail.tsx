import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadSeriesEpisodes } from "../data/xtream";
import type { Episode } from "../data/types";
import { FocusableButton } from "../components/FocusableButton";

export function SeriesDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const title = params.get("title") ?? "Serie";
  const navigate = useNavigate();
  const source = useAppStore((s) => s.source);

  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SERIES" });

  useEffect(() => {
    setFocus("SERIES");
  }, [episodes]);

  useEffect(() => {
    if (!source || source.kind !== "xtream") {
      setError("El detalle de serie solo está disponible con Xtream");
      return;
    }
    loadSeriesEpisodes(source, id)
      .then(setEpisodes)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [source, id]);

  const play = (ep: Episode) => {
    const fullTitle = `T${ep.seasonNumber} E${ep.episodeNumber} — ${ep.title}`;
    navigate(`/player?url=${encodeURIComponent(ep.streamUrl)}&title=${encodeURIComponent(fullTitle)}`);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page" ref={ref}>
        <div className="topbar">
          <FocusableButton className="btn" onEnterPress={() => navigate(-1)}>←</FocusableButton>
          <span>{title}</span>
          <span />
        </div>
        {error ? (
          <div className="error">{error}</div>
        ) : episodes === null ? (
          <div className="loading"><div className="spinner" /></div>
        ) : episodes.length === 0 ? (
          <div className="empty">Sin episodios</div>
        ) : (
          <div className="scroll" style={{ flex: 1 }}>
            {episodes.map((ep) => (
              <EpisodeRow key={ep.id} episode={ep} onPlay={() => play(ep)} />
            ))}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}

function EpisodeRow({ episode, onPlay }: { episode: Episode; onPlay: () => void }) {
  const { ref, focused } = useFocusable({ onEnterPress: onPlay });
  return (
    <div
      ref={ref}
      className={`episode-row focusable ${focused ? "focused" : ""}`}
      onClick={onPlay}
    >
      <span className="meta">T{episode.seasonNumber} · E{episode.episodeNumber}</span>
      <span className="title">{episode.title}</span>
    </div>
  );
}
