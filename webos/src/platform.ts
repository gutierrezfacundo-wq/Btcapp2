// Dónde está corriendo la app: la misma base de código se empaqueta para la
// TV (webOS) y para la PC (Electron). Lo específico de cada plataforma se
// decide acá y no desperdigado por las pantallas.

/** Puente que expone el preload de la versión de escritorio. */
interface DesktopBridge {
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  quit(): void;
  version: string;
}

declare global {
  interface Window {
    potriDesktop?: DesktopBridge;
  }
}

export const IS_WEBOS = typeof navigator !== "undefined"
  && (/web0s|webos/i.test(navigator.userAgent)
    || typeof (window as unknown as { webOS?: unknown }).webOS !== "undefined");

export const IS_DESKTOP = typeof window !== "undefined" && !!window.potriDesktop;

/** Para los mensajes de error: "desde la TV" / "desde la PC". */
export const DEVICE_NAME = IS_WEBOS ? "la TV" : IS_DESKTOP ? "la PC" : "este equipo";

export function desktop(): DesktopBridge | undefined {
  return typeof window !== "undefined" ? window.potriDesktop : undefined;
}
