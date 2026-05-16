import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  focusKey?: string;
}

export function FocusableInput({ value, onChange, placeholder, type = "text", focusKey }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => inputRef.current?.focus(),
  });

  useEffect(() => {
    if (focused) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [focused]);

  return (
    <div ref={ref} className={`focusable ${focused ? "focused" : ""}`}>
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
