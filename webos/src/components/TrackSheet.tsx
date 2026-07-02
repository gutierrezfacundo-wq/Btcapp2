// ============================================================
// TrackSheet — hoja inferior "Audio y subtítulos".
// REEMPLAZA a TrackMenu (columna lateral angosta) en Player y en el
// fullscreen del preview de En vivo.
//
// Diseño: ver SPEC_AUDIO_SUBTITULOS.md y el mockup
// "Audio y subtítulos.dc.html". Columnas lado a lado:
//   [Calidad (solo HLS)] · Audio · Subtítulos · [Tamaño]
// D-pad: ←→ cambia de columna (cada columna recuerda su ítem),
// ↑↓ recorre opciones, OK aplica SIN cerrar, Back cierra (useBack).
//
// Fuentes de pistas, en orden de prioridad para VOD nativo:
//   1. Pipeline de webOS (luna://com.webos.media) — pistas embebidas
//      reales que la TV puede renderizar (props embedded/embeddedMediaId,
//      observadas por el Player desde el arranque).
//   2. audioTracks/textTracks del <video> (fallback estándar).
// Estilos en styles/tracksheet.css.
// ============================================================
import { useEffect, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import { FocusableButton } from "./FocusableButton";
import { FocusZone } from "./FocusZone";
import { Icon } from "./Icon";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";
import { useAppStore } from "../store/useAppStore";
import {
  selectTrack,
  setSubtitleEnable,
  setSubtitleFontSize,
  type EmbeddedTrackInfo,
} from "../webos/embeddedTracks";

const SCALE_PX = { s: 24, m: 33, l: 44 } as const;

const LANG_NAMES: Record<string, string> = {
  es: "Español", spa: "Español", en: "Inglés", eng: "Inglés", pt: "Portugués", por: "Portugués",
  fr: "Francés", fre: "Francés", fra: "Francés", it: "Italiano", ita: "Italiano", de: "Alemán", ger: "Alemán", deu: "Alemán",
};
function langLabel(code: string | undefined, i: number, kind: string) {
  if (!code) return `${kind} ${i + 1}`;
  return LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Tipos nativos mínimos (audioTracks no está en lib.dom estándar). */
interface NativeAudioTrack {
  id?: string;
  label?: string;
  language?: string;
  enabled: boolean;
}
interface NativeAudioTrackList {
  length: number;
  [i: number]: NativeAudioTrack;
}

function nativeAudio(video: HTMLVideoElement | null): NativeAudioTrack[] {
  const list = (video as unknown as { audioTracks?: NativeAudioTrackList })
    ?.audioTracks;
  if (!list || !list.length) return [];
  return Array.from({ length: list.length }, (_, i) => list[i]);
}
function nativeSubs(video: HTMLVideoElement | null): TextTrack[] {
  const list = video?.textTracks;
  if (!list || !list.length) return [];
  return Array.from(list).filter(
    (t) => t.kind !== "metadata" && t.kind !== "chapters",
  );
}
function trackLabel(
  t: { label?: string; language?: string },
  i: number,
  kind: string,
) {
  return t.label || t.language || `${kind} ${i + 1}`;
}

interface Opt {
  label: string;
  meta?: string;
  selected: boolean;
  apply: () => void;
}

export function TrackSheet({
  hls,
  video,
  embedded,
  embeddedMediaId,
  onClose,
}: {
  hls: Hls | null;
  video?: HTMLVideoElement | null;
  /** Pistas embebidas observadas por el Player vía el pipeline de webOS. */
  embedded?: EmbeddedTrackInfo | null;
  embeddedMediaId?: string | null;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const subtitleScale = useAppStore((s) => s.subtitleScale);
  const setSubtitleScale = useAppStore((s) => s.setSubtitleScale);
  // El pipeline no reporta la selección actual: la llevamos localmente.
  const [embAud, setEmbAud] = useState(0);
  const [embSub, setEmbSub] = useState(-1);

  // Back cierra la hoja — capa más profunda de la pila.
  useBack(() => {
    onClose();
  });

  // Foco inicial: primer ítem de Audio (o de Subtítulos si no hay audio).
  useEffect(() => {
    focusWhenReady("TSH_START");
  }, []);

  // En video nativo las pistas se pueblan después de loadedmetadata.
  useEffect(() => {
    if (hls || !video) return;
    const aud = (video as unknown as { audioTracks?: EventTarget })
      .audioTracks;
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

  // ===== Armar columnas =====
  let quality: Opt[] = [];
  let audio: Opt[] = [];
  let subs: Opt[] = [];

  const emb = embedded ?? null;
  const mediaId = embeddedMediaId ?? null;
  const useEmbedded = !hls && !!mediaId && !!emb && (emb.audio.length > 0 || emb.subs.length > 0);

  if (hls) {
    const levels = hls.levels ?? [];
    quality = [
      {
        label: "Auto",
        meta:
          hls.autoLevelEnabled && levels[hls.currentLevel]?.height
            ? `${levels[hls.currentLevel].height}p`
            : undefined,
        selected: hls.autoLevelEnabled,
        apply: () => {
          hls.currentLevel = -1;
        },
      },
      ...levels.map((l, i) => ({
        label: l.height ? `${l.height}p` : `${Math.round((l.bitrate ?? 0) / 1000)} kbps`,
        meta: l.bitrate ? `${(l.bitrate / 1e6).toFixed(1)} Mbps` : undefined,
        selected: !hls.autoLevelEnabled && hls.currentLevel === i,
        apply: () => {
          hls.currentLevel = i;
        },
      })),
    ];
    audio = (hls.audioTracks ?? []).map((t, i) => ({
      label: t.name || t.lang || `Pista ${i + 1}`,
      selected: hls.audioTrack === i,
      apply: () => {
        hls.audioTrack = i;
      },
    }));
    subs = [
      {
        label: "Desactivados",
        selected: hls.subtitleTrack === -1,
        apply: () => {
          hls.subtitleTrack = -1;
        },
      },
      ...(hls.subtitleTracks ?? []).map((t, i) => ({
        label: t.name || t.lang || `Sub ${i + 1}`,
        selected: hls.subtitleTrack === i,
        apply: () => {
          hls.subtitleTrack = i;
        },
      })),
    ];
  } else if (useEmbedded) {
    // Pistas del pipeline de webOS: la TV misma renderiza el subtítulo elegido.
    audio = emb.audio.map((t, i) => ({
      label: langLabel(t.language, i, "Pista"),
      meta: t.codec?.toUpperCase(),
      selected: embAud === i,
      apply: () => {
        if (!mediaId) return;
        selectTrack(mediaId, "audio", i);
        setEmbAud(i);
      },
    }));
    subs = [
      {
        label: "Desactivados",
        selected: embSub === -1,
        apply: () => {
          if (!mediaId) return;
          setSubtitleEnable(mediaId, false);
          setEmbSub(-1);
        },
      },
      ...emb.subs.map((t, i) => ({
        label: langLabel(t.language, i, "Sub"),
        selected: embSub === i,
        apply: () => {
          if (!mediaId) return;
          setSubtitleEnable(mediaId, true);
          selectTrack(mediaId, "text", i);
          setSubtitleFontSize(mediaId, SCALE_PX[subtitleScale]);
          setEmbSub(i);
        },
      })),
    ];
  } else {
    const a = nativeAudio(video ?? null);
    const s = nativeSubs(video ?? null);
    audio = a.map((t, i) => ({
      label: trackLabel(t, i, "Pista"),
      selected: t.enabled,
      apply: () => {
        a.forEach((x, j) => {
          x.enabled = j === i;
        });
      },
    }));
    subs = [
      {
        label: "Desactivados",
        selected: !s.some((t) => t.mode === "showing"),
        apply: () => {
          s.forEach((t) => {
            t.mode = "disabled";
          });
        },
      },
      ...s.map((t, i) => ({
        label: trackLabel(t, i, "Sub"),
        selected: t.mode === "showing",
        apply: () => {
          s.forEach((x, j) => {
            x.mode = j === i ? "showing" : "disabled";
          });
        },
      })),
    ];
  }

  // Columna Tamaño (solo cuando hay subtítulos para renderizar).
  const sizes: Opt[] = subs.length > 1
    ? (["s", "m", "l"] as const).map((sz) => ({
        label: sz === "s" ? "Chico" : sz === "m" ? "Mediano" : "Grande",
        meta: sz === "s" ? "A−" : sz === "m" ? "A" : "A+",
        selected: subtitleScale === sz,
        apply: () => {
          setSubtitleScale(sz);
          if (useEmbedded && mediaId) setSubtitleFontSize(mediaId, SCALE_PX[sz]);
        },
      }))
    : [];

  const startInAudio = audio.length > 0;

  const column = (
    zone: string,
    title: string,
    opts: Opt[],
    withStartKey: boolean,
    extra?: ReactNode,
  ) => (
    <FocusZone zone={zone} className="tsh-col">
      <div className="tsh-sec">{title}</div>
      <div className="tsh-list scroll">
        {opts.map((o, i) => (
          <FocusableButton
            key={i}
            focusKey={withStartKey && i === 0 ? "TSH_START" : undefined}
            className={`tsh-item ${o.selected ? "on" : ""}`}
            onEnterPress={() => {
              o.apply();
              refresh();
            }}
          >
            <span className="tsh-check">
              <Icon name="check" />
            </span>
            <span className="tsh-label">{o.label}</span>
            {o.meta ? <span className="tsh-meta">{o.meta}</span> : null}
          </FocusableButton>
        ))}
        {extra}
      </div>
    </FocusZone>
  );

  const empty = !quality.length && !audio.length && subs.length <= 1;

  return (
    <div className="tsh-scrim" onClick={onClose}>
      <div className="tsh" onClick={(e) => e.stopPropagation()}>
        <div className="tsh-h">
          <Icon name="tune" /> Audio y subtítulos
          <span className="tsh-hint">OK aplicar · ←→ columna · Volver cerrar</span>
        </div>
        {empty ? (
          <div className="tsh-empty">
            Este contenido no expone pistas de audio ni subtítulos
            alternativas.
            <FocusableButton
              focusKey="TSH_START"
              className="tsh-item action"
              onEnterPress={onClose}
            >
              <span className="tsh-label">Cerrar</span>
            </FocusableButton>
          </div>
        ) : (
          <div className="tsh-cols">
            {quality.length
              ? column("tsh:quality", "Calidad", quality, false)
              : null}
            {audio.length
              ? column("tsh:audio", "Audio", audio, startInAudio)
              : null}
            {column("tsh:subs", "Subtítulos", subs, !startInAudio)}
            {sizes.length ? column("tsh:size", "Tamaño", sizes, false) : null}
          </div>
        )}
      </div>
    </div>
  );
}
