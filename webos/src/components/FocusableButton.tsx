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
  const { ref, focused } = useFocusable({
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
      onClick={() => {
        if (!disabled) onEnterPress?.();
      }}
    >
      {children}
    </div>
  );
}
