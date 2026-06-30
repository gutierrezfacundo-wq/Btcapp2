import { useEffect, useState } from "react";
import type Hls from "hls.js";
import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";

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
  return Array.from(list).filter((t) => t.kind === "subtitles" || t.kind === "captions");
}

function trackLabel(t: { label?: string; language?: string }, i: number, kind: string) {
  return t.label || t.language || `${kind} ${i + 1}`;
}

/** Panel lateral de pistas: Calidad (HLS) / Audio / Subtítulos. Soporta HLS y video nativo (VOD mp4/mkv). */
export function TrackMenu({ hls, video, onClose }: { hls: Hls | null; video?: HTMLVideoElement | null; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

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

  if (!audio.length && !subs.length) {
    return (
      <div className="a-trk">
        <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
        <div className="a-trk-scroll"><div className="a-pdesc">Este contenido no expone pistas de audio ni subtítulos alternativas.</div></div>
        <FocusableButton focusKey="TRK_FIRST" className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
      </div>
    );
  }

  return (
    <div className="a-trk">
      <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
      <div className="a-trk-scroll scroll">
        {audio.length ? <div className="a-trk-sec">Audio</div> : null}
        {audio.map((t, i) => (
          <FocusableButton key={i} focusKey={i === 0 ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => setAudio(i)}>
            {trackLabel(t, i, "Pista")} {activeAudio === i ? <Icon name="check" /> : null}
          </FocusableButton>
        ))}
        {subs.length ? <div className="a-trk-sec">Subtítulos</div> : null}
        {subs.length ? (
          <FocusableButton focusKey={!audio.length ? "TRK_FIRST" : undefined} className="a-trk-item" onEnterPress={() => setSub(-1)}>
            Desactivados {activeSub === -1 ? <Icon name="check" /> : null}
          </FocusableButton>
        ) : null}
        {subs.map((t, i) => (
          <FocusableButton key={i} className="a-trk-item" onEnterPress={() => setSub(i)}>
            {trackLabel(t, i, "Sub")} {activeSub === i ? <Icon name="check" /> : null}
          </FocusableButton>
        ))}
      </div>
      <FocusableButton className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
    </div>
  );
}
