interface Hint {
  k: string;
  label: string;
}

/** Barra inferior de ayuda (atajos del control remoto). */
export function Hints({ items }: { items: Hint[] }) {
  return (
    <div className="a-hint">
      {items.map((h, i) => (
        <span key={i}>
          <span className="a-key">{h.k}</span> {h.label}
        </span>
      ))}
    </div>
  );
}

export const HINTS_NAV: Hint[] = [
  { k: "↕↔", label: "Navegar" },
  { k: "OK", label: "Seleccionar" },
  { k: "Esc", label: "Volver" },
];
