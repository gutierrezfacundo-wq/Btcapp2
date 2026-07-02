import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadMovieInfo, type MovieDetails } from "../data/xtream";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { encodeB64Url } from "../data/b64url";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";

function initials(s: string) {
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function fmtPos(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

/** Pantalla dedicada de película: info + sinopsis + continuar/reiniciar. */
export function MovieDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const railNav = useRailNav();
  const source = useAppStore((s) => s.source);
  const movies = useAppStore((s) => s.catalog.movies);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const progress = useAppStore((s) => s.progress);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const clearProgress = useAppStore((s) => s.clearProgress);

  const movie = useMemo(() => movies.find((m) => m.id === id), [movies, id]);
  const [details, setDetails] = useState<MovieDetails | null>(null);

  // Si se entra directo (deep link / Seguir viendo) sin la sección cargada.
  useEffect(() => {
    if (!loadedSections.movies) ensureMovies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detalle enriquecido del proveedor (sinopsis/género/duración), mejor esfuerzo.
  useEffect(() => {
    if (!source || source.kind !== "xtream") return;
    const streamId = id.match(/^xt-vod-(\d+)$/)?.[1];
    if (!streamId) return;
    loadMovieInfo(source, streamId).then(setDetails).catch(() => setDetails(null));
  }, [source, id]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "MOVIE" });
  useEffect(() => { focusWhenReady("MOV_PLAY"); }, [movie?.id]);

  const goBack = () => {
    navigate("/home?tab=movies");
    window.setTimeout(() => {
      if (window.location.hash.replace(/^#/, "").startsWith("/movie")) window.location.hash = "#/home?tab=movies";
    }, 60);
  };
  useBack(() => { goBack(); });

  const isFav = favorites.some((f) => f.id === id);
  const prog = progress[id];
  const resumePos = prog && prog.pos > 15 ? prog.pos : 0;

  const rating = details?.rating ?? movie?.rating;
  const year = details?.year ?? movie?.year?.slice(0, 4);
  const genre = details?.genre ?? movie?.category;
  const plot = details?.plot || movie?.plot;
  const poster = movie?.posterUrl ?? details?.posterUrl;

  const play = (fromStart = false) => {
    if (!movie) return;
    if (fromStart) clearProgress(movie.id);
    const sub = [year, genre].filter(Boolean).join(" · ") || undefined;
    const fav = { id: movie.id, name: movie.name, streamUrl: movie.streamUrl, logoUrl: poster, kind: "movie" as const, meta: sub };
    const st = encodeB64Url({ from: `/movie/${movie.id}`, cid: movie.id, fav });
    const route = `/player?url=${encodeURIComponent(movie.streamUrl)}&title=${encodeURIComponent(movie.name)}${sub ? `&meta=${encodeURIComponent(sub)}` : ""}&st=${st}`;
    pushHistory({ id: movie.id, name: movie.name, route, posterUrl: poster, sub, kind: "movie" });
    navigate(route);
  };

  const toggleFav = () => {
    if (!movie) return;
    const sub = [year, genre].filter(Boolean).join(" · ") || undefined;
    toggleFavorite({ id: movie.id, name: movie.name, streamUrl: movie.streamUrl, logoUrl: poster, kind: "movie", meta: sub });
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Películas" />
        <div className="a-body">
          <Rail active="movies" onSelect={railNav} />
          <div className="a-screen">
            {!movie ? (
              <div className="ld">
                {loadedSections.movies ? (
                  <>
                    <Icon name="movie" className="eo-ic" />
                    <div className="ld-step">No se encontró la película.</div>
                    <FocusableButton focusKey="MOV_PLAY" className="btn primary" onEnterPress={goBack}>Volver a Películas</FocusableButton>
                  </>
                ) : (
                  <>
                    <div className="ld-spin spinner" />
                    <div className="ld-step">Cargando…</div>
                  </>
                )}
              </div>
            ) : (
              <div className="det">
                <div className="det-top">
                  <FocusableButton className="det-back" onEnterPress={goBack}>
                    <Icon name="arrow_back" /> Volver a Películas
                  </FocusableButton>
                </div>
                <div className="det-hero">
                  <div className="det-art">
                    {poster ? <img src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 18 }} /> : initials(movie.name)}
                  </div>
                  <div className="det-info">
                    <div className="det-title">{movie.name}</div>
                    <div className="det-meta">
                      {rating ? <span className="det-mchip rate"><Icon name="star" /> {rating}</span> : null}
                      {year ? <span className="det-mchip">{year}</span> : null}
                      {genre ? <span className="det-mchip">{genre}</span> : null}
                      {details?.duration ? <span className="det-mchip">{details.duration}</span> : null}
                    </div>
                    {plot ? <div className="det-syn">{plot}</div> : null}
                    {details?.director || details?.cast ? (
                      <div className="det-credits">
                        {details.director ? <span><b>Dirección:</b> {details.director}</span> : null}
                        {details.cast ? <span><b>Elenco:</b> {details.cast}</span> : null}
                      </div>
                    ) : null}
                    <FocusZone zone="movie:actions" preferred="MOV_PLAY" className="det-actions">
                      <FocusableButton focusKey="MOV_PLAY" className="det-play" onEnterPress={() => play(false)}>
                        <Icon name="play_arrow" /> {resumePos ? `Continuar · ${fmtPos(resumePos)}` : "Reproducir"}
                      </FocusableButton>
                      {resumePos ? (
                        <FocusableButton className="btn" onEnterPress={() => play(true)}>
                          <Icon name="restart_alt" /> Desde el inicio
                        </FocusableButton>
                      ) : null}
                      <FocusableButton className="btn" onEnterPress={toggleFav}>
                        <Icon name={isFav ? "star" : "star_border"} /> {isFav ? "En favoritos" : "Favorito"}
                      </FocusableButton>
                    </FocusZone>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <Hints items={[{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Reproducir" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
