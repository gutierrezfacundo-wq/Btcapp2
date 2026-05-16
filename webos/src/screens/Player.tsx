import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { isBackKey, isPlayPauseKey } from "../webos/remote-keys";

export function Player() {
  const [params] = useSearchParams();
  const url = params.get("url") ?? "";
  const title = params.get("title") ?? "";
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayTimer = useRef<number | null>(null);

  const showOverlay = () => {
    setOverlayVisible(true);
    if (overlayTimer.current !== null) window.clearTimeout(overlayTimer.current);
    overlayTimer.current = window.setTimeout(() => setOverlayVisible(false), 4000);
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
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setError(`Error de reproducción (${data.type})`);
      });
    } else {
      video.src = url;
    }

    video.play().catch(() => {
      /* autoplay block — usuario presiona OK para reanudar */
    });
    showOverlay();

    return () => {
      if (hls) hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e)) {
        e.preventDefault();
        navigate(-1);
        return;
      }
      if (isPlayPauseKey(e)) {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play();
        else v.pause();
        showOverlay();
        return;
      }
      showOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="player-wrap" onMouseMove={showOverlay}>
      <video ref={videoRef} autoPlay playsInline controls={false} />
      <div className={`player-overlay ${overlayVisible ? "" : "hidden"}`}>
        <div className="title">{title}</div>
        {error ? <div className="error" style={{ padding: 0 }}>{error}</div> : null}
      </div>
    </div>
  );
}
