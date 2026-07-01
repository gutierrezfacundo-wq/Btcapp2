import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { Icon } from "../components/Icon";
import { TrackMenu } from "../components/TrackMenu";
import { useAppStore, type FavoriteItem } from "../store/useAppStore";
import { getSubtitleService, SubtitleError, type SubtitleResult, type SubtitleSearchRequest } from "../services/subtitles";
import { isBackKey, isPlayPauseKey } from "../webos/remote-keys";

const SUB_LANGS = [
  { code: "es", name: "ES" },
  { code: "en", name: "EN" },
  { code: "pt-br", name: "PT" },
];
function subErrorMessage(e: unknown): string {
  if (e instanceof SubtitleError) {
    switch (e.code) {
      case "no_api_key": return "Configurá tu API key de OpenSubtitles en Mis Listas.";
      case "no_relay": return "Configurá la URL del companion en Mis Listas.";
      case "auth": return "API key inválida.";
      case "rate_limit": return "Límite de descargas/consultas alcanzado (probá más tarde).";
      case "timeout": return "La búsqueda tardó demasiado.";
      case "network": return "Error de red.";
      default: return e.message;
    }
  }
  return "Error inesperado.";
}

/** Limpia el título para buscar subtítulos: saca prefijos de proveedor/calidad,
 * año, tags entre corchetes y palabras de calidad/idioma. */
