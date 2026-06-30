import { useEffect, useState } from "react";

/** Hora HH:MM y fecha corta, actualizada cada 30s. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now
    .toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase()
    .replace(".", "");
  return { time, date };
}
