import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import type { RailId } from "../components/Rail";

/** Navegación del rail para pantallas que no son Home (Hub, Setup, etc.). */
export function useRailNav() {
  const navigate = useNavigate();
  const reload = useAppStore((s) => s.reload);
  return (id: RailId) => {
    switch (id) {
      case "hub": navigate("/hub"); break;
      case "live": navigate("/home?tab=live"); break;
      case "movies": navigate("/home?tab=movies"); break;
      case "series": navigate("/home?tab=series"); break;
      case "favorites": navigate("/home?tab=favorites"); break;
      case "search": navigate("/home?tab=live&search=1"); break;
      case "reload": reload(); break;
      case "settings": navigate("/setup"); break;
    }
  };
}
