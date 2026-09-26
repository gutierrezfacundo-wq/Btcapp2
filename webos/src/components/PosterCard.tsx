import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";

interface Props {
  title: string;
  posterUrl?: string;
  onSelect: () => void;
}

export function PosterCard({ title, posterUrl, onSelect }: Props) {
  const { ref, focused } = useFocusable({ onEnterPress: onSelect });
  return (
    <div
      ref={ref}
      className={`poster-card focusable ${focused ? "focused" : ""}`}
      onClick={onSelect}
    >
      <div className="poster">
        {posterUrl ? <img src={posterUrl} alt="" loading="lazy" /> : <span>🎬</span>}
      </div>
      <div className="title">{title}</div>
    </div>
  );
}
