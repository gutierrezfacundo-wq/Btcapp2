import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { focusWhenReady, restoreFocus } from "../navigation/focusMemory";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { useBack } from "../navigation/backStack";

const MAX_PER_GROUP = 10;   // vista "Todo": pocos por sección
const MAX_FILTERED = 60;    // ficha específica: lista larga

const KINDS = [
  { id: "all", label: "Todo" },
  { id: "live", label: "En vivo" },
  { id: "movie", label: "Películas" },
  { id: "series", label: "Series" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

// La última búsqueda sobrevive al abrir un contenido: al volver con Back se
// restauran query, ficha y resultados (webOS no conserva location.state).
let lastSearch: { query: string; kind: Kind } = { query: "", kind: "all" };

function initials(s: string) {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Búsqueda global: canales + películas + series en una sola pantalla. */
/**
 * Los primeros `cap` que contienen `q` y pasan `ok`. Sin agrupar corta apenas
 * los junta; con las versiones agrupadas sigue recorriendo para contar las
 * versiones de cada título (y quedarse con la del idioma preferido).
 */
function takeMatching<T extends { id: string; vg?: number; vLang?: string }>(
  list: T[], lower: string[], q: string, cap: number, ok: (item: T) => boolean,
  groupOn: boolean, prefer: string,
): { items: T[]; counts: number[] } {
  const items: T[] = [];
  const counts: number[] = [];
  const slot = groupOn ? new Map<number, number>() : null;
  for (let i = 0; i < list.length; i++) {
    if (!slot && items.length >= cap) break;
    if (!lower[i].includes(q)) continue;
    const x = list[i];
    if (!ok(x)) continue;
    if (slot && x.vg !== undefined) {
      const at = slot.get(x.vg);
      if (at !== undefined) {
        counts[at]++;
        if (prefer && x.vLang === prefer && items[at].vLang !== prefer) items[at] = x;
        continue;
      }
      if (items.length >= cap) continue;
      slot.set(x.vg, items.length);
    } else if (items.length >= cap) continue;
    items.push(x);
    counts.push(1);
  }
  return { items, counts };
}

export function Search() {
  const navigate = useNavigate();
  const railNav = useRailNav();
  const catalog = useAppStore((s) => s.catalog);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const setUi = useAppStore((s) => s.setUi);

  const [query, setQuery] = useState(lastSearch.query);
  const [kind, setKind] = useState<Kind>(lastSearch.kind);
  const deferred = useDeferredValue(query);
  const q = deferred.trim().toLowerCase();
  useEffect(() => { lastSearch = { query, kind }; }, [query, kind]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SEARCH" });
  // Al volver de un contenido con búsqueda previa: foco al último resultado.
  useEffect(() => {
    if (lastSearch.query.trim().length >= 2) restoreFocus("search:results", "SEARCH_IN");
    else focusWhenReady("SEARCH_IN");
  }, []);

  // Cargar las secciones VOD en segundo plano para poder buscar en todo.
  useEffect(() => {
    if (!loadedSections.movies) ensureMovies();
    if (!loadedSections.series) ensureSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBack(() => { navigate("/hub"); });

  // Modo Felix: el buscador solo devuelve contenido apto.
  const kidsMode = useAppStore((s) => s.kidsMode);
  const kidsPrefs = useAppStore((s) => s.kidsPrefs);
  const kItems = useMemo(() => new Set(kidsMode ? kidsPrefs.items : []), [kidsMode, kidsPrefs]);
  const kLive = useMemo(() => new Set(kidsMode ? kidsPrefs.live : []), [kidsMode, kidsPrefs]);
  const kMov = useMemo(() => new Set(kidsMode ? kidsPrefs.movies : []), [kidsMode, kidsPrefs]);
  const kSer = useMemo(() => new Set(kidsMode ? kidsPrefs.series : []), [kidsMode, kidsPrefs]);

  // Categorías ocultas por el usuario (Gestionar categorías): tampoco aparecen
  // en la búsqueda.
  const catPrefs = useAppStore((s) => s.catPrefs);
  const hLive = useMemo(() => new Set(catPrefs.live.hidden), [catPrefs]);
  const hMov = useMemo(() => new Set(catPrefs.movies.hidden), [catPrefs]);
  const hSer = useMemo(() => new Set(catPrefs.series.hidden), [catPrefs]);

  // Nombres en minúsculas, calculados una vez por catálogo y no en cada tecla.
  const liveLc = useMemo(() => catalog.liveChannels.map((c) => c.name.toLowerCase()), [catalog.liveChannels]);
  const moviesLc = useMemo(() => catalog.movies.map((m) => m.name.toLowerCase()), [catalog.movies]);
  const seriesLc = useMemo(() => catalog.series.map((x) => x.name.toLowerCase()), [catalog.series]);

  const cap = kind === "all" ? MAX_PER_GROUP : MAX_FILTERED;
  const channels = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "live") ? [] : takeMatching(catalog.liveChannels, liveLc, q, cap,
    (c) => !hLive.has(c.groupTitle ?? "") && (!kidsMode || kLive.has(c.groupTitle ?? "") || kItems.has(c.id)), false, "").items),
  [catalog.liveChannels, liveLc, q, kind, cap, kidsMode, kLive, kItems, hLive]);
  // Versiones del mismo título: un resultado por título, con la del idioma preferido.
  const groupOn = useAppStore((s) => s.groupVariants);
  const prefAudioLang = useAppStore((s) => s.prefAudioLang);
  const prefer = (kidsMode ? "es" : prefAudioLang).toLowerCase().slice(0, 2);
  const NONE = { items: [], counts: [] };
  const movieRes = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "movie") ? NONE : takeMatching(catalog.movies, moviesLc, q, cap,
    (m) => !hMov.has(m.category ?? "") && (!kidsMode || kMov.has(m.category ?? "") || kItems.has(m.id)), groupOn, prefer)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [catalog.movies, moviesLc, q, kind, cap, kidsMode, kMov, kItems, hMov, groupOn, prefer]);
  const seriesRes = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "series") ? NONE : takeMatching(catalog.series, seriesLc, q, cap,
    (x) => !hSer.has(x.category ?? "") && (!kidsMode || kSer.has(x.category ?? "") || kItems.has(x.id)), groupOn, prefer)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [catalog.series, seriesLc, q, kind, cap, kidsMode, kSer, kItems, hSer, groupOn, prefer]);
  const movies = movieRes.items as typeof catalog.movies;
  const series = seriesRes.items as typeof catalog.series;
  /** Título y detalle de un resultado: limpio y con cuántas versiones hay. */
  const showName = (x: { name: string; vTitle?: string }) => (groupOn ? x.vTitle ?? x.name : x.name);
  const showMeta = (year: string | undefined, x: { category?: string; vLabel?: string }, n: number) =>
    [year, groupOn && n > 1 ? `${n} versiones` : groupOn && x.vLabel ? x.vLabel : x.category].filter(Boolean).join(" · ");
  const empty = q.length >= 2 && !channels.length && !movies.length && !series.length;

  const openChannel = (id: string) => {
    setUi({ tab: "live", selectedChannelId: id });
    navigate("/home?tab=live&from=search");
  };
  const openMovie = (id: string) => navigate(`/movie/${id}?from=search`);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Buscar" />
        <div className="a-body">
          <Rail active="search" onSelect={railNav} />
          <div className="a-screen">
            <div className="gsr">
              <div className="gsr-in grd-search">
                <Icon name="search" />
                <FocusableInput focusKey="SEARCH_IN" value={query} onChange={setQuery} placeholder="Buscar canales, películas y series…" />
              </div>
              <FocusZone zone="search:kinds" className="gsr-kinds">
                {KINDS.map((k) => (
                  <FocusableButton key={k.id} className={`chip ${kind === k.id ? "on" : ""}`} onEnterPress={() => setKind(k.id)}>{k.label}</FocusableButton>
                ))}
              </FocusZone>
              {!loadedSections.movies || !loadedSections.series ? (
                <div className="a-pdesc" style={{ padding: "6px 0 0" }}><span className="spinner" style={{ width: 18, height: 18, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} /> Cargando catálogo para buscar en todo…</div>
              ) : null}
              <FocusZone zone="search:results" className="gsr-scroll scroll">
                {q.length < 2 ? (
                  <div className="grd-empty">Escribí al menos 2 letras.</div>
                ) : empty ? (
                  <div className="grd-empty">Sin resultados para «{deferred.trim()}»</div>
                ) : (
                  <>
                    {kind === "all" && channels.length ? <div className="gsr-h">Canales</div> : null}
                    {channels.map((c) => (
                      <FocusableButton key={c.id} focusKey={`SR_C_${c.id}`} className="fav-row" onEnterPress={() => openChannel(c.id)}>
                        <span className="fav-badge live">EN VIVO</span>
                        <span className="fav-thumb">{c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }} /> : initials(c.name)}</span>
                        <span className="fav-mid"><div className="fav-name">{c.name}</div>{c.groupTitle ? <div className="fav-meta">{c.groupTitle}</div> : null}</span>
                        <Icon name="play_circle" className="fav-go" />
                      </FocusableButton>
                    ))}
                    {kind === "all" && movies.length ? <div className="gsr-h">Películas</div> : null}
                    {movies.map((m, mi) => (
                      <FocusableButton key={m.id} focusKey={`SR_M_${m.id}`} className="fav-row" onEnterPress={() => openMovie(m.id)}>
                        <span className="fav-badge movie">PELÍCULA</span>
                        <span className="fav-thumb">{m.posterUrl ? <img src={m.posterUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials(m.name)}</span>
                        <span className="fav-mid"><div className="fav-name">{showName(m)}</div><div className="fav-meta">{showMeta(m.year?.slice(0, 4), m, movieRes.counts[mi])}</div></span>
                        <Icon name="play_circle" className="fav-go" />
                      </FocusableButton>
                    ))}
                    {kind === "all" && series.length ? <div className="gsr-h">Series</div> : null}
                    {series.map((s, si) => (
                      <FocusableButton key={s.id} focusKey={`SR_S_${s.id}`} className="fav-row" onEnterPress={() => navigate(`/series/${s.id}?name=${encodeURIComponent(s.name)}&from=search`)}>
                        <span className="fav-badge series">SERIE</span>
                        <span className="fav-thumb">{s.posterUrl ? <img src={s.posterUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials(s.name)}</span>
                        <span className="fav-mid"><div className="fav-name">{showName(s)}</div><div className="fav-meta">{showMeta(s.year, s, seriesRes.counts[si])}</div></span>
                        <Icon name="chevron_right" className="fav-go" />
                      </FocusableButton>
                    ))}
                  </>
                )}
              </FocusZone>
            </div>
          </div>
        </div>
        <Hints items={[{ k: "↕", label: "Navegar" }, { k: "OK", label: "Abrir" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
