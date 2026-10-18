import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";

/**
 * ¿Se puede mostrar este título? Excluye las categorías que el usuario ocultó
 * (Gestionar categorías) y, en modo Felix, lo que no está marcado como apto.
 * La misma regla que usan las filas del Inicio.
 */
export function useVodAllowed() {
  const kidsMode = useAppStore((s) => s.kidsMode);
  const kidsPrefs = useAppStore((s) => s.kidsPrefs);
  const catPrefs = useAppStore((s) => s.catPrefs);
  return useMemo(() => {
    const items = new Set(kidsPrefs.items);
    const mov = new Set(kidsPrefs.movies);
    const ser = new Set(kidsPrefs.series);
    const hiddenMov = new Set(catPrefs.movies.hidden);
    const hiddenSer = new Set(catPrefs.series.hidden);
    return {
      movie: (m: { id: string; category?: string | null }) =>
        !hiddenMov.has(m.category ?? "") && (!kidsMode || mov.has(m.category ?? "") || items.has(m.id)),
      series: (s: { id: string; category?: string | null }) =>
        !hiddenSer.has(s.category ?? "") && (!kidsMode || ser.has(s.category ?? "") || items.has(s.id)),
    };
  }, [kidsMode, kidsPrefs, catPrefs]);
}
