import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Setup } from "./screens/Setup";
import { Home } from "./screens/Home";
import { SeriesDetail } from "./screens/SeriesDetail";
import { Player } from "./screens/Player";
import { useAppStore } from "./store/useAppStore";
import { isBackKey } from "./webos/remote-keys";
import "./styles/components.css";

export default function App() {
  const source = useAppStore((s) => s.source);
  const reload = useAppStore((s) => s.reload);

  useEffect(() => {
    if (source) reload();
  }, [source, reload]);

  useEffect(() => {
    // Global back-key fallback: close app at root, otherwise let route components handle it.
    const onKey = (e: KeyboardEvent) => {
      if (isBackKey(e) && window.location.hash.replace(/^#/, "") === "/home") {
        // On webOS, history.back() at the root will exit the app via disableBackHistoryAPI.
        e.preventDefault();
        try {
          (window as unknown as { webOS?: { platformBack?: () => void } }).webOS?.platformBack?.();
        } catch {
          /* noop */
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={source ? "/home" : "/setup"} replace />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/home" element={<Home />} />
      <Route path="/series/:id" element={<SeriesDetail />} />
      <Route path="/player" element={<Player />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
