import { type CSSProperties, type ReactNode } from "react";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  onEnterPress?: () => void;
  onFocus?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  focusKey?: string;
  disabled?: boolean;
}

export function FocusableButton({
  onEnterPress,
  onFocus,
  children,
  className,
  style,
  focusKey,
  disabled,
}: Props) {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
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
      // D-pad continúe desde acá y no se "pierda" al usar el puntero.
      onMouseEnter={() => { if (!disabled) focusSelf(); }}
      onClick={() => {
        if (!disabled) { focusSelf(); onEnterPress?.(); }
      }}
    >
      {children}
    </div>
  );
}