function cleanTitle(raw: string): string {
  return raw
    .split(" · ")[0]
    .replace(/^\s*[^\s|]{1,12}\s*-\s*/, "")            // "4K-TOP - " / "VIP - "
    .replace(/\[[^\]]*\]/g, "")                          // [tags]
    .replace(/\(?\b(?:19|20)\d{2}\b\)?/g, "")           // año (2026)
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|hevc|x265|x264|dual|latino|castellano|español|espanol|subtitulad[oa]|vose?)\b/gi, "")
    .replace(/[._]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function Player() {
  const [params] = useSearchParams();
  const url = params.get("url") ?? "";
  const title = params.get("title") ?? "";
  const meta = params.get("meta") ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // navegación normal (el mismo patrón que sí anda en el resto) + fallback por hash
  // para el HashRouter de webOS si por algo no cambia la ruta.
  const goBack = () => {
    const dest = from && from.startsWith("/") ? from : "/hub";
    navigate(dest);
    window.setTimeout(() => {
      if (window.location.hash.replace(/^#/, "").startsWith("/player")) window.location.hash = `#${dest}`;
    }, 60);
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [hls, setHls] = useState<Hls | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tracksOpen, setTracksOpen] = useState(false);
  const tracksRef = useRef(false); tracksRef.current = tracksOpen;
  const overlayTimer = useRef<number | null>(null);

  // ===== Subtítulos (vía SubtitleService, agnóstico del proveedor) =====
  const subtitlesApiKey = useAppStore((s) => s.subtitlesApiKey);
  const companionUrl = useAppStore((s) => s.companionUrl);
  const [subsOpen, setSubsOpen] = useState(false);
  const subsRef = useRef(false); subsRef.current = subsOpen;
  const [subResults, setSubResults] = useState<SubtitleResult[] | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const [subLangs, setSubLangs] = useState<string[]>(["es", "en"]);
  // Identidad del contenido: la pasa la pantalla de origen (con tmdb/imdb si los tiene);
  // si no, se deriva del título/meta.
  const stateSub = (location.state as { sub?: Partial<SubtitleSearchRequest> } | null)?.sub;
  const derivedTitle = cleanTitle(title) || title.split(" · ")[0].trim();
  const derivedYear = (title.match(/\b(?:19|20)\d{2}\b/) || (meta.match(/\b(?:19|20)\d{2}\b/) ?? []))[0];
  const seMatch = `${title} ${meta}`.match(/\bT\s?(\d{1,3})\D+?E\s?(\d{1,3})\b/i) || `${title} ${meta}`.match(/\bS(\d{1,3})\s?E(\d{1,3})\b/i);
  const favKind = (location.state as { fav?: { kind?: string } } | null)?.fav?.kind;
  const isEpisode = stateSub?.type === "episode" || favKind === "series-episode" || !!seMatch;
  const baseReq: SubtitleSearchRequest = {
    type: isEpisode ? "episode" : "movie",
    title: stateSub?.title ? (cleanTitle(stateSub.title) || stateSub.title) : derivedTitle,
    year: stateSub?.year ?? (isEpisode ? undefined : derivedYear),
    tmdbId: stateSub?.tmdbId,
    imdbId: stateSub?.imdbId,
    parentTmdbId: stateSub?.parentTmdbId,
    parentImdbId: stateSub?.parentImdbId,
    season: stateSub?.season ?? (seMatch ? Number(seMatch[1]) : undefined),
    episode: stateSub?.episode ?? (seMatch ? Number(seMatch[2]) : undefined),
  };
  const [subQuery, setSubQuery] = useState(baseReq.title ?? "");

  // ===== Favoritos / Continuar viendo =====
  const cid = (location.state as { cid?: string } | null)?.cid;
  const fav = (location.state as { fav?: FavoriteItem } | null)?.fav;
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const isFav = !!fav && favorites.some((f) => f.id === fav.id);
  const saveProgress = useAppStore((s) => s.saveProgress);
  const clearProgress = useAppStore((s) => s.clearProgress);
  const resumeAt = useRef(cid ? (useAppStore.getState().progress[cid]?.pos ?? 0) : 0);
  const resumedRef = useRef(false);
  const lastSave = useRef(0);
  const [resumed, setResumed] = useState(false);
  const restart = () => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = 0; if (cid) clearProgress(cid); resumeAt.current = 0; setResumed(false); showOverlay();
  };

  const runSearch = () => {
    if (!subtitlesApiKey || !companionUrl) return;
    const req: SubtitleSearchRequest = { ...baseReq, title: subQuery.trim() || baseReq.title, languages: subLangs };
    setSubLoading(true); setSubError(null); setSubResults(null);
    getSubtitleService().searchSubtitles(req)
      .then(setSubResults)
      .catch((e) => setSubError(subErrorMessage(e)))
      .finally(() => setSubLoading(false));
  };

  const openSubs = () => {
    setSubsOpen(true); showOverlay();
    window.setTimeout(() => setFocus("SUB_SEARCH"), 60);
    if (subResults || subLoading || !subtitlesApiKey || !companionUrl) return;
    runSearch();
  };

  const toggleLang = (code: string) => {
    setSubLangs((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      return next.length ? next : prev; // no permitir cero idiomas
    });
  };

  const applySubUrl = (u: string) => {
    setSubUrl((prev) => { if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev); return u; });
    setSubsOpen(false); setFocus("PL_SUBS");
  };

  const pickSub = async (fileId: number) => {
    // Preferido (webOS): URL http real para el <track> nativo (no blob:).
    const directUrl = getSubtitleService().getSubtitleUrl(fileId);
    if (directUrl) { applySubUrl(directUrl); return; }
    // Fallback (dev/PC sin relay): descargar el contenido y crear un blob.
    setSubLoading(true); setSubError(null);
    try {
      const file = await getSubtitleService().downloadSubtitle(fileId);
      const blob = new Blob([file.content], { type: "text/vtt" });
      applySubUrl(URL.createObjectURL(blob));
    } catch (e) {
      setSubError(subErrorMessage(e));
    } finally {
      setSubLoading(false);
    }
  };

  // Activa la pista recién cargada y limpia el blob al desmontar.
  useEffect(() => {
    const v = videoRef.current; if (!v || !subUrl) return;
    const t = window.setTimeout(() => {
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) tracks[i].mode = i === tracks.length - 1 ? "showing" : "disabled";
    }, 120);
    return () => window.clearTimeout(t);
  }, [subUrl]);
  useEffect(() => () => { if (subUrl && subUrl.startsWith("blob:")) URL.revokeObjectURL(subUrl); }, [subUrl]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "PLAYER" });

  const showOverlay = () => {
    setOverlayVisible(true);
    if (overlayTimer.current !== null) window.clearTimeout(overlayTimer.current);
    overlayTimer.current = window.setTimeout(() => setOverlayVisible(false), 4500);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    let hlsInst: Hls | null = null;
    if (/\.m3u8(\?|$)/i.test(url) && Hls.isSupported()) {
      hlsInst = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInst.loadSource(url);
      hlsInst.attachMedia(video);
      hlsInst.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setError(`Error de reproducción (${d.type})`); });
      setHls(hlsInst);
    } else {
      video.src = url;
      setHls(null);
    }
    // Continuar viendo: saltar a la posición guardada en cuanto haya metadata.
    if (resumeAt.current > 5) {
      const seekOnce = () => {
        if (resumedRef.current) return;
        resumedRef.current = true;
        try { video.currentTime = resumeAt.current; setResumed(true); } catch { /* noop */ }
      };
      video.addEventListener("loadedmetadata", seekOnce, { once: true });
      video.addEventListener("canplay", seekOnce, { once: true });
    }
    video.play().catch(() => undefined);
    showOverlay();
    setFocus("PL_PLAY");
    return () => { if (hlsInst) hlsInst.destroy(); setHls(null); video.removeAttribute("src"); video.load(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onTime = () => {
      setCur(v.currentTime); setDur(v.duration || 0);
      // Guardar progreso cada ~5s para "continuar viendo".
      if (cid && v.duration && Math.abs(v.currentTime - lastSave.current) > 5) {
        lastSave.current = v.currentTime;
        saveProgress(cid, v.currentTime, v.duration);
      }
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      if (cid && v.duration) saveProgress(cid, v.currentTime, v.duration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) { showOverlay(); window.setTimeout(() => setFocus("PL_RETRY"), 60); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => undefined); else v.pause();
    showOverlay();
  };
  const seek = (d: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + d));
    showOverlay();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e)) {
        e.preventDefault();
        if (subsRef.current) { setSubsOpen(false); setFocus("PL_SUBS"); return; }
        if (tracksRef.current) { setTracksOpen(false); setFocus("PL_TRACKS"); return; }
        goBack(); return;
      }
      if (isPlayPauseKey(e)) { e.preventDefault(); togglePlay(); return; }
      if (!tracksRef.current && !subsRef.current) {
        if (e.key === "ArrowLeft") seek(-10);
        else if (e.key === "ArrowRight") seek(10);
      }
      showOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ply" ref={ref} onMouseMove={showOverlay} style={{ position: "fixed" }}>
        <video ref={videoRef} autoPlay playsInline controls={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}>
          {subUrl ? <track key={subUrl} kind="subtitles" src={subUrl} srcLang="es" label="Subtítulos" default /> : null}
        </video>
        <div className="ply-grad" style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s" }} />
        <div style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s", pointerEvents: overlayVisible ? "auto" : "none" }}>
          <div className="ply-top">
            <FocusableButton focusKey="PL_BACK" className="ply-back" onEnterPress={goBack}>
              <Icon name="arrow_back" /> Volver
            </FocusableButton>
            <div className="ply-titwrap">
              <div className="ply-tit">{title}</div>
              {meta ? <div className="ply-sub">{meta}</div> : null}
              {resumed && resumeAt.current > 5 ? <div className="ply-sub" style={{ color: "var(--accent)" }}>Continuando desde {fmt(resumeAt.current)}</div> : null}
            </div>
          </div>

          <div className="ply-center">
            <FocusableButton focusKey="PL_PLAY" className="ply-play" onEnterPress={togglePlay}>
              <Icon name={paused ? "play_arrow" : "pause"} size={64} />
            </FocusableButton>
          </div>

          <div className="ply-bottom">
            <div className="ply-seek">
              <span className="ply-time">{fmt(cur)}</span>
              <span className="ply-track"><i style={{ width: `${pct}%` }} /><span className="knob" style={{ left: `${pct}%` }} /></span>
              <span className="ply-time" style={{ textAlign: "right" }}>{fmt(dur)}</span>
            </div>
            <div className="ply-ctrls">
              <FocusableButton className="ply-btn" onEnterPress={() => seek(-10)}><Icon name="replay_10" /> 10s</FocusableButton>
              <FocusableButton className="ply-btn playing" onEnterPress={togglePlay}>
                <Icon name={paused ? "play_arrow" : "pause"} /> {paused ? "Reproducir" : "Pausa"}
              </FocusableButton>
              <FocusableButton className="ply-btn" onEnterPress={() => seek(10)}><Icon name="forward_10" /> 10s</FocusableButton>
              <FocusableButton focusKey="PL_TRACKS" className="ply-btn" onEnterPress={() => { setTracksOpen((v) => !v); showOverlay(); window.setTimeout(() => setFocus("TRK_FIRST"), 60); }}>
                <Icon name="tune" /> Audio y subtítulos
              </FocusableButton>
              <FocusableButton focusKey="PL_SUBS" className="ply-btn" onEnterPress={openSubs}>
                <Icon name="subtitles" /> Buscar subtítulos
              </FocusableButton>
              {resumeAt.current > 5 ? (
                <FocusableButton className="ply-btn" onEnterPress={restart}>
                  <Icon name="restart_alt" /> Reiniciar
                </FocusableButton>
              ) : null}
              {fav ? (
                <FocusableButton className="ply-btn" onEnterPress={() => toggleFavorite(fav)}>
                  <Icon name={isFav ? "star" : "star_border"} /> {isFav ? "En favoritos" : "Favorito"}
                </FocusableButton>
              ) : null}
            </div>
          </div>
          {tracksOpen ? <TrackMenu hls={hls} video={videoRef.current} onClose={() => { setTracksOpen(false); setFocus("PL_TRACKS"); }} /> : null}
          {subsOpen ? (
            <div className="a-trk">
              <div className="a-trk-h"><Icon name="subtitles" /> Subtítulos</div>
              {!subtitlesApiKey ? (
                <div className="a-trk-scroll"><div className="a-pdesc">Configurá tu API key de OpenSubtitles en Mis Listas para buscar subtítulos.</div></div>
              ) : !companionUrl ? (
                <div className="a-trk-scroll"><div className="a-pdesc">Para buscar subtítulos online necesitás la URL del companion en Mis Listas (OpenSubtitles bloquea el acceso directo desde la TV).</div></div>
              ) : (
                <>
                  <div className="a-sub-search">
                    <FocusableInput focusKey="SUB_SEARCH" value={subQuery} onChange={setSubQuery} placeholder="Título…" />
                    <FocusableButton className="a-trk-item" onEnterPress={runSearch}><Icon name="search" /> Buscar</FocusableButton>
                  </div>
                  <div className="a-sub-langs">
                    {SUB_LANGS.map((l) => (
                      <FocusableButton key={l.code} className={`chip ${subLangs.includes(l.code) ? "on" : ""}`} onEnterPress={() => toggleLang(l.code)}>{l.name}</FocusableButton>
                    ))}
                  </div>
                  <div className="a-trk-scroll scroll">
                    {subLoading ? (
                      <div className="a-pdesc"><span className="spinner" style={{ width: 22, height: 22, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} /> Buscando…</div>
                    ) : subError ? (
                      <div className="a-pdesc" style={{ color: "var(--err)" }}>{subError}</div>
                    ) : subResults && subResults.length ? (
                      <>
                        {subUrl ? <FocusableButton className="a-trk-item" onEnterPress={() => { setSubUrl((p) => { if (p && p.startsWith("blob:")) URL.revokeObjectURL(p); return null; }); setSubsOpen(false); setFocus("PL_SUBS"); }}>Desactivar subtítulos</FocusableButton> : null}
                        {subResults.map((r) => (
                          <FocusableButton key={r.fileId} className="a-trk-item" onEnterPress={() => pickSub(r.fileId)}>
                            <span className="a-trk-lang">{r.language}</span>
                            <span className="a-trk-rel">{r.release}{r.hearingImpaired ? " · HI" : ""}<span className="a-sub-dl"> · ⬇ {r.downloads}</span></span>
                          </FocusableButton>
                        ))}
                      </>
                    ) : subResults ? (
                      <div className="a-pdesc">Sin resultados. Probá editar el título o cambiar el idioma.</div>
                    ) : null}
                  </div>
                </>
              )}
              <FocusableButton className="a-trk-close" onEnterPress={() => { setSubsOpen(false); setFocus("PL_SUBS"); }}>Cerrar</FocusableButton>
            </div>
          ) : null}
          {error ? (
            <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div className="eo-r" style={{ textAlign: "center", color: "var(--err)" }}>{error}</div>
              <FocusableButton focusKey="PL_RETRY" className="btn primary" onEnterPress={() => { setError(null); setReloadKey((k) => k + 1); window.setTimeout(() => setFocus("PL_PLAY"), 80); }}>
                <Icon name="refresh" /> Reintentar
              </FocusableButton>
            </div>
          ) : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
