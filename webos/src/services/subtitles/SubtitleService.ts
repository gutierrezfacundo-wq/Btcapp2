import type { Language, SubtitleFile, SubtitleResult, SubtitleSearchRequest } from "./types";

/**
 * Contrato del servicio de subtítulos. La app depende SOLO de esta interfaz;
 * los proveedores concretos (OpenSubtitles hoy; SubDL/Podnapisi/Addic7ed a
 * futuro) se implementan aparte y se inyectan vía la factory de `index.ts`.
 */
export interface SubtitleService {
  /** Busca subtítulos ordenados por relevancia. Devuelve [] si no hay resultados. */
  searchSubtitles(request: SubtitleSearchRequest): Promise<SubtitleResult[]>;
  /** Descarga y devuelve el archivo del subtítulo elegido (contenido en memoria). */
  downloadSubtitle(fileId: number): Promise<SubtitleFile>;
  /**
   * URL http directa y reproducible del subtítulo (VTT) para pasar a un <track>.
   * En webOS el reproductor nativo necesita una URL real (no blob:). Devuelve ""
   * si el proveedor no puede exponer una URL (ej. sin relay) → usar downloadSubtitle.
   */
  getSubtitleUrl(fileId: number): string;
  /** Lista de idiomas soportados (cacheada). */
  getSupportedLanguages(): Promise<Language[]>;
}
