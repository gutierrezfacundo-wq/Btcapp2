// ============================================================
// Zona de foco (columna / sección de pantalla). Hace tres cosas:
// 1. Contenedor norigin con saveLastFocusedChild: al volver a la zona
//    con el D-pad, el foco cae en el ÚLTIMO ítem enfocado de esa zona
//    (memoria por columna, estilo Apple TV) — no en el más cercano
//    por geometría.
// 2. Acota la búsqueda de vecinos: las flechas eligen dentro de la
//    zona primero (evita saltos a ítems "inesperados" de otra columna).
// 3. Expone la cadena de zonas por contexto para que FocusableButton
//    registre memoria persistente (focusMemory) — sobrevive desmontes.
//
// Uso: <FocusZone zone="cats" className="a-cats"> ... </FocusZone>
// Si `zone` es dinámica (p.ej. `home:${tab}`), pasar también key={zone}
// para que remonte limpio al cambiar.
// ============================================================
import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation";

const ZoneContext = createContext<string[]>([]);

/** Cadena de zonas ancestras (exterior → interior). */
export function useZoneChain(): string[] {
  return useContext(ZoneContext);
}

export function FocusZone({
  zone,
  preferred,
  className,
  style,
  children,
}: {
  /** Nombre único de la zona; se usa como focusKey del contenedor. */
  zone: string;
  /** focusKey del hijo a enfocar la primera vez que se entra a la zona. */
  preferred?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const parents = useContext(ZoneContext);
  const chain = useMemo(() => [...parents, zone], [parents, zone]);
  const { ref, focusKey } = useFocusable({
    focusKey: zone,
    trackChildren: true,
    saveLastFocusedChild: true,
    preferredChildFocusKey: preferred,
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <ZoneContext.Provider value={chain}>
        <div ref={ref} className={className} style={style}>
          {children}
        </div>
      </ZoneContext.Provider>
    </FocusContext.Provider>
  );
}
