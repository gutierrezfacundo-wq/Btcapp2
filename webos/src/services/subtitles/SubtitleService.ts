import type { Language, SubtitleFile, SubtitleResult, SubtitleSearchRequest } from "./types";

/**
 * Contrato del servicio de subtítulos. La app depende SOLO de esta interfaz;
 * los proveedores concretos (OpenSubtitles hoy; SubDL/Podnapisi/Addic7ed a
 * futuro) se implementan aparte y se inyectan vía la factory de `index.ts`.
 */
export interface SubtitleService {
  /** Busca subtítulos ordenados por relevancia. Devuelve [] si no hay resultados. */
  searchSubtitles(request: SubtitleSearchRequest): Promise<SubtitleResult[]>;
  /** Descarga y devuelve el archivo del subtítulo elegido. */
  downloadSubtitle(fileId: number): Promise<SubtitleFile>;
  /** Lista de idiomas soportados (cacheada). */
  getSupportedLanguages(): Promise<Language[]>;
}
