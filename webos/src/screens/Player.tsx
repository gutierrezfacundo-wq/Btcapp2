import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
import { TrackSheet } from "../components/TrackSheet";
import { useAppStore, type FavoriteItem } from "../store/useAppStore";
import { decodeB64Url } from "../data/b64url";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";
import { getMediaId, watchEmbeddedTracks, type EmbeddedTrackInfo } from "../webos/embeddedTracks";
import { isPlayPauseKey, RemoteKey } from "../webos/remote-keys";

/** Estado que viaja DENTRO de la URL (?st=): location.state se pierde en webOS. */
export interface PlayerRouteState {
  from?: string;
  cid?: string;
  fav?: FavoriteItem;
}

const IS_WEBOS = typeof navigator !== "undefined"
  && (/web0s|webos/i.test(navigator.userAgent) || typeof (window as unknown as { webOS?: unknown }).webOS !== "undefined");

/** MIME por extensión: le da a webOS la pista del formato para demuxear bien. */
function mimeForUrl(u: string): string {
  const ext = (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  switch (ext) {
    case "mkv": return "video/x-matroska";
    case "ts": return "video/mp2t";
    case "avi": return "video/x-msvideo";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    default: return "video/mp4";
  }
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
  // Estado de la ruta: preferimos ?st= (sobrevive en webOS y en "Seguir viendo");
  // location.state queda como compat con rutas viejas.
  const stParam = params.get("st");
  const rst: PlayerRouteState = (stParam ? decodeB64Url<PlayerRouteState>(stParam) : null)
    ?? (location.state as PlayerRouteState | null)
    ?? {};
  const from = rst.from;
  // navegación normal + fallback por hash para el HashRouter de webOS.
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

  // Pistas embebidas (pipeline webOS): suscribirse APENAS arranca el video,
  // porque el pipeline anuncia sourceInfo una sola vez al cargar.
  const [embTracks, setEmbTracks] = useState<EmbeddedTrackInfo | null>(null);
  const [embMediaId, setEmbMediaId] = useState<string | null>(null);
  useEffect(() => {
    if (!IS_WEBOS) return;
    let cancel: (() => void) | undefined;
    let tries = 0;
    // El mediaId aparece asincrónicamente al montar el pipeline: sondeamos.
    const timer = window.setInterval(() => {
      tries += 1;
      const id = getMediaId(videoRef.current);
      if (id) {
        window.clearInterval(timer);
        setEmbMediaId(id);
        cancel = watchEmbeddedTracks(id, setEmbTracks, (keys) => console.info("[pipeline]", keys));
      } else if (tries > 40) {
        window.clearInterval(timer);
        console.info("[pipeline] sin mediaId");
      }
    }, 250);
    return () => { window.clearInterval(timer); cancel?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  // ===== Subtítulos (vía SubtitleService, agnóstico del proveedor) =====
  const nativeSubs = useAppStore((s) => s.nativeSubs);
  const isHls = /\.m3u8(\?|$)/i.test(url);
  const [nativeSrcFailed, setNativeSrcFailed] = useState(false);
  // En webOS, un <source> con MIME correcto usa el pipeline nativo y ayuda a que
  // exponga/renderice los subtítulos embebidos. Fallback a video.src si falla.
  const useNativeSource = IS_WEBOS && nativeSubs && !isHls && !nativeSrcFailed;

  // ===== Siguiente episodio (cola armada por SeriesDetail) =====
  const playQueue = useAppStore((s) => s.playQueue);
  const [showNext, setShowNext] = useState(false);
  const nextItem = useMemo(() => {
    const idx = playQueue.findIndex((q) => q.url === url);
    return idx >= 0 && idx + 1 < playQueue.length ? playQueue[idx + 1] : null;
  }, [playQueue, url]);
  const goNext = () => {
    if (!nextItem) return;
    setShowNext(false);
    navigate(nextItem.route);
    window.setTimeout(() => {
      if (window.location.hash !== `#${nextItem.route}`) window.location.hash = `#${nextItem.route}`;
    }, 60);
  };
  useEffect(() => {
    if (showNext) focusWhenReady("PL_NEXT");
  }, [showNext]);

  // ===== Favoritos / Continuar viendo =====
  const cid = rst.cid;
  const fav = rst.fav;
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
    if (isHls && Hls.isSupported()) {
      hlsInst = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInst.loadSource(url);
      hlsInst.attachMedia(video);
      hlsInst.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setError(`Error de reproducción (${d.type})`); });
      setHls(hlsInst);
    } else if (useNativeSource) {
      // El <source> declarativo (con MIME) maneja la fuente; solo cargamos.
      setHls(null);
      video.load();
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
    focusWhenReady("PL_PLAY");
    return () => { if (hlsInst) hlsInst.destroy(); setHls(null); video.removeAttribute("src"); video.load(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  // Reintentar el modo nativo cuando cambia el contenido.
  useEffect(() => { setNativeSrcFailed(false); }, [url]);

  // Si el <source> nativo falló, caemos a video.src (reproducción segura).
  useEffect(() => {
    if (!nativeSrcFailed) return;
    const v = videoRef.current; if (!v) return;
    v.src = url; v.load(); v.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeSrcFailed]);

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
    const onEnded = () => { setShowNext(true); showOverlay(); };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      if (cid && v.duration) saveProgress(cid, v.currentTime, v.duration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) { showOverlay(); focusWhenReady("PL_RETRY"); }
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

  // Back: la hoja de pistas (si está abierta) lo consume con su propio useBack.
  useBack(() => { goBack(); });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPlayPauseKey(e)) { e.preventDefault(); togglePlay(); return; }
      // Botones dedicados ⏪/⏩ del control: siempre saltan. Las flechas ya NO:
      // solo navegan foco (el seek con flechas vive en la barra de tiempo).
      if (e.keyCode === RemoteKey.FastForward) { e.preventDefault(); seek(30); }
      else if (e.keyCode === RemoteKey.Rewind) { e.preventDefault(); seek(-30); }
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
          onError={() => { if (useNativeSource && (videoRef.current?.readyState ?? 0) === 0) setNativeSrcFailed(true); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}>
          {useNativeSource ? <source src={url} type={mimeForUrl(url)} /> : null}
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
              <FocusableButton
                focusKey="PL_SEEK"
                className="ply-seekbar"
                onEnterPress={togglePlay}
                onArrowPress={(dir) => {
                  if (dir === "left") { seek(-10); return false; }
                  if (dir === "right") { seek(10); return false; }
                  return true;
                }}
              >
                <span className="ply-track"><i style={{ width: `${pct}%` }} /><span className="knob" style={{ left: `${pct}%` }} /></span>
              </FocusableButton>
              <span className="ply-time" style={{ textAlign: "right" }}>{fmt(dur)}</span>
            </div>
            <div className="ply-ctrls">
              <FocusableButton className="ply-btn" onEnterPress={() => seek(-10)}><Icon name="replay_10" /> 10s</FocusableButton>
              <FocusableButton className="ply-btn playing" onEnterPress={togglePlay}>
                <Icon name={paused ? "play_arrow" : "pause"} /> {paused ? "Reproducir" : "Pausa"}
              </FocusableButton>
              <FocusableButton className="ply-btn" onEnterPress={() => seek(10)}><Icon name="forward_10" /> 10s</FocusableButton>
              <FocusableButton focusKey="PL_TRACKS" className="ply-btn" onEnterPress={() => { setTracksOpen((v) => !v); showOverlay(); }}>
                <Icon name="tune" /> Audio y subtítulos
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
          {tracksOpen ? <TrackSheet hls={hls} video={videoRef.current} embedded={embTracks} embeddedMediaId={embMediaId} onClose={() => { setTracksOpen(false); focusWhenReady("PL_TRACKS"); }} /> : null}
          {showNext ? (
            <div className="ply-next">
              <div className="ply-next-t">Fin del episodio</div>
              {nextItem ? (
                <FocusableButton focusKey="PL_NEXT" className="btn primary" onEnterPress={goNext}>
                  <Icon name="skip_next" /> Siguiente: {nextItem.label}
                </FocusableButton>
              ) : null}
              <FocusableButton focusKey={nextItem ? undefined : "PL_NEXT"} className="btn" onEnterPress={goBack}>
                <Icon name="arrow_back" /> Volver
              </FocusableButton>
            </div>
          ) : null}
          {error ? (
            <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div className="eo-r" style={{ textAlign: "center", color: "var(--err)" }}>{error}</div>
              <FocusableButton focusKey="PL_RETRY" className="btn primary" onEnterPress={() => { setError(null); setReloadKey((k) => k + 1); focusWhenReady("PL_PLAY"); }}>
                <Icon name="refresh" /> Reintentar
              </FocusableButton>
            </div>
          ) : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
