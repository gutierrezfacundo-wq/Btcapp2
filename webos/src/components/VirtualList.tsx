import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  items: T[];
  /** Altura estimada de fila (px). Se re-mide del DOM real al montar. */
  estRowHeight: number;
  /** Filas extra por encima/debajo del viewport (colchón para el D-pad). */
  overscan?: number;
  getKey: (it: T, i: number) => string;
  renderRow: (it: T, i: number) => ReactNode;
  className?: string;
  /** Índice a asegurar visible/centrado (p.ej. canal seleccionado al volver). */
  scrollToIndex?: number;
}

/**
 * Lista virtualizada por scroll: solo renderiza las filas visibles (+overscan),
 * con espaciadores arriba/abajo para preservar la geometría del scroll. Mantiene
 * el DOM chico para que el D-pad y el pintado vayan rápido en la TV.
 */
export function VirtualList<T>({
  items, estRowHeight, overscan = 8, getKey, renderRow, className, scrollToIndex,
}: Props<T>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rowH = useRef(estRowHeight);
  const [range, setRange] = useState({ start: 0, end: overscan * 3 });

  const recompute = () => {
    const el = ref.current;
    if (!el) return;
    const h = rowH.current || estRowHeight;
    const vh = el.clientHeight || 800;
    const start = Math.max(0, Math.floor(el.scrollTop / h) - overscan);
    const visible = Math.ceil(vh / h);
    const end = Math.min(items.length, start + visible + overscan * 2);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  };

  // Medir la altura real de fila (incluye margen) entre dos filas consecutivas.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rows = el.querySelectorAll("[data-vrow]");
    if (rows.length >= 2) {
      const a = (rows[0] as HTMLElement).getBoundingClientRect();
      const b = (rows[1] as HTMLElement).getBoundingClientRect();
      const measured = Math.abs(b.top - a.top);
      if (measured > 1 && Math.abs(measured - rowH.current) > 0.5) {
        rowH.current = measured;
        recompute();
      }
    }
  });

  useEffect(() => { recompute(); /* reset al cambiar la lista */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = Math.max(0, scrollToIndex * rowH.current - el.clientHeight / 2);
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex]);

  const start = Math.max(0, Math.min(range.start, items.length));
  const end = Math.min(range.end, items.length);
  const topPad = start * rowH.current;
  const botPad = Math.max(0, (items.length - end) * rowH.current);

  return (
    <div ref={ref} className={className} onScroll={recompute}>
      <div style={{ height: topPad, flexShrink: 0 }} />
      {items.slice(start, end).map((it, i) => (
        <div data-vrow key={getKey(it, start + i)}>{renderRow(it, start + i)}</div>
      ))}
      <div style={{ height: botPad, flexShrink: 0 }} />
    </div>
  );
}
