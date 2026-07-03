import { FocusableButton } from "./FocusableButton";
import { FocusZone } from "./FocusZone";
import { Icon } from "./Icon";
import { useAppStore } from "../store/useAppStore";

export type RailId =
  | "hub" | "live" | "movies" | "series" | "favorites"
  | "search" | "reload" | "settings";

const TOP: { id: RailId; icon: string }[] = [
  { id: "hub", icon: "home" },
  { id: "live", icon: "live_tv" },
  { id: "movies", icon: "movie" },
  { id: "series", icon: "video_library" },
  { id: "favorites", icon: "star" },
  { id: "search", icon: "search" },
];
const BOTTOM: { id: RailId; icon: string }[] = [
  { id: "reload", icon: "refresh" },
  { id: "settings", icon: "settings" },
];

// En modo Félix no se muestran Favoritos ni Configuración (la salida del
// modo está protegida por PIN desde el Inicio).
const KIDS_HIDDEN: RailId[] = ["favorites", "settings"];

export function Rail({
  active,
  onSelect,
  reloading = false,
  focusPrefix = "RAIL",
}: {
  active?: RailId;
  onSelect: (id: RailId) => void;
  reloading?: boolean;
  focusPrefix?: string;
}) {
  const kidsMode = useAppStore((s) => s.kidsMode);
  const hidden = new Set(kidsMode ? KIDS_HIDDEN : []);
  const btn = (it: { id: RailId; icon: string }) => (
    <FocusableButton
      key={it.id}
      focusKey={`${focusPrefix}_${it.id}`}
      className={`a-railbtn ${active === it.id ? "on" : ""} ${
        it.id === "reload" && reloading ? "spin" : ""
      }`}
      onEnterPress={() => onSelect(it.id)}
    >
      <Icon name={it.icon} />
    </FocusableButton>
  );
  return (
    <FocusZone zone={`${focusPrefix}:zone`} className="a-rail">
      {TOP.filter((t) => !hidden.has(t.id)).map(btn)}
      <div className="a-railsp" />
      {BOTTOM.filter((t) => !hidden.has(t.id)).map(btn)}
    </FocusZone>
  );
}
