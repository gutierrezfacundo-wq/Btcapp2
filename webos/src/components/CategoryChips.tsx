import { useFocusable, FocusContext } from "@noriginmedia/norigin-spatial-navigation";
import type { Category } from "../data/types";

interface Props {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  return (
    <div
      ref={ref}
      className={`chip focusable ${focused ? "focused" : ""} ${active ? "active" : ""}`}
      onClick={onPress}
    >
      {label}
    </div>
  );
}

export function CategoryChips({ categories, selected, onSelect }: Props) {
  const { ref, focusKey } = useFocusable({ trackChildren: true });
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="chips scroll">
        <Chip label="Todas" active={selected === null} onPress={() => onSelect(null)} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            active={selected === c.name}
            onPress={() => onSelect(c.name)}
          />
        ))}
      </div>
    </FocusContext.Provider>
  );
}
