import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
import { TrackMenu } from "../components/TrackMenu";
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
  const [tracksOpen, setTracksOpen] = useState(false);
  const tracksRef = useRef(false); tracksRef.current = tracksOpen;
  const overlayTimer = useRef<number | null>(null);

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
    video.play().catch(() => undefined);
    showOverlay();
    setFocus("PL_PLAY");
    return () => { if (hlsInst) hlsInst.destroy(); setHls(null); video.removeAttribute("src"); video.load(); };
  }, [url]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onTime = () => { setCur(v.currentTime); setDur(v.duration || 0); };
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
    };
  }, []);

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
        if (tracksRef.current) { setTracksOpen(false); setFocus("PL_TRACKS"); return; }
        goBack(); return;
      }
      if (isPlayPauseKey(e)) { e.preventDefault(); togglePlay(); return; }
      if (!tracksRef.current) {
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
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        <div className="ply-grad" style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s" }} />
        <div style={{ opacity: overlayVisible ? 1 : 0, transition: "opacity .25s", pointerEvents: overlayVisible ? "auto" : "none" }}>
          <div className="ply-top">
            <FocusableButton className="ply-back" onEnterPress={goBack}>
              <Icon name="arrow_back" /> Volver
            </FocusableButton>
            <div className="ply-titwrap">
              <div className="ply-tit">{title}</div>
              {meta ? <div className="ply-sub">{meta}</div> : null}
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
            </div>
          </div>
          {tracksOpen ? <TrackMenu hls={hls} video={videoRef.current} onClose={() => { setTracksOpen(false); setFocus("PL_TRACKS"); }} /> : null}
          {error ? <div className="eo-r" style={{ position: "absolute", bottom: 180, left: 0, right: 0, textAlign: "center", color: "var(--err)" }}>{error}</div> : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
