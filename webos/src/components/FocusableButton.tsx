import { type CSSProperties, type ReactNode } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  onEnterPress?: () => void;
  onFocus?: () => void;
  /** Devolver false cancela la navegación por defecto en esa dirección. */
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
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onArrowPress: (direction) => (onArrowPress ? onArrowPress(direction) : true),
    onEnterPress: () => {
      if (!disabled) onEnterPress?.();
    },
    onFocus: () => {
      // Mantener visible el item enfocado al navegar listas largas.
      (ref.current as HTMLElement | null)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
      onFocus?.();
    },
  });

  return (
    <div
      ref={ref}
      className={`focusable ${focused ? "focused" : ""} ${className ?? ""}`}
      style={style}
      // Magic Remote (puntero): al pasar por encima tomamos el foco para que el
      // D-pad continúe desde acá. Excepción: si se está escribiendo en un input
      // (teclado en pantalla), no robamos el foco al pasar por encima.
      onMouseEnter={() => { if (!disabled && !(document.activeElement instanceof HTMLInputElement)) focusSelf(); }}
      onClick={() => {
        if (!disabled) { focusSelf(); onEnterPress?.(); }
      }}
    >
      {children}
    </div>
  );
}
