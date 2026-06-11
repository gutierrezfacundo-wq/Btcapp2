import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface Props {
  url: string | null;
  muted?: boolean;
}

export function VideoPreview({ url, muted = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );

  useEffect(() => {
    // Limpiar instancia anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (!video || !url) {
      setStatus("idle");
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
      return;
    }

    setStatus("loading");
    const looksLikeHls = /\.m3u8(\?|$)/i.test(url);

    if (looksLikeHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // Preview: bajamos buffer para que cambiar de canal sea rapido
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus("playing"));
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setStatus("error");
      });
    } else {
      video.src = url;
      video.oncanplay = () => setStatus("playing");
      video.onerror = () => setStatus("error");
    }

    video.play().catch(() => {
      /* autoplay blocked */
    });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  return (
    <div className="video-preview">
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
      />
      {status === "idle" && !url ? (
        <div className="video-preview-placeholder">
          Seleccioná un canal
        </div>
      ) : null}
      {status === "loading" ? (
        <div className="video-preview-overlay">
          <div className="spinner" />
        </div>
      ) : null}
      {status === "error" ? (
        <div className="video-preview-overlay error">No se pudo cargar el stream</div>
      ) : null}
    </div>
  );
}
