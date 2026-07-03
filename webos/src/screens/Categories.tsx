import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore, applyCatPrefs, type CatSection } from "../store/useAppStore";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { VirtualList } from "../components/VirtualList";
import { useRailNav } from "../hooks/useRailNav";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";

const SECTIONS: { id: CatSection; label: string }[] = [
  { id: "live", label: "En vivo" },
  { id: "movies", label: "Películas" },
  { id: "series", label: "Series" },
];

/** Gestor de categorías: ocultar y reordenar, por sección, guardado por lista. */
export function Categories() {
  const navigate = useNavigate();
  const railNav = useRailNav();
  const catalog = useAppStore((s) => s.catalog);
  const catPrefs = useAppStore((s) => s.catPrefs);
  const setCatPrefs = useAppStore((s) => s.setCatPrefs);
  const loadedSections = useAppStore((s) => s.loadedSections);
  const ensureMovies = useAppStore((s) => s.ensureMovies);
  const ensureSeries = useAppStore((s) => s.ensureSeries);
  const kidsMode = useAppStore((s) => s.kidsMode);
  const kidsPrefs = useAppStore((s) => s.kidsPrefs);
  const toggleKidsCategory = useAppStore((s) => s.toggleKidsCategory);

  const [section, setSection] = useState<CatSection>("live");
  // "vis": ocultar/ordenar · "kids": marcar categorías aptas para el modo Felix.
  const [view, setView] = useState<"vis" | "kids">("vis");
  const prefs = catPrefs[section];

  // Esta pantalla no existe dentro del modo Felix.
  useEffect(() => { if (kidsMode) navigate("/hub"); }, [kidsMode, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "CATMGR" });

  useBack(() => { navigate("/setup"); });

  // Películas/Series se cargan a demanda: pedirlas al entrar a esas secciones.
  useEffect(() => {
    if (section === "movies") void ensureMovies();
    if (section === "series") void ensureSeries();
  }, [section, ensureMovies, ensureSeries]);

  const rawCats = section === "live" ? catalog.liveCategories
    : section === "movies" ? catalog.movieCategories : catalog.seriesCategories;
  const sectionLoading =
    (section === "movies" && !loadedSections.movies) || (section === "series" && !loadedSections.series);

  // Lista completa (ocultas incluidas, atenuadas) en el orden guardado.
  const ordered = useMemo(() => applyCatPrefs(rawCats, prefs, true), [rawCats, prefs]);
  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const kidsSet = useMemo(() => new Set(kidsPrefs[section]), [kidsPrefs, section]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    const inc = (k?: string | null) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
    if (section === "live") catalog.liveChannels.forEach((c) => inc(c.groupTitle));
    else if (section === "movies") catalog.movies.forEach((x) => inc(x.category));
    else catalog.series.forEach((x) => inc(x.category));
    return m;
  }, [section, catalog]);

  useEffect(() => {
    if (sectionLoading) return;
    if (ordered.length) focusWhenReady(`CMR_${ordered[0].id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, view, sectionLoading, ordered.length]);

  const toggleHidden = (name: string) => {
    const hidden = hiddenSet.has(name) ? prefs.hidden.filter((n) => n !== name) : [...prefs.hidden, name];
    setCatPrefs(section, { ...prefs, hidden });
  };

  const move = (idx: number, dir: 1 | -1) => {
    const j = idx + dir;
    if (j < 0 || j >= ordered.length) return;
    const names = ordered.map((c) => c.name);
    [names[idx], names[j]] = [names[j], names[idx]];
    setCatPrefs(section, { ...prefs, order: names });
  };

  const reset = () => setCatPrefs(section, { order: [], hidden: [] });
  const dirty = prefs.order.length > 0 || prefs.hidden.length > 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Categorías" />
        <div className="a-body">
          <Rail active="settings" onSelect={railNav} />
          <div className="a-screen">
            <div className="cm-wrap">
              <div className="det-top">
                <FocusableButton className="det-back" onEnterPress={() => navigate("/setup")}>
                  <Icon name="arrow_back" /> Volver
                </FocusableButton>
                <FocusZone zone="catmgr:sections" className="gsr-kinds" style={{ margin: "0 0 0 24px" }}>
                  {SECTIONS.map((s) => (
                    <FocusableButton key={s.id} className={`chip ${section === s.id ? "on" : ""}`} onEnterPress={() => setSection(s.id)}>
                      {s.label}
                    </FocusableButton>
                  ))}
                  <span className="cm-sep" />
                  <FocusableButton className={`chip ${view === "vis" ? "on" : ""}`} onEnterPress={() => setView("vis")}>
                    <Icon name="visibility" /> Visibilidad
                  </FocusableButton>
                  <FocusableButton className={`chip ${view === "kids" ? "on" : ""}`} onEnterPress={() => setView("kids")}>
                    <Icon name="child_care" /> Aptas para Felix
                  </FocusableButton>
                </FocusZone>
                {view === "vis" && dirty ? (
                  <FocusableButton className="btn ghost" style={{ marginLeft: "auto" }} onEnterPress={reset}>
                    <Icon name="restart_alt" /> Restablecer
                  </FocusableButton>
                ) : null}
              </div>
              {sectionLoading ? (
                <div className="ld"><div className="ld-spin spinner" /><div className="ld-step">Cargando categorías…</div></div>
              ) : !ordered.length ? (
                <div className="ld">
                  <Icon name="category" className="eo-ic" />
                  <div className="ld-step">Esta sección no tiene categorías.</div>
                </div>
              ) : (
                <FocusZone key={`catmgr:${section}:${view}`} zone={`catmgr:${section}:${view}`} className="cm-list">
                  <VirtualList
                    className="cm-vp scroll"
                    items={ordered}
                    estRowHeight={58}
                    overscan={12}
                    getKey={(c) => c.id}
                    renderRow={(c, i) => {
                      if (view === "kids") {
                        const ok = kidsSet.has(c.name);
                        return (
                          <FocusableButton
                            focusKey={`CMR_${c.id}`}
                            className={`cm-row ${ok ? "kid-on" : ""}`}
                            onEnterPress={() => toggleKidsCategory(section, c.name)}
                          >
                            <span className="cm-grip"><Icon name="child_care" /></span>
                            <span className="cm-name">{c.name}</span>
                            <span className="cm-count">{counts.get(c.name) ?? 0}</span>
                            <span className="cm-eye"><Icon name={ok ? "check_circle" : "radio_button_unchecked"} /></span>
                          </FocusableButton>
                        );
                      }
                      const off = hiddenSet.has(c.name);
                      return (
                        <FocusableButton
                          focusKey={`CMR_${c.id}`}
                          className={`cm-row ${off ? "off" : ""}`}
                          onEnterPress={() => toggleHidden(c.name)}
                          onArrowPress={(dir) => {
                            if (dir === "left") { move(i, -1); return false; }
                            if (dir === "right") { move(i, 1); return false; }
                            return true;
                          }}
                        >
                          <span className="cm-grip"><Icon name="drag_indicator" /></span>
                          <span className="cm-name">{c.name}</span>
                          <span className="cm-count">{counts.get(c.name) ?? 0}</span>
                          <span className="cm-eye"><Icon name={off ? "visibility_off" : "visibility"} /></span>
                        </FocusableButton>
                      );
                    }}
                  />
                </FocusZone>
              )}
            </div>
          </div>
        </div>
        <Hints items={view === "kids"
          ? [
              { k: "OK", label: "Apta / no apta para Felix" },
              { k: "↕", label: "Navegar" },
              { k: "Esc", label: "Volver" },
            ]
          : [
              { k: "OK", label: "Ocultar / mostrar" },
              { k: "←→", label: "Mover arriba / abajo" },
              { k: "↕", label: "Navegar" },
              { k: "Esc", label: "Volver" },
            ]} />
      </div>
    </FocusContext.Provider>
  );
}
