import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  name: string;
  subtitle?: string;
  logoUrl?: string;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}

export function ChannelRow({ name, subtitle, logoUrl, isFavorite, onPlay, onToggleFavorite }: Props) {
  const { ref, focused } = useFocusable({
    onEnterPress: onPlay,
    extraProps: { onLongPress: onToggleFavorite },
  });

  return (
    <div
      ref={ref}
      className={`channel-row focusable ${focused ? "focused" : ""}`}
      onClick={onPlay}
    >
      <div className="logo">
        {logoUrl ? <img src={logoUrl} alt="" loading="lazy" /> : <span>TV</span>}
      </div>
      <div className="info">
        <div className="name">{name}</div>
        {subtitle ? <div className="subtitle">{subtitle}</div> : null}
      </div>
      <button
        className={`fav ${isFavorite ? "on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label="favorito"
      >
        {isFavorite ? "♥" : "♡"}
      </button>
    </div>
  );
}
