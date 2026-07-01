// Logger mínimo del servicio de subtítulos. NUNCA registra credenciales.

export interface SubtitleLogger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

export const consoleLogger: SubtitleLogger = {
  info(event, data) {
    // eslint-disable-next-line no-console
    console.info(`[subs] ${event}`, data ?? "");
  },
  error(event, data) {
    // eslint-disable-next-line no-console
    console.error(`[subs] ${event}`, data ?? "");
  },
};
