import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  getCurrentFocusKey,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { Setup } from "./screens/Setup";
import { Hub } from "./screens/Hub";
import { Home } from "./screens/Home";
import { SeriesDetail } from "./screens/SeriesDetail";
import { MovieDetail } from "./screens/MovieDetail";
import { Player } from "./screens/Player";
import { Pair } from "./screens/Pair";
import { Search } from "./screens/Search";
import { Catchup } from "./screens/Catchup";
import { Categories } from "./screens/Categories";
import { useAppStore } from "./store/useAppStore";
import { installBackHandler } from "./navigation/backStack";

/** Remonta el Player al cambiar de contenido (episodio→episodio) para resetear su estado. */
function KeyedPlayer() {
  const loc = useLocation();
  return <Player key={loc.search} />;
}

export default function App() {
  const source = useAppStore((s) => s.source);
  const reload = useAppStore((s) => s.reload);

  useEffect(() => {
    if (source) reload();
  }, [source, reload]);

  // ÚNICO listener de Back de toda la app (pila LIFO en backStack.ts).
  // Cada pantalla/overlay registra su handler con useBack(). Acá solo
  // queda el caso raíz: en /hub, Back sale de la app (webOS platformBack).
  useEffect(
    () =>
      installBackHandler(() => {
        if (window.location.hash.replace(/^#/, "") === "/hub") {
          try {
            (
              window as unknown as { webOS?: { platformBack?: () => void } }
            ).webOS?.platformBack?.();
          } catch {
            /* noop */
          }
        }
      }),
    [],
  );

  // Recuperación de foco: si el D-pad "se pierde" (el puntero del Magic
  // Remote movió el foco fuera, o se desmontó el elemento enfocado), al
  // apretar una flecha sin foco visible restauramos el último conocido.
  useEffect(() => {
    const ARROWS = [37, 38, 39, 40];
    const onKey = (e: KeyboardEvent) => {
      if (!ARROWS.includes(e.keyCode)) return;
      if (document.querySelector(".focused")) return;
      const last = getCurrentFocusKey();
      if (last) setFocus(last);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={source ? "/hub" : "/setup"} replace />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/hub" element={<Hub />} />
      <Route path="/home" element={<Home />} />
      <Route path="/series/:id" element={<SeriesDetail />} />
      <Route path="/movie/:id" element={<MovieDetail />} />
      <Route path="/player" element={<KeyedPlayer />} />
      <Route path="/search" element={<Search />} />
      <Route path="/catchup/:id" element={<Catchup />} />
      <Route path="/categories" element={<Categories />} />
      <Route path="/pair" element={<Pair />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
