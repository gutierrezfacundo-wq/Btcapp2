// ============================================================
// Pila central de "Back" — una sola fuente de verdad para Volver.
// Cada capa (pantalla, overlay, menú) registra su handler al montar
// y lo desregistra al desmontar. El más profundo (último) gana.
// Reemplaza los 5 listeners de keydown dispersos que competían entre sí.
// ============================================================
import { useEffect, useRef } from "react";
import { isBackKey } from "../webos/remote-keys";

/** Devolver `false` para dejar pasar el Back a la capa anterior. */
type BackHandler = () => boolean | void;

const stack: BackHandler[] = [];

export function pushBack(h: BackHandler): () => void {
  stack.push(h);
  return () => {
    const i = stack.lastIndexOf(h);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Hook: registra un handler de Back mientras el componente esté montado.
 * `active=false` lo desregistra (útil para overlays que se cierran).
 * El handler siempre ve el estado actual (ref), sin re-registrarse.
 */
export function useBack(handler: BackHandler, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return pushBack(() => ref.current());
  }, [active]);
}

/**
 * Recorre la pila como si se hubiera apretado Back (lo usa también el
 * control remoto por celular). Devuelve true si alguna capa lo consumió.
 */
export function dispatchBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]() !== false) return true; // consumido
  }
  return false;
}

/**
 * Instalar UNA sola vez en App. `onRootBack` corre cuando ninguna capa
 * consumió el Back (caso raíz: salir de la app en /hub).
 */
export function installBackHandler(onRootBack: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!isBackKey(e)) return;
    // Nunca interceptar mientras se escribe (Backspace borra texto).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dispatchBack()) onRootBack();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
