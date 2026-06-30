import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";
import { useClock } from "../hooks/useClock";
import { useAppStore } from "../store/useAppStore";

/** Barra superior Aurora: logo POTRI + título de sección + (selector lista activa) + reloj. */
export function TopBar({
  title,
  showListPill = true,
  center,
}: {
  title: string;
  showListPill?: boolean;
  center?: ReactNode;
}) {
  const navigate = useNavigate();
  const { time, date } = useClock();
  const sources = useAppStore((s) => s.sources);
  const activeId = useAppStore((s) => s.activeSourceId);
  const activeName = sources.find((s) => s.id === activeId)?.name ?? "Sin lista";

  return (
    <div className="a-top">
      <div className="a-logo">POTR<span>I</span></div>
      <div className="a-screentitle">{title}</div>
      {center}
      <div className="a-spacer" />
      {showListPill ? (
        <FocusableButton
          focusKey="TOP_LIST"
          className="a-listpill"
          onEnterPress={() => navigate("/setup")}
        >
          <Icon name="playlist_play" />
          <div>
            <div className="lp-l">Lista activa</div>
            <div className="lp-n">{activeName}</div>
          </div>
          <Icon name="unfold_more" />
        </FocusableButton>
      ) : null}
      <div className="a-clock">{time}<small style={{ display: "block", fontSize: 13, color: "var(--muted)", letterSpacing: 2 }}>{date}</small></div>
    </div>
  );
}
