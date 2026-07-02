// ============================================================
// FocusableButton (rediseño de navegación estilo Apple TV):
// 1. anchorScroll en vez de scrollIntoView({block:"nearest"}) →
//    foco fijo: la lista se desliza suave debajo del ítem.
// 2. Registra memoria de foco en todas las zonas ancestras
//    (FocusZone + focusMemory) al recibir foco.
// 3. onArrowPress se reenvía a norigin.
// 4. Magic Remote: hover toma el foco (salvo mientras se escribe en un
//    input) y el click activa — puntero y D-pad comparten un solo foco.
// ============================================================
import { type CSSProperties, type ReactNode } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { anchorScroll } from "../navigation/anchorScroll";
import { rememberFocus } from "../navigation/focusMemory";
import { useZoneChain } from "./FocusZone";

interface Props {
  onEnterPress?: () => void;
  onFocus?: () => void;
  /** Devolver false para bloquear el movimiento por defecto. */
  onArrowPress?: (direction: string) => boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  focusKey?: string;
  disabled?: boolean;
}

export function FocusableButton({
  onEnterPress,
  onFocus,
  onArrowPress,
  children,
  className,
  style,
  focusKey,
  disabled,
}: Props) {
  const zones = useZoneChain();
  const { ref, focused, focusSelf, focusKey: resolvedKey } = useFocusable({
    focusKey,
    onEnterPress: () => {
      if (!disabled) onEnterPress?.();
    },
    onArrowPress,
    onFocus: () => {
      anchorScroll(ref.current as HTMLElement | null);
      for (const z of zones) rememberFocus(z, resolvedKey);
      onFocus?.();
    },
  });

  return (
    <div
      ref={ref}
      className={`focusable ${focused ? "focused" : ""} ${className ?? ""}`}
      style={style}
      onMouseEnter={() => {
        if (!disabled && !(document.activeElement instanceof HTMLInputElement)) focusSelf();
      }}
      onClick={() => {
        if (!disabled) { focusSelf(); onEnterPress?.(); }
      }}
    >
      {children}
    </div>
  );
}
