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
import { getMediaId, watchEmbeddedTracks, selectTrack, setSubtitleEnable, type EmbeddedTrackInfo } from "../webos/embeddedTracks";
import { diagnoseStreamError } from "../data/xtream";
import { langMatches } from "../data/langs";
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

/** bits/s → "8.4 Mbps" / "820 kbps". */
function fmtRate(bps: number): string {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(bps >= 1e7 ? 0 : 1)} Mbps`;
  return `${Math.round(bps / 1e3)} kbps`;
}
/** Alto de video → etiqueta estándar (1080p, 720p, 4K…). */
function resLabel(w: number, h: number): string {
  if (h >= 2000 || w >= 3800) return "4K";
  if (h >= 1400) return "1440p";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 540) return "576p";
  if (h > 0) return `${h}p`;
  return "";
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
    persistProgress();
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
  // Resolución real y bitrate del contenido (info en el overlay).
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);
  const [bitrate, setBitrate] = useState(0);
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
    let langApplied = false;
    // El mediaId aparece asincrónicamente al montar el pipeline: sondeamos.
    const timer = window.setInterval(() => {
      tries += 1;
      const id = getMediaId(videoRef.current);
      if (id) {
        window.clearInterval(timer);
        setEmbMediaId(id);
        cancel = watchEmbeddedTracks(id, (t) => {
          setEmbTracks(t);
          // Idioma preferido: se aplica una sola vez, apenas el demuxer
          // publica las pistas. OJO: tocar el pipeline (selectTrack /
          // setSubtitleEnable) lo puede dejar pausado — hay que "empujarlo"
          // con play() después (igual que hace TrackSheet con nudgePlay).
          if (langApplied) return;
          langApplied = true;
          // En modo Felix se fuerza español latino sin subtítulos (los nenes
          // no leen); fuera del modo rigen las preferencias del usuario.
          const st = useAppStore.getState();
          const prefAudioLang = st.kidsMode ? "es" : st.prefAudioLang;
          const prefSubLang = st.kidsMode ? "off" : st.prefSubLang;
          window.setTimeout(() => {
            let touched = false;
            if (prefAudioLang) {
              const a = t.audio.find((x) => langMatches(x.language, prefAudioLang));
              // index 0 suele ser la pista por defecto: no tocar de gusto.
              if (a && a.index > 0) { selectTrack(id, "audio", a.index); touched = true; }
            }
            if (prefSubLang && prefSubLang !== "off") {
              const s = t.subs.find((x) => langMatches(x.language, prefSubLang));
              if (s) { selectTrack(id, "text", s.index); setSubtitleEnable(id, true); touched = true; }
            }
            // "off" no necesita acción: el pipeline arranca sin subtítulos.
            if (touched) videoRef.current?.play().catch(() => undefined);
          }, 600);
        }, (keys) => console.info("[pipeline]", keys));
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
  const showNextRef = useRef(false); showNextRef.current = showNext;
  const [nextIn, setNextIn] = useState<number | null>(null);
  const nextItem = useMemo(() => {
    const idx = playQueue.findIndex((q) => q.url === url);
    return idx >= 0 && idx + 1 < playQueue.length ? playQueue[idx + 1] : null;
  }, [playQueue, url]);
  const goNext = () => {
    if (!nextItem) return;
    persistProgress();
    setShowNext(false);
    navigate(nextItem.route);
    window.setTimeout(() => {
      if (window.location.hash !== `#${nextItem.route}`) window.location.hash = `#${nextItem.route}`;
    }, 60);
  };
  useEffect(() => {
    if (showNext) focusWhenReady("PL_NEXT");
  }, [showNext]);

  const cancelNext = () => {
    setShowNext(false);
    setNextIn(null);
    focusWhenReady("PL_SEEK");
  };

  // Cuenta regresiva: a los 10s reproduce el siguiente episodio solo.
  useEffect(() => {
    if (!showNext || !nextItem) { setNextIn(null); return; }
    setNextIn(10);
    const t = window.setInterval(() => {
      setNextIn((n) => {
        if (n === null) return n;
        if (n <= 1) { window.clearInterval(t); goNext(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Última posición/duración conocidas: el cleanup no puede leer el <video>
  // (ya está reseteado) y en webOS duration puede ser Infinity.
  const lastPos = useRef(0);
  const lastDur = useRef(0);
  const persistProgress = () => {
    if (cid && lastPos.current > 0) saveProgress(cid, lastPos.current, lastDur.current);
  };
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
      // Idioma preferido de audio/subtítulos (si el stream trae variantes).
      // En modo Felix: español latino y sin subtítulos, siempre.
      const applyLangPrefs = (h: Hls) => {
        const st = useAppStore.getState();
        const prefAudioLang = st.kidsMode ? "es" : st.prefAudioLang;
        const prefSubLang = st.kidsMode ? "off" : st.prefSubLang;
        if (prefAudioLang) {
          const i = h.audioTracks.findIndex((t) => langMatches(t.lang ?? t.name, prefAudioLang));
          if (i >= 0 && h.audioTrack !== i) h.audioTrack = i;
        }
        if (prefSubLang === "off") h.subtitleTrack = -1;
        else if (prefSubLang) {
          const i = h.subtitleTracks.findIndex((t) => langMatches(t.lang ?? t.name, prefSubLang));
          if (i >= 0) { h.subtitleTrack = i; h.subtitleDisplay = true; }
        }
      };
      // Bitrate del nivel HLS activo + medición real por fragmento.
      const inst = hlsInst;
      inst.on(Hls.Events.MANIFEST_PARSED, () => applyLangPrefs(inst));
      inst.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => applyLangPrefs(inst));
      inst.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => applyLangPrefs(inst));
      const reportLevel = (level: number) => { const lv = inst.levels?.[level]; if (lv?.bitrate) setBitrate(lv.bitrate); };
      inst.on(Hls.Events.MANIFEST_PARSED, () => reportLevel(inst.currentLevel >= 0 ? inst.currentLevel : inst.firstLevel));
      inst.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => reportLevel(d.level));
      inst.on(Hls.Events.FRAG_BUFFERED, (_e, d) => {
        const bytes = d.frag?.stats?.total; const fd = d.frag?.duration;
        if (bytes && fd) setBitrate(Math.round((bytes * 8) / fd));
      });
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

  // Reintentar el modo nativo cuando cambia el contenido; resetear info.
  useEffect(() => { setNativeSrcFailed(false); setRes(null); setBitrate(0); }, [url]);

  // Resolución real del video (sirve para HLS y archivos nativos).
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onMeta = () => { if (v.videoWidth > 0) setRes({ w: v.videoWidth, h: v.videoHeight }); };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("resize", onMeta);
    return () => { v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("resize", onMeta); };
  }, [reloadKey]);

  // Bitrate de archivos directos (pelis/series mp4/mkv), SIN tocar la red:
  // se estima con los bytes decodificados por el propio reproductor.
  // OJO: la versión anterior hacía un fetch(Range) al MISMO stream — una
  // segunda conexión que los paneles Xtream con límite matan cortando la
  // reproducción original (pantalla negra a los pocos segundos).
  useEffect(() => {
    if (isHls) return;
    const v = videoRef.current as (HTMLVideoElement & {
      webkitVideoDecodedByteCount?: number;
      webkitAudioDecodedByteCount?: number;
    }) | null;
    if (!v || typeof v.webkitVideoDecodedByteCount !== "number") return;
    let prevBytes = 0;
    let prevT = 0;
    const timer = window.setInterval(() => {
      const bytes = (v.webkitVideoDecodedByteCount ?? 0) + (v.webkitAudioDecodedByteCount ?? 0);
      const t = v.currentTime;
      if (prevT > 0 && t > prevT && bytes > prevBytes) {
        setBitrate(Math.round(((bytes - prevBytes) * 8) / (t - prevT)));
      }
      prevBytes = bytes;
      prevT = t;
    }, 4000);
    return () => window.clearInterval(timer);
  }, [url, reloadKey, isHls]);

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
      if (v.currentTime > 0) lastPos.current = v.currentTime;
      if (isFinite(v.duration) && v.duration > 0) lastDur.current = v.duration;
      // Guardar progreso cada ~5s para "continuar viendo".
      if (cid && Math.abs(v.currentTime - lastSave.current) > 5) {
        lastSave.current = v.currentTime;
        saveProgress(cid, v.currentTime, lastDur.current);
      }
    };
    const onPlay = () => setPaused(false);
    const onPause = () => { setPaused(true); persistProgress(); };
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
      persistProgress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) { showOverlay(); focusWhenReady("PL_RETRY"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Diagnóstico real del fallo: ¿conexiones al límite? ¿cuenta vencida?
  const source = useAppStore((s) => s.source);
  const [errDetail, setErrDetail] = useState<string | null>(null);
  useEffect(() => {
    if (!error) { setErrDetail(null); return; }
    if (source?.kind !== "xtream") return;
    let alive = true;
    diagnoseStreamError(source).then((d) => { if (alive && d) setErrDetail(d); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => undefined); else v.pause();
    showOverlay();
  };

  // ===== Seek acumulado con aceleración =====
  // Cada escritura de currentTime rebuffera el pipeline de webOS: acumulamos
  // el salto mientras se aprieta (la barra se mueve sola) y lo aplicamos UNA
  // vez al soltar (450 ms sin pulsaciones).
  const pendingSeek = useRef<number | null>(null);
  const [pendingUi, setPendingUi] = useState<number | null>(null);
  const seekApply = useRef<number | null>(null);
  const burst = useRef({ n: 0, at: 0, dir: 0 });

  const queueSeek = (deltaS: number) => {
    const v = videoRef.current; if (!v) return;
    // Tope de avance: duración conocida, o el rango seekable real (el pipeline
    // nativo de webOS reporta duration Infinity/NaN en MKV/TS — saltar más
    // allá del final dispararía "ended" y el auto-siguiente-episodio).
    let max = Number.MAX_SAFE_INTEGER;
    if (isFinite(v.duration) && v.duration > 0) max = Math.max(0, v.duration - 2);
    else if (v.seekable && v.seekable.length) max = Math.max(0, v.seekable.end(v.seekable.length - 1) - 2);
    const base = pendingSeek.current ?? v.currentTime;
    const target = Math.max(0, Math.min(max, base + deltaS));
    pendingSeek.current = target;
    setPendingUi(target);
    if (seekApply.current) window.clearTimeout(seekApply.current);
    seekApply.current = window.setTimeout(() => {
      const t = pendingSeek.current;
      pendingSeek.current = null;
      const vv = videoRef.current;
      if (t == null || !vv) { setPendingUi(null); return; }
      vv.currentTime = t; lastPos.current = t; setCur(t);
      // Mantener el tiempo objetivo en pantalla hasta que el seek termine:
      // si lo soltamos ya, timeupdate pisa la barra con la posición vieja
      // mientras el pipeline todavía está saltando (la barra "rebota").
      const clear = () => { setPendingUi(null); vv.removeEventListener("seeked", clear); };
      vv.addEventListener("seeked", clear);
      window.setTimeout(clear, 2500); // por si el pipeline nunca emite seeked
    }, 450);
    showOverlay();
  };
  const seek = (d: number) => queueSeek(d);
  useEffect(() => () => { if (seekApply.current) window.clearTimeout(seekApply.current); }, []);

  // Flecha sostenida en la barra: el paso crece 10 → 30 → 60 → 120 s.
  // Cambiar de dirección arranca la aceleración de cero (retroceder tras
  // adelantar mucho no debe pegar saltos de 2 minutos).
  const accelSeek = (dir: 1 | -1) => {
    const nowT = Date.now();
    if (nowT - burst.current.at > 700 || burst.current.dir !== dir) burst.current.n = 0;
    burst.current = { n: burst.current.n + 1, at: nowT, dir };
    const n = burst.current.n;
    const step = n <= 3 ? 10 : n <= 8 ? 30 : n <= 14 ? 60 : 120;
    queueSeek(dir * step);
  };

  // Back: la hoja de pistas (si está abierta) lo consume con su propio useBack;
  // con el overlay de "siguiente episodio" visible, cancela la cuenta regresiva.
  useBack(() => {
    if (showNextRef.current) { cancelNext(); return; }
    goBack();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPlayPauseKey(e)) { e.preventDefault(); togglePlay(); return; }
      // Botones dedicados ⏪/⏩ del control: siempre saltan. Las flechas ya NO:
      // solo navegan foco (el seek con flechas vive en la barra de tiempo).
      if (e.keyCode === RemoteKey.FastForward) { e.preventDefault(); seek(30); }
      else if (e.keyCode === RemoteKey.Rewind) { e.preventDefault(); seek(-30); }
      else {
        // 0–9: salto directo al 0%…90% de la duración (con la hoja de pistas cerrada).
        const k = e.keyCode;
        const digit = k >= 48 && k <= 57 ? k - 48 : k >= 96 && k <= 105 ? k - 96 : -1;
        if (digit >= 0 && !tracksRef.current && !showNextRef.current) {
          const v = videoRef.current;
          if (v && isFinite(v.duration) && v.duration > 0) {
            e.preventDefault();
            v.currentTime = (v.duration * digit) / 10;
          }
        }
      }
      showOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownCur = pendingUi ?? cur;
  const pct = dur > 0 ? (shownCur / dur) * 100 : 0;

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
              {res || bitrate ? (
                <div className="ply-stat">
                  {res ? <span className="ply-stat-c">{resLabel(res.w, res.h)}</span> : null}
                  {res ? <span className="ply-stat-d">{res.w}×{res.h}</span> : null}
                  {bitrate ? <span className="ply-stat-c">{fmtRate(bitrate)}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ply-center">
            <FocusableButton focusKey="PL_PLAY" className="ply-play" onEnterPress={togglePlay}>
              <Icon name={paused ? "play_arrow" : "pause"} size={64} />
            </FocusableButton>
          </div>

          <div className="ply-bottom">
            <div className="ply-seek">
              <span className={`ply-time ${pendingUi != null ? "pending" : ""}`}>{fmt(shownCur)}</span>
              <FocusableButton
                focusKey="PL_SEEK"
                className="ply-seekbar"
                onEnterPress={togglePlay}
                onArrowPress={(dir) => {
                  if (dir === "left") { accelSeek(-1); return false; }
                  if (dir === "right") { accelSeek(1); return false; }
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
                <>
                  <FocusableButton focusKey="PL_NEXT" className="btn primary" onEnterPress={goNext}>
                    <Icon name="skip_next" /> Siguiente: {nextItem.label}{nextIn !== null ? ` · ${nextIn}s` : ""}
                  </FocusableButton>
                  <FocusableButton className="btn" onEnterPress={cancelNext}>
                    Cancelar
                  </FocusableButton>
                </>
              ) : null}
              <FocusableButton focusKey={nextItem ? undefined : "PL_NEXT"} className="btn" onEnterPress={goBack}>
                <Icon name="arrow_back" /> Volver
              </FocusableButton>
            </div>
          ) : null}
          {error ? (
            <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div className="eo-r" style={{ textAlign: "center", color: "var(--err)" }}>{errDetail ?? error}</div>
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
