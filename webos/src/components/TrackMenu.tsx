import { useEffect, useState } from "react";
import type Hls from "hls.js";
import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";
import { getMediaId, selectTrack, setSubtitleEnable, watchEmbeddedTracks, type EmbeddedTrackInfo } from "../webos/embeddedTracks";

const LANG_NAMES: Record<string, string> = {
  es: "Español", spa: "Español", en: "Inglés", eng: "Inglés", pt: "Portugués", por: "Portugués",
  fr: "Francés", fre: "Francés", fra: "Francés", it: "Italiano", ita: "Italiano", de: "Alemán", ger: "Alemán", deu: "Alemán",
};
function langLabel(code: string | undefined, i: number, kind: string) {
  if (!code) return `${kind} ${i + 1}`;
  return LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Tipos nativos minimos (audioTracks no esta en lib.dom estandar). */
interface NativeAudioTrack { id?: string; label?: string; language?: string; enabled: boolean }
interface NativeAudioTrackList { length: number; [i: number]: NativeAudioTrack }

function nativeAudio(video: HTMLVideoElement | null): NativeAudioTrack[] {
  const list = (video as unknown as { audioTracks?: NativeAudioTrackList })?.audioTracks;
  if (!list || !list.length) return [];
  return Array.from({ length: list.length }, (_, i) => list[i]);
}
function nativeSubs(video: HTMLVideoElement | null): TextTrack[] {
  const list = video?.textTracks;
  if (!list || !list.length) return [];
  // webOS suele exponer subtitulos embebidos con kind vacio o no estandar:
  // incluimos todo lo que no sea metadata/chapters (que no son subtitulos).
  return Array.from(list).filter((t) => t.kind !== "metadata" && t.kind !== "chapters");
}

function trackLabel(t: { label?: string; language?: string }, i: number, kind: string) {
  return t.label || t.language || `${kind} ${i + 1}`;
}

/** Panel lateral de pistas: Calidad (HLS) / Audio / Subtítulos. Soporta HLS y video nativo (VOD mp4/mkv). */
export function TrackMenu({ hls, video, onClose }: { hls: Hls | null; video?: HTMLVideoElement | null; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // Pistas embebidas vía el pipeline de webOS (luna://com.webos.media): es lo
  // que ve el decodificador de la TV, aunque textTracks/audioTracks estén vacíos.
  const [emb, setEmb] = useState<EmbeddedTrackInfo | null>(null);
  const [embSub, setEmbSub] = useState(-1);   // índice elegido (-1 = desactivado)
  const [embAud, setEmbAud] = useState(0);
  const mediaId = !hls && video ? getMediaId(video) : null;
  useEffect(() => {
    if (!mediaId) return;
    return watchEmbeddedTracks(mediaId, setEmb);
  }, [mediaId]);
  const pickEmbSub = (i: number) => {
    if (!mediaId) return;
    if (i < 0) setSubtitleEnable(mediaId, false);
    else { setSubtitleEnable(mediaId, true); selectTrack(mediaId, "text", i); }
    setEmbSub(i);
  };
  const pickEmbAud = (i: number) => {
    if (!mediaId) return;
    selectTrack(mediaId, "audio", i);
    setEmbAud(i);
  };

  // En video nativo las pistas suelen poblarse despues de loadedmetadata:
  // re-renderizamos cuando cambian las listas para que aparezcan sin reabrir.
  useEffect(() => {
    if (hls || !video) return;
    const aud = (video as unknown as { audioTracks?: EventTarget }).audioTracks;
    const txt = video.textTracks as unknown as EventTarget | undefined;
    const on = () => refresh();
    aud?.addEventListener?.("addtrack", on);
    aud?.addEventListener?.("removetrack", on);
    aud?.addEventListener?.("change", on);
    txt?.addEventListener?.("addtrack", on);
    txt?.addEventListener?.("change", on);
    video.addEventListener("loadedmetadata", on);
    return () => {
      aud?.removeEventListener?.("addtrack", on);
      aud?.removeEventListener?.("removetrack", on);
      aud?.removeEventListener?.("change", on);
      txt?.removeEventListener?.("addtrack", on);
      txt?.removeEventListener?.("change", on);
      video.removeEventListener("loadedmetadata", on);
    };
  }, [hls, video]);

  // ===== HLS (en vivo / streams .m3u8) =====
  if (hls) {
    const levels = hls.levels ?? [];
    const audio = hls.audioTracks ?? [];
    const subs = hls.subtitleTracks ?? [];
    return (
      <div className="a-trk">
        <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
        <div className="a-trk-scroll scroll">
          <div className="a-trk-sec">Calidad</div>
          <FocusableButton focusKey="TRK_FIRST" className="a-trk-item" onEnterPress={() => { hls.currentLevel = -1; refresh(); }}>Auto {hls.autoLevelEnabled ? <Icon name="check" /> : null}</FocusableButton>
          {levels.map((l, i) => (
            <FocusableButton key={i} className="a-trk-item" onEnterPress={() => { hls.currentLevel = i; refresh(); }}>
              {l.height ? `${l.height}p` : `${Math.round((l.bitrate ?? 0) / 1000)}k`} {!hls.autoLevelEnabled && hls.currentLevel === i ? <Icon name="check" /> : null}
            </FocusableButton>
          ))}
          {audio.length ? <div className="a-trk-sec">Audio</div> : null}
          {audio.map((t, i) => (
            <FocusableButton key={i} className="a-trk-item" onEnterPress={() => { hls.audioTrack = i; refresh(); }}>{t.name || t.lang || `Pista ${i + 1}`} {hls.audioTrack === i ? <Icon name="check" /> : null}</FocusableButton>
          ))}
          <div className="a-trk-sec">Subtítulos</div>
          <FocusableButton className="a-trk-item" onEnterPress={() => { hls.subtitleTrack = -1; refresh(); }}>Desactivados {hls.subtitleTrack === -1 ? <Icon name="check" /> : null}</FocusableButton>
          {subs.map((t, i) => (
            <FocusableButton key={i} className="a-trk-item" onEnterPress={() => { hls.subtitleTrack = i; refresh(); }}>{t.name || t.lang || `Sub ${i + 1}`} {hls.subtitleTrack === i ? <Icon name="check" /> : null}</FocusableButton>
          ))}
        </div>
        <FocusableButton className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
      </div>
    );
  }

  // ===== Video nativo (VOD mp4/mkv) =====
  const audio = nativeAudio(video ?? null);
  const subs = nativeSubs(video ?? null);
  const rawSubs = video?.textTracks ? Array.from(video.textTracks) : [];
  const subDiag = (rawSubs.length
    ? rawSubs.map((t, i) => `${i}:${t.kind || "?"}/${t.language || t.label || "?"}`).join("  ")
    : "ninguna")
    + ` · pipeline(${mediaId ? "ok" : "sin id"}): ${emb ? `${emb.audio.length}a/${emb.subs.length}s` : "—"}`;
  const activeAudio = audio.findIndex((t) => t.enabled);
  const activeSub = subs.findIndex((t) => t.mode === "showing");

  const setAudio = (idx: number) => {
    audio.forEach((t, i) => { t.enabled = i === idx; });
    refresh();
  };
  const setSub = (idx: number) => {
    subs.forEach((t, i) => { t.mode = i === idx ? "showing" : "disabled"; });
    refresh();
  };

  // Pistas del pipeline (embebidas): tienen prioridad porque son las que la TV
  // realmente puede renderizar (incluye subtítulos de imagen).
  const embAudio = emb?.audio ?? [];
  const embSubs = emb?.subs ?? [];
  const useEmbAudio = embAudio.length > 0;
  const useEmbSubs = embSubs.length > 0;
  const audioCount = useEmbAudio ? embAudio.length : audio.length;

  if (!audioCount && !subs.length && !useEmbSubs) {
    return (
      <div className="a-trk">
        <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
        <div className="a-trk-scroll">
          <div className="a-pdesc">Este contenido no expone pistas de audio ni subtítulos alternativas.</div>
          <div className="a-pdesc" style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>diag: {subDiag}</div>
        </div>
        <FocusableButton focusKey="TRK_FIRST" className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
      </div>
    );
  }

  return (
    <div className="a-trk">
      <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
      <div className="a-trk-scroll scroll">
        {audioCount ? <div className="a-trk-sec">Audio</div> : null}
        {useEmbAudio
          ? embAudio.map((t, i) => (
              <FocusableButton key={i} focusKey={i === 0 ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => pickEmbAud(i)}>
                {langLabel(t.language, i, "Pista")} {embAud === i ? <Icon name="check" /> : null}
              </FocusableButton>
            ))
          : audio.map((t, i) => (
              <FocusableButton key={i} focusKey={i === 0 ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => setAudio(i)}>
                {trackLabel(t, i, "Pista")} {activeAudio === i ? <Icon name="check" /> : null}
              </FocusableButton>
            ))}
        <div className="a-trk-sec">Subtítulos</div>
        {useEmbSubs ? (
          <>
            <FocusableButton focusKey={!audioCount ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => pickEmbSub(-1)}>
              Desactivados {embSub === -1 ? <Icon name="check" /> : null}
            </FocusableButton>
            {embSubs.map((t, i) => (
              <FocusableButton key={i} className="a-trk-item" onEnterPress={() => pickEmbSub(i)}>
                {langLabel(t.language, i, "Sub")} {embSub === i ? <Icon name="check" /> : null}
              </FocusableButton>
            ))}
          </>
        ) : (
          <>
            <FocusableButton focusKey={!audioCount ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => setSub(-1)}>
              Desactivados {activeSub === -1 ? <Icon name="check" /> : null}
            </FocusableButton>
            {subs.map((t, i) => (
              <FocusableButton key={i} className="a-trk-item" onEnterPress={() => setSub(i)}>
                {trackLabel(t, i, "Sub")} {activeSub === i ? <Icon name="check" /> : null}
              </FocusableButton>
            ))}
          </>
        )}
        <div className="a-pdesc" style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>diag pistas: {subDiag}</div>
      </div>
      <FocusableButton className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
    </div>
  );
}
