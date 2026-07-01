// Modelos y contratos de la capa de subtítulos. Son agnósticos del proveedor:
// el resto de la app trabaja SOLO con estos tipos, nunca con OpenSubtitles directo.

export interface Language {
  /** Código ISO 639-1 (ej. "es", "en", "pt-br"). */
  code: string;
  /** Nombre legible (ej. "Español"). */
  name: string;
}

/** Tipo de contenido para acotar la búsqueda. */
export type SubtitleMediaType = "movie" | "episode";

/**
 * Pedido de búsqueda. Se usa en orden de prioridad: imdbId → tmdbId →
 * (title + year [+ season/episode]). Cuantos más identificadores, más preciso.
 */
export interface SubtitleSearchRequest {
  type: SubtitleMediaType;
  /** IDs de catálogo (preferidos). Para episodios, los parent* refieren a la serie. */
  imdbId?: string;
  tmdbId?: string;
  parentImdbId?: string;
  parentTmdbId?: string;
  /** Título (fallback cuando no hay IDs). Solo el nombre, sin año. */
  title?: string;
  year?: string;
  season?: number;
  episode?: number;
  /** Idiomas a filtrar (ISO 639-1). Por defecto ["es","en"]. */
  languages?: string[];
}

export interface SubtitleResult {
  /** ID del subtítulo en el proveedor. */
  id: string;
  /** ID del archivo para descargar. */
  fileId: number;
  language: string;      // nombre legible
  languageCode: string;  // ISO 639-1
  release: string;
  uploader: string;
  downloads: number;
  rating: number;
  hearingImpaired: boolean;
  fileName: string;
}

export interface SubtitleFile {
  /** Contenido del subtítulo (texto). */
  content: string;
  /** Formato del contenido entregado. */
  format: "srt" | "vtt";
  encoding: string;
  language?: string;
}

/** Códigos de error estables para que la UI reaccione sin parsear mensajes. */
export type SubtitleErrorCode =
  | "no_api_key"
  | "no_relay"
  | "auth"
  | "rate_limit"
  | "not_found"
  | "network"
  | "timeout"
  | "http"
  | "unknown";

/** Error tipado: nunca propagamos excepciones crudas sin contexto. */
export class SubtitleError extends Error {
  constructor(
    public readonly code: SubtitleErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SubtitleError";
  }
}
