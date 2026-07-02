// ============================================================
// Aceleración al mantener apretada una flecha (estilo Apple TV).
// norigin ya mueve 1 posición por evento de keydown; acá agregamos
// pasos EXTRA según cuánto tiempo lleva repitiendo:
//   ~0,8 s  → 2 posiciones por evento (2x)
//   ~1,8 s  → 3 posiciones por evento (3x)
// Instalar una vez en main.tsx: installKeyAcceleration()
// ============================================================
import { navigateByDirection } from "@noriginmedia/norigin-spatial-navigation";

const DIRS: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// El control de webOS repite ~8–10 eventos/segundo.
const TURBO_2X = 7;   // repeticiones hasta duplicar
const TURBO_3X = 16;  // repeticiones hasta triplicar

export function installKeyAcceleration(): () => void {
  let repeats = 0;
  let lastKey = "";

  const down = (e: KeyboardEvent) => {
    const dir = DIRS[e.key];
    if (!dir) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (!e.repeat || e.key !== lastKey) {
      repeats = 0;
      lastKey = e.key;
      return;
    }
    repeats++;
    const extra = repeats > TURBO_3X ? 2 : repeats > TURBO_2X ? 1 : 0;
    for (let i = 0; i < extra; i++) navigateByDirection(dir, {});
  };
  const up = () => {
    repeats = 0;
    lastKey = "";
  };

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}
