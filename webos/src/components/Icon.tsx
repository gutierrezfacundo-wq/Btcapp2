interface Props {
  name: string;
  size?: number;
  className?: string;
}

/** Icono Material Symbols Outlined. El texto del span es el nombre del icono (ligadura). */
export function Icon({ name, size, className }: Props) {
  return (
    <span
      className={`ms${className ? ` ${className}` : ""}`}
      style={size ? { fontSize: size } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
