import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface Props {
  url: string | null;
  muted?: boolean;
  /** Da acceso al <video> al padre para controles (pausa/play). */
  onVideoEl?: (el: HTMLVideoElement | null) => void;
  /** Da acceso a la instancia Hls (null si el stream es nativo) para pistas. */
  onHls?: (hls: Hls | null) => void;
  /** Reporta la resolucion real del video cuando se conoce o cambia. */
  onResolution?: (width: number, height: number) => void;
  /** Reporta el bitrate (bits/s) del nivel HLS activo; 0 si no se conoce. */
  onBitrate?: (bps: number) => void;
}

export function VideoPreview({ url, muted = true, onVideoEl, onHls, onResolution, onBitrate }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );

  useEffect(() => {
    onVideoEl?.(videoRef.current);
    return () => onVideoEl?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onResolution?.(0, 0);
    onBitrate?.(0);

    const reportRes = () => {
      if (video.videoWidth > 0) onResolution?.(video.videoWidth, video.videoHeight);
    };
    video.addEventListener("loadedmetadata", reportRes);
    video.addEventListener("resize", reportRes);

    // El live de Xtream viene como .ts (MPEG-TS): Chrome no lo reproduce y no expone
    // bitrate. Probamos la variante .m3u8 con hls.js (anda en PC y TV, y da bitrate);
    // si falla, volvemos al .ts nativo (lo reproduce el player de webOS).
    const isTs = /\.ts(\?|$)/i.test(url);
    const hlsUrl = isTs ? url.replace(/\.ts(\?|$)/i, ".m3u8$1") : url;
    const canHls = /\.m3u8(\?|$)/i.test(hlsUrl) && Hls.isSupported();

    const playNative = (src: string) => {
      video.src = src;
      video.oncanplay = () => setStatus("playing");
      video.onerror = () => setStatus("error");
      onHls?.(null);
      video.play().catch(() => { /* autoplay blocked */ });
    };

    if (canHls) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // Preview: bajamos buffer para que cambiar de canal sea rapido
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      const reportLevel = (level: number) => {
        const lv = hls.levels?.[level];
        if (lv?.bitrate) onBitrate?.(lv.bitrate);
      };
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("playing");
        reportLevel(hls.currentLevel >= 0 ? hls.currentLevel : hls.firstLevel);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => reportLevel(d.level));
      // Bitrate real medido por fragmento (sirve para live sin BANDWIDTH declarado).
      hls.on(Hls.Events.FRAG_BUFFERED, (_e, d) => {
        const bytes = d.frag?.stats?.total;
        const dur = d.frag?.duration;
        if (bytes && dur) onBitrate?.(Math.round((bytes * 8) / dur));
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (isTs) {
          // La variante m3u8 no anduvo: caemos al .ts nativo.
          hls.destroy();
          if (hlsRef.current === hls) hlsRef.current = null;
          playNative(url);
          return;
        }
        setStatus("error");
      });
      onHls?.(hls);
      video.play().catch(() => { /* autoplay blocked */ });
    } else {
      playNative(url);
    }

    return () => {
      video.removeEventListener("loadedmetadata", reportRes);
      video.removeEventListener("resize", reportRes);
      onHls?.(null);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
