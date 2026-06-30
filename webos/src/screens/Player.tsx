import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
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
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
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
    let hls: Hls | null = null;
    const looksLikeHls = /\.m3u8(\?|$)/i.test(url);
    if (looksLikeHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setError(`Error de reproducción (${d.type})`); });
    } else {
      video.src = url;
    }
    video.play().catch(() => undefined);
    showOverlay();
    setFocus("PL_PLAY");
    return () => {
      if (hls) hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
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
  const seek = (delta: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
    showOverlay();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e)) { e.preventDefault(); navigate(-1); return; }
      if (isPlayPauseKey(e)) { e.preventDefault(); togglePlay(); return; }
      if (e.key === "ArrowLeft") seek(-10);
      else if (e.key === "ArrowRight") seek(10);
      showOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="player-aurora" ref={ref} onMouseMove={showOverlay}>
        <video ref={videoRef} autoPlay playsInline controls={false} className="player-video" />
        <div className={`pl-overlay ${overlayVisible ? "" : "hidden"}`}>
          <div className="pl-top">
            <FocusableButton className="a-railbtn" onEnterPress={() => navigate(-1)}>
              <Icon name="arrow_back" />
            </FocusableButton>
            <div className="pl-title">{title}</div>
          </div>

          <div className="pl-center">
            <FocusableButton focusKey="PL_PLAY" className="pl-bigplay" onEnterPress={togglePlay}>
              <Icon name={paused ? "play_arrow" : "pause"} />
            </FocusableButton>
          </div>

          <div className="pl-bottom">
            <div className="pl-times">
              <span>{fmt(cur)}</span>
              <span className="pl-bar"><i style={{ width: `${pct}%` }} /></span>
              <span>{fmt(dur)}</span>
            </div>
            <div className="pl-ctrls">
              <FocusableButton className="btn hot-ctrl" onEnterPress={() => seek(-10)}>
                <Icon name="replay_10" /> -10s
              </FocusableButton>
              <FocusableButton className="btn hot-ctrl primary" onEnterPress={togglePlay}>
                <Icon name={paused ? "play_arrow" : "pause"} /> {paused ? "Reproducir" : "Pausa"}
              </FocusableButton>
              <FocusableButton className="btn hot-ctrl" onEnterPress={() => seek(10)}>
                <Icon name="forward_10" /> +10s
              </FocusableButton>
            </div>
          </div>

          {error ? <div className="pl-error"><Icon name="wifi_off" /> {error}</div> : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
