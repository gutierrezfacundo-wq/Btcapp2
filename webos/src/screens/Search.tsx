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

  const cap = kind === "all" ? MAX_PER_GROUP : MAX_FILTERED;
  const channels = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "live") ? [] : catalog.liveChannels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, cap)), [catalog.liveChannels, q, kind, cap]);
  const movies = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "movie") ? [] : catalog.movies.filter((m) => m.name.toLowerCase().includes(q)).slice(0, cap)), [catalog.movies, q, kind, cap]);
  const series = useMemo(() => (q.length < 2 || (kind !== "all" && kind !== "series") ? [] : catalog.series.filter((s) => s.name.toLowerCase().includes(q)).slice(0, cap)), [catalog.series, q, kind, cap]);
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
                    {movies.map((m) => (
                      <FocusableButton key={m.id} focusKey={`SR_M_${m.id}`} className="fav-row" onEnterPress={() => openMovie(m.id)}>
                        <span className="fav-badge movie">PELÍCULA</span>
                        <span className="fav-thumb">{m.posterUrl ? <img src={m.posterUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials(m.name)}</span>
                        <span className="fav-mid"><div className="fav-name">{m.name}</div><div className="fav-meta">{[m.year?.slice(0, 4), m.category].filter(Boolean).join(" · ")}</div></span>
                        <Icon name="play_circle" className="fav-go" />
                      </FocusableButton>
                    ))}
                    {kind === "all" && series.length ? <div className="gsr-h">Series</div> : null}
                    {series.map((s) => (
                      <FocusableButton key={s.id} focusKey={`SR_S_${s.id}`} className="fav-row" onEnterPress={() => navigate(`/series/${s.id}?name=${encodeURIComponent(s.name)}&from=search`)}>
                        <span className="fav-badge series">SERIE</span>
                        <span className="fav-thumb">{s.posterUrl ? <img src={s.posterUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials(s.name)}</span>
                        <span className="fav-mid"><div className="fav-name">{s.name}</div><div className="fav-meta">{[s.year, s.category].filter(Boolean).join(" · ")}</div></span>
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
