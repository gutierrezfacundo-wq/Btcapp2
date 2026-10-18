import { useEffect, useMemo, useState } from "react";

/** Hora HH:MM y fecha corta, actualizada cada 30s. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  // Formatear fechas es caro (ICU): solo cuando cambia la hora, no en cada
  // render de la pantalla que contiene la barra.
  return useMemo(() => ({
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: now
      .toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "short" })
      .toUpperCase()
      .replace(".", ""),
  }), [now]);
}
