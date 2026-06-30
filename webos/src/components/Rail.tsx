import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";

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
    <nav className="a-rail">
      {TOP.map(btn)}
      <div className="a-railsp" />
      {BOTTOM.map(btn)}
    </nav>
  );
}
