// ============================================================
// Memoria de foco entre pantallas y tabs.
// norigin (saveLastFocusedChild) solo recuerda mientras la zona siga
// montada; esto persiste al desmontar (cambiar de tab, volver del Player).
// FocusableButton escribe acá automáticamente vía FocusZone.
// También reemplaza TODOS los setTimeout(() => setFocus(...), 60/80/140)
// por reintentos por frame: focusWhenReady / restoreFocus.
// ============================================================
import {
  doesFocusableExist,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";

const mem = new Map<string, string>();

export function rememberFocus(scope: string, focusKey: string): void {
  mem.set(scope, focusKey);
}

export function recallFocus(scope: string): string | undefined {
  return mem.get(scope);
}

/**
 * Enfoca `key` en cuanto exista (reintenta por rAF hasta `tries` frames).
 * Sustituto directo de window.setTimeout(() => setFocus(key), N):
 * sin carreras — espera exactamente a que el componente esté registrado.
 */
export function focusWhenReady(key: string, tries = 20): void {
  if (doesFocusableExist(key)) {
    setFocus(key);
    return;
  }
  if (tries <= 0) return;
  requestAnimationFrame(() => focusWhenReady(key, tries - 1));
}

/**
 * Restaura el último foco recordado para `scope`; si ya no existe
 * (lista filtrada, fila virtualizada fuera de rango), cae al fallback.
 */
export function restoreFocus(scope: string, fallback: string, tries = 20): void {
  const key = mem.get(scope);
  attempt(key ?? fallback, fallback, tries);
}

function attempt(key: string, fallback: string, tries: number): void {
  if (doesFocusableExist(key)) {
    setFocus(key);
    return;
  }
  if (tries <= 0) {
    if (key !== fallback && doesFocusableExist(fallback)) setFocus(fallback);
    return;
  }
  requestAnimationFrame(() => attempt(key, fallback, tries - 1));
}
