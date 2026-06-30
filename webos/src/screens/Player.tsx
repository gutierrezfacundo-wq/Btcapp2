import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
import { TrackMenu } from "../components/TrackMenu";
import { useAppStore, type FavoriteItem } from "../store/useAppStore";
import { searchSubtitles, downloadSubtitleVtt, type SubtitleResult } from "../data/opensubtitles";
import { isBackKey, isPlayPauseKey } from "../webos/remote-keys";

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
  // navigate(-1) es poco confiable en webOS (HashRouter); volvemos a un destino explícito.
  const from = (location.state as { from?: string } | null)?.from;
  const goBack = () => navigate(from ?? "/hub", { replace: true });

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

  // ===== Subtítulos online (OpenSubtitles) =====
  const subtitlesApiKey = useAppStore((s) => s.subtitlesApiKey);
  const [subsOpen, setSubsOpen] = useState(false);
  const subsRef = useRef(false); subsRef.current = subsOpen;
  const [subResults, setSubResults] = useState<SubtitleResult[] | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const subQuery = title.split(" · ")[0].trim();

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

  const openSubs = () => {
    setSubsOpen(true); showOverlay();
    window.setTimeout(() => setFocus("SUB_FIRST"), 60);
    if (subResults || subLoading) return;
    setSubLoading(true); setSubError(null);
    searchSubtitles(subtitlesApiKey, subQuery)
      .then((r) => setSubResults(r))
      .catch((e) => setSubError(e instanceof Error ? e.message : "Error de búsqueda"))
      .finally(() => setSubLoading(false));
  };

  const pickSub = async (fileId: number) => {
    setSubLoading(true); setSubError(null);
    try {
      const vtt = await downloadSubtitleVtt(subtitlesApiKey, fileId);
      const blob = new Blob([vtt], { type: "text/vtt" });
      setSubUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      setSubsOpen(false); setFocus("PL_SUBS");
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "No se pudo descargar");
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
  useEffect(() => () => { if (subUrl) URL.revokeObjectURL(subUrl); }, [subUrl]);

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
  }, [navigate]);

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ply" ref={ref} onMouseMove={showOverlay} style={{ position: "fixed" }}>
        <video ref={videoRef} autoPlay playsInline controls={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}>
          {subUrl ? <track kind="subtitles" src={subUrl} default /> : null}
        </video>
        <div className="ply-grad" style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s" }} />
        <div style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s", pointerEvents: overlayVisible ? "auto" : "none" }}>
          <div className="ply-top">
            <FocusableButton className="ply-back" onEnterPress={goBack}>
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
              <div className="a-trk-h"><Icon name="subtitles" /> Subtítulos · «{subQuery}»</div>
              <div className="a-trk-scroll scroll">
                {!subtitlesApiKey ? (
                  <div className="a-pdesc">Configurá tu API key de OpenSubtitles en Mis Listas para buscar subtítulos.</div>
                ) : subLoading ? (
                  <div className="a-pdesc"><span className="spinner" style={{ width: 22, height: 22, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} /> Buscando…</div>
                ) : subError ? (
                  <div className="a-pdesc" style={{ color: "var(--err)" }}>{subError}</div>
                ) : subResults && subResults.length ? (
                  <>
                    {subUrl ? <FocusableButton focusKey="SUB_FIRST" className="a-trk-item" onEnterPress={() => { setSubUrl((p) => { if (p) URL.revokeObjectURL(p); return null; }); setSubsOpen(false); setFocus("PL_SUBS"); }}>Desactivar subtítulos</FocusableButton> : null}
                    {subResults.map((r, i) => (
                      <FocusableButton key={r.fileId} focusKey={!subUrl && i === 0 ? "SUB_FIRST" : undefined} className="a-trk-item" onEnterPress={() => pickSub(r.fileId)}>
                        <span className="a-trk-lang">{r.language}</span><span className="a-trk-rel">{r.release}</span>
                      </FocusableButton>
                    ))}
                  </>
                ) : (
                  <div className="a-pdesc">Sin resultados para «{subQuery}».</div>
                )}
              </div>
              <FocusableButton focusKey={!subtitlesApiKey || subError || !subResults?.length ? "SUB_FIRST" : undefined} className="a-trk-close" onEnterPress={() => { setSubsOpen(false); setFocus("PL_SUBS"); }}>Cerrar</FocusableButton>
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
