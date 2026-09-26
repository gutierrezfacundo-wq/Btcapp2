import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  focusKey?: string;
  /** Input desnudo (sin caja propia): para usar dentro de .fld-in / .a-search / .grd-search. */
  bare?: boolean;
}

export function FocusableInput({ value, onChange, placeholder, type = "text", focusKey, bare = true }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onEnterPress: () => inputRef.current?.focus(),
  });

  useEffect(() => {
    if (focused) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [focused]);

  // Solo foco por click, NO por hover: pasar el puntero cerca de un input
  // (p.ej. yendo hacia el teclado en pantalla) no debe "seleccionarlo" solo.
  if (bare) {
    return (
      <div ref={ref} className={`bare ${focused ? "focused" : ""}`} onClick={focusSelf}>
        <input
          ref={inputRef}
          className="bare-input"
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div ref={ref} className={`focusable ${focused ? "focused" : ""}`} onClick={focusSelf}>
      <input
        ref={inputRef}
        className={`input ${focused ? "focused" : ""}`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
