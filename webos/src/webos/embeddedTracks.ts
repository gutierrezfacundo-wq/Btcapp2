// Pistas embebidas vía el pipeline de medios de webOS (luna://com.webos.media).
// El pipeline demuxea el contenedor y reporta TODAS las pistas (audio y
// subtítulos, incluso de imagen); la TV misma renderiza el subtítulo elegido.
// Este es el mecanismo que usan las apps IPTV consolidadas en webOS.

import { hasLuna, lunaCall } from "./luna";

const MEDIA = "luna://com.webos.media";

export interface EmbeddedTrack {
  index: number;
  language?: string;
  codec?: string;
}

export interface EmbeddedTrackInfo {
  audio: EmbeddedTrack[];
  subs: EmbeddedTrack[];
}

/** El <video> de webOS expone el id del pipeline como propiedad no estándar. */
export function getMediaId(video: HTMLVideoElement | null): string | null {
  const id = (video as unknown as { mediaId?: unknown })?.mediaId;
  return typeof id === "string" && id ? id : null;
}

interface SourceInfoMsg {
  sourceInfo?: {
    programInfo?: Array<{
      numAudioTracks?: number;
      audioTrackInfo?: Array<{ language?: string; codec?: string }>;
      numSubtitleTracks?: number;
      subtitleTrackInfo?: Array<{ language?: string; type?: string }>;
    }>;
  };
}

/**
 * Se suscribe al pipeline y reporta las pistas embebidas cuando el demuxer
 * las publica. IMPORTANTE: el pipeline anuncia sourceInfo al cargar el video,
 * así que hay que suscribirse APENAS empieza la reproducción (no al abrir el
 * menú). `onRaw` recibe las claves de cada mensaje (diagnóstico).
 */
export function watchEmbeddedTracks(
  mediaId: string,
  onTracks: (t: EmbeddedTrackInfo) => void,
  onRaw?: (keys: string) => void,
): () => void {
  if (!hasLuna()) return () => undefined;
  return lunaCall<SourceInfoMsg & Record<string, unknown>>(MEDIA, "subscribe", { mediaId }, (msg) => {
    onRaw?.(Object.keys(msg).join(","));
    // Tolerante a variantes de firmware: sourceInfo directo o anidado.
    const src = msg.sourceInfo ?? (msg as { payload?: SourceInfoMsg["sourceInfo"] }).payload;
    const prog = src?.programInfo?.[0];
    if (!prog) return;
    const audio: EmbeddedTrack[] = (prog.audioTrackInfo ?? [])
      .slice(0, prog.numAudioTracks ?? undefined)
      .map((a, i) => ({ index: i, language: a.language, codec: a.codec }));
    const subs: EmbeddedTrack[] = (prog.subtitleTrackInfo ?? [])
      .slice(0, prog.numSubtitleTracks ?? undefined)
      .map((s, i) => ({ index: i, language: s.language, codec: s.type }));
    onTracks({ audio, subs });
  }, true);
}

/** Activa/desactiva el render de subtítulos del pipeline. */
export function setSubtitleEnable(mediaId: string, enable: boolean): void {
  lunaCall(MEDIA, "setSubtitleEnable", { mediaId, enable });
}

/** Selecciona una pista embebida ("text" para subtítulos, "audio" para audio). */
export function selectTrack(mediaId: string, type: "text" | "audio", index: number): void {
  lunaCall(MEDIA, "selectTrack", { mediaId, type, index });
}
