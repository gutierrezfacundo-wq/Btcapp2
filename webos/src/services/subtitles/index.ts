// Punto de entrada de la capa de subtítulos. La app pide `getSubtitleService()`
// y trabaja contra la interfaz; acá se elige e inyecta el proveedor concreto.
import { useAppStore } from "../../store/useAppStore";
import { resolveConfig } from "./config";
import { OpenSubtitlesProvider } from "./OpenSubtitlesProvider";
import type { SubtitleService } from "./SubtitleService";

export type { SubtitleService } from "./SubtitleService";
export * from "./types";

let cached: { key: string; svc: SubtitleService } | null = null;

/** Devuelve el servicio de subtítulos configurado (memoizado por config). */
export function getSubtitleService(): SubtitleService {
  const s = useAppStore.getState();
  const cfg = resolveConfig({ apiKey: s.subtitlesApiKey, relayBase: s.companionUrl });
  const key = `${cfg.apiKey}|${cfg.relayBase}|${cfg.cacheTtlMs}`;
  if (!cached || cached.key !== key) {
    cached = { key, svc: new OpenSubtitlesProvider(cfg) };
  }
  return cached.svc;
}
