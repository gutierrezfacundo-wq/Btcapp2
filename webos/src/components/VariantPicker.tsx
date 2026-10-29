import { FocusableButton } from "./FocusableButton";
import { FocusZone } from "./FocusZone";
import { Icon } from "./Icon";

export interface VariantOption {
  id: string;
  /** Lo que distingue a la versión ("Español", "Inglés · 4K"), si el nombre lo dice. */
  vLabel?: string;
  category?: string;
}

/**
 * Versiones de un mismo título (idioma/calidad) en la ficha. Cada chip dice lo
 * que la distingue y, debajo, la categoría del proveedor de donde sale (dos
 * versiones "Español" pueden venir de categorías distintas).
 */
export function VariantPicker({ variants, currentId, focusPrefix, onPick }: {
  variants: VariantOption[];
  currentId: string;
  /** Prefijo de los focusKey: `${focusPrefix}_${id}`. */
  focusPrefix: string;
  onPick: (id: string) => void;
}) {
  if (variants.length < 2) return null;
  return (
    <div className="det-vers">
      <div className="det-vers-h"><Icon name="translate" /> {variants.length} versiones</div>
      <FocusZone zone={`${focusPrefix}:zone`} preferred={`${focusPrefix}_${currentId}`} className="det-vers-row">
        {variants.map((v, i) => {
          const label = v.vLabel || v.category || `Versión ${i + 1}`;
          const sub = v.vLabel && v.category ? v.category : undefined;
          return (
            <FocusableButton
              key={v.id}
              focusKey={`${focusPrefix}_${v.id}`}
              className={`chip det-ver ${v.id === currentId ? "on" : ""}`}
              onEnterPress={() => { if (v.id !== currentId) onPick(v.id); }}
            >
              <span className="det-ver-l">{label}</span>
              {sub ? <span className="det-ver-c">{sub}</span> : null}
            </FocusableButton>
          );
        })}
      </FocusZone>
    </div>
  );
}
