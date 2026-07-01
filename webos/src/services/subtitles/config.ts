// Configuración del servicio. En un cliente estático los secretos no pueden
// ocultarse en el bundle, así que la fuente principal es in-app (Mis Listas);
// las VITE_* sirven como defaults opcionales para builds propios.

export interface SubtitleConfig {
  /** API key de OpenSubtitles. */
  apiKey: string;
  /** URL base del relay (companion) para sortear CORS. Vacío = intento directo. */
  relayBase: string;
  /** TTL de caché en ms. */
  cacheTtlMs: number;
  /** Timeout de red en ms. */
  timeoutMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;
function env(): Env {
  try {
    return (import.meta as unknown as { env?: Env }).env ?? {};
  } catch {
    return {};
  }
}

/** Resuelve la config combinando valores in-app con las VITE_* como fallback. */
export function resolveConfig(overrides: Partial<SubtitleConfig>): SubtitleConfig {
  const e = env();
  const ttlEnv = Number(e.VITE_CACHE_TTL);
  return {
    apiKey: overrides.apiKey || e.VITE_OPENSUBTITLES_API_KEY || "",
    relayBase: (overrides.relayBase || e.VITE_SUBTITLES_RELAY || "").replace(/\/+$/, ""),
    cacheTtlMs: overrides.cacheTtlMs ?? (Number.isFinite(ttlEnv) && ttlEnv > 0 ? ttlEnv : DAY_MS),
    timeoutMs: overrides.timeoutMs ?? 15000,
  };
}
