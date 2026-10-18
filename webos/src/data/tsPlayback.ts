// Reproducción de MPEG-TS (el formato del vivo de Xtream) fuera de la TV.
//
// El reproductor de webOS abre un .ts directo en <video>, pero Chrome —y por
// lo tanto la versión de escritorio— no: hay que desarmar el stream en JS y
// pasárselo al <video> por Media Source Extensions. Eso hace mpegts.js.
//
// Se importa a demanda: la TV nunca lo necesita y no carga ese código.

import { IS_WEBOS } from "../platform";

export interface TsHandle {
  destroy(): void;
}

/** ¿Este stream necesita mpegts.js para reproducirse acá? */
export function needsTsShim(url: string): boolean {
  return !IS_WEBOS && /\.ts(\?|$)/i.test(url);
}

/**
 * Engancha el stream al <video>. Devuelve null si el navegador no soporta
 * MSE (entonces no hay forma de reproducirlo y conviene mostrar el error).
 */
export async function attachTs(
  video: HTMLVideoElement,
  url: string,
  onError: (message: string) => void,
  onBitrate?: (bitsPerSecond: number) => void,
): Promise<TsHandle | null> {
  const { default: mpegts } = await import("mpegts.js");
  if (!mpegts.isSupported()) return null;

  // Las películas y episodios en .ts se pueden adelantar; el vivo no.
  const isLive = !/\/(movie|series)\//i.test(url);
  const player = mpegts.createPlayer(
    { type: "mpegts", isLive, url },
    {
      enableWorker: true,
      // En vivo: arrancar rápido y no acumular atraso si la red tose.
      liveBufferLatencyChasing: isLive,
      lazyLoad: !isLive,
    },
  );
  player.attachMediaElement(video);
  player.on(mpegts.Events.ERROR, (type: string, detail: string) => {
    onError(`Error de reproducción (${type}${detail ? `: ${detail}` : ""})`);
  });
  if (onBitrate) {
    // speed viene en KB/s: es lo que efectivamente baja el stream.
    player.on(mpegts.Events.STATISTICS_INFO, (info: { speed?: number }) => {
      if (info?.speed) onBitrate(Math.round(info.speed * 1024 * 8));
    });
  }
  player.load();
  const started = player.play();
  if (started && typeof (started as Promise<void>).catch === "function") {
    (started as Promise<void>).catch(() => undefined);
  }

  return {
    destroy() {
      try { player.pause(); } catch { /* noop */ }
      try { player.unload(); } catch { /* noop */ }
      try { player.detachMediaElement(); } catch { /* noop */ }
      try { player.destroy(); } catch { /* noop */ }
    },
  };
}
