import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  getCurrentFocusKey,
  setFocus,
} from "@noriginmedia/norigin-spatial-navigation";
import { Setup } from "./screens/Setup";
import { Hub } from "./screens/Hub";

// Solo el Hub y la configuración (las dos pantallas posibles al arrancar) van
// en el paquete inicial. El resto —incluido el reproductor con hls.js, medio
// mega de JavaScript— se carga a demanda: evaluar todo eso al arrancar era
// buena parte del primer segundo con la TV sin responder. Se precargan en un
// momento libre (ver preloadScreens), así que navegar sigue siendo inmediato.
const screens = {
  Home: () => import("./screens/Home").then((m) => ({ default: m.Home })),
  SeriesDetail: () => import("./screens/SeriesDetail").then((m) => ({ default: m.SeriesDetail })),
  MovieDetail: () => import("./screens/MovieDetail").then((m) => ({ default: m.MovieDetail })),
  Player: () => import("./screens/Player").then((m) => ({ default: m.Player })),
  Pair: () => import("./screens/Pair").then((m) => ({ default: m.Pair })),
  RemotePair: () => import("./screens/RemotePair").then((m) => ({ default: m.RemotePair })),
  Search: () => import("./screens/Search").then((m) => ({ default: m.Search })),
  Catchup: () => import("./screens/Catchup").then((m) => ({ default: m.Catchup })),
  Categories: () => import("./screens/Categories").then((m) => ({ default: m.Categories })),
};
const Home = lazy(screens.Home);
const SeriesDetail = lazy(screens.SeriesDetail);
const MovieDetail = lazy(screens.MovieDetail);
const Player = lazy(screens.Player);
const Pair = lazy(screens.Pair);
const RemotePair = lazy(screens.RemotePair);
const Search = lazy(screens.Search);
const Catchup = lazy(screens.Catchup);
const Categories = lazy(screens.Categories);

/** Precarga las pantallas de a una, en momentos libres, después de arrancar. */
function preloadScreens() {
  // Primero las chicas y más visitadas; Player (con hls.js, el más pesado de
  // evaluar) después de ellas.
  const queue = [screens.Home, screens.MovieDetail, screens.SeriesDetail, screens.Player,
    screens.Search, screens.Categories, screens.Catchup, screens.Pair, screens.RemotePair];
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    const run = () => { load().catch(() => undefined).finally(next); };
    if (ric) ric(run, { timeout: 3000 });
    else setTimeout(run, 300);
  };
  setTimeout(next, 2500);
}
import { KidsSleepGuard } from "./components/KidsSleepGuard";
import { RemoteBridge } from "./components/RemoteBridge";
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
  const kidsMode = useAppStore((s) => s.kidsMode);

  // Tema del modo Felix: colores vivos y formas redondas vía body.kids.
  useEffect(() => {
    document.body.classList.toggle("kids", kidsMode);
  }, [kidsMode]);

  useEffect(() => {
    if (source) reload();
  }, [source, reload]);

  useEffect(() => { preloadScreens(); }, []);

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
    <>
    <KidsSleepGuard />
    <RemoteBridge />
    {/* Mientras llega el código de una pantalla (casi nunca: se precargan)
        no se muestra nada: el fondo de la app ya es el de todas las pantallas. */}
    <Suspense fallback={null}>
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
      <Route path="/remote" element={<RemotePair />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </>
  );
}
