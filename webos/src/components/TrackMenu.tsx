import { useState } from "react";
import type Hls from "hls.js";
import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";

/** Panel lateral de pistas: Calidad (niveles HLS) / Audio / Subtítulos. */
export function TrackMenu({ hls, onClose }: { hls: Hls | null; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  if (!hls) {
    return (
      <div className="a-trk">
        <div className="a-trk-h"><Icon name="tune" /> Pistas</div>
        <div className="a-trk-scroll"><div className="a-pdesc">Este stream no permite cambiar calidad, audio ni subtítulos.</div></div>
        <FocusableButton focusKey="TRK_FIRST" className="a-trk-close" onEnterPress={onClose}>Cerrar</FocusableButton>
      </div>
    );
  }
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
