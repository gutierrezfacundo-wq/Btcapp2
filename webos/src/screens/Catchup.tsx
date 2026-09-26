import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadChannelGuide, type CatchupProgram } from "../data/xtream";
import { xtreamTimeshiftUrl } from "../data/types";
import { FocusableButton } from "../components/FocusableButton";
import { FocusZone } from "../components/FocusZone";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { encodeB64Url } from "../data/b64url";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff === -1) return "Mañana";
  return `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function hm(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
/** "YYYY-MM-DD HH:MM:SS" (hora del proveedor) → "YYYY-MM-DD:HH-MM" para timeshift. */
function tsStart(p: CatchupProgram): string {
  const m = p.start.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}-${m[3]}`;
  const d = new Date(p.startTs * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

type View = "schedule" | "archive";

/** Guía del canal: programación (ahora/próximos) + grabados (catch-up). */
export function Catchup() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const railNav = useRailNav();
  const source = useAppStore((s) => s.source);
  const channels = useAppStore((s) => s.catalog.liveChannels);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const channel = useMemo(() => channels.find((c) => c.id === id), [channels, id]);
  const streamId = id.match(/^xt-live-(\d+)$/)?.[1];

  const [programs, setPrograms] = useState<CatchupProgram[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("schedule");

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "CATCHUP" });

  useEffect(() => {
    if (!source || source.kind !== "xtream" || !streamId) {
      setError("La guía del canal solo está disponible con Xtream.");
      return;
    }
    loadChannelGuide(source, streamId)
      .then(setPrograms)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la guía"));
  }, [source, streamId]);

  const nowTs = Math.floor(Date.now() / 1000);
  const shown = useMemo(() => {
    const all = programs ?? [];
    if (view === "schedule") return all.filter((p) => p.stopTs >= nowTs); // ahora + futuro, ascendente
    return all.filter((p) => p.hasArchive).slice().reverse();             // grabados, recientes primero
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, view]);
  const hasArchive = useMemo(() => (programs ?? []).some((p) => p.hasArchive), [programs]);

  useEffect(() => {
    if (shown.length) focusWhenReady("CT_0");
    else if (programs || error) focusWhenReady("CT_BACK");
  }, [view, programs, error]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => {
    navigate("/home?tab=live");
    window.setTimeout(() => {
      if (window.location.hash.replace(/^#/, "").startsWith("/catchup")) window.location.hash = "#/home?tab=live";
    }, 60);
  };
  useBack(() => { goBack(); });

  const play = (p: CatchupProgram) => {
    if (!p.hasArchive || !source || source.kind !== "xtream" || !streamId || !channel) return;
    const url = xtreamTimeshiftUrl(source, Number(streamId), tsStart(p), p.durationMins);
    const title = `${channel.name} · ${p.title}`;
    const sub = `${dayLabel(p.startTs)} · ${hm(p.startTs)}–${hm(p.stopTs)}`;
    const st = encodeB64Url({ from: `/catchup/${id}`, cid: `ct-${streamId}-${p.startTs}` });
    const route = `/player?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&meta=${encodeURIComponent(sub)}&st=${st}`;
    pushHistory({ id: `ct:${id}`, name: title, route, posterUrl: channel.logoUrl, sub, kind: "live" });
    navigate(route);
  };

  // Encabezado de día intercalado en la lista.
  const rows = useMemo(() => {
    const out: Array<{ day?: string; p?: CatchupProgram; idx?: number }> = [];
    let lastDay = "";
    shown.forEach((p, idx) => {
      const d = dayLabel(p.startTs);
      if (d !== lastDay) { out.push({ day: d }); lastDay = d; }
      out.push({ p, idx });
    });
    return out;
  }, [shown]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Guía del canal" center={channel ? <div className="a-catnow">{channel.name}</div> : undefined} />
        <div className="a-body">
          <Rail active="live" onSelect={railNav} />
          <div className="a-screen">
            {error ? (
              <div className="ld">
                <Icon name="calendar_month" className="eo-ic" />
                <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                <FocusableButton focusKey="CT_BACK" className="btn primary" onEnterPress={goBack}>Volver</FocusableButton>
              </div>
            ) : programs === null ? (
              <div className="ld"><div className="ld-spin spinner" /><div className="ld-step">Cargando guía…</div></div>
            ) : (
              <div className="det">
                <div className="det-top">
                  <FocusableButton className="det-back" onEnterPress={goBack}>
                    <Icon name="arrow_back" /> Volver a En vivo
                  </FocusableButton>
                  <FocusZone zone="guide:views" className="gsr-kinds" style={{ margin: "0 0 0 24px" }}>
                    <FocusableButton className={`chip ${view === "schedule" ? "on" : ""}`} onEnterPress={() => setView("schedule")}>Programación</FocusableButton>
                    {hasArchive ? (
                      <FocusableButton className={`chip ${view === "archive" ? "on" : ""}`} onEnterPress={() => setView("archive")}>Grabados</FocusableButton>
                    ) : null}
                  </FocusZone>
                  {channel?.archiveDays ? <span className="det-mchip" style={{ marginLeft: "auto" }}>{channel.archiveDays} día{channel.archiveDays > 1 ? "s" : ""} de archivo</span> : null}
                </div>
                {!shown.length ? (
                  <div className="ld">
                    <Icon name={view === "archive" ? "history" : "calendar_month"} className="eo-ic" />
                    <div className="ld-step">{view === "archive" ? "Este canal no tiene programas grabados disponibles." : "Sin programación disponible."}</div>
                    <FocusableButton focusKey="CT_BACK" className="btn primary" onEnterPress={goBack}>Volver</FocusableButton>
                  </div>
                ) : (
                  <FocusZone key={`guide:${view}`} zone={`guide:${view}`} className="det-eps scroll">
                    {rows.map((r, i) => {
                      if (r.day) return <div key={`d-${i}`} className="gsr-h">{r.day}</div>;
                      const p = r.p as CatchupProgram;
                      const isNow = p.startTs <= nowTs && nowTs < p.stopTs;
                      return (
                        <FocusableButton key={`p-${i}`} focusKey={r.idx === 0 ? "CT_0" : undefined} className="ep-row" onEnterPress={() => play(p)}>
                          <span className="ep-num">{hm(p.startTs)}</span>
                          <span className="ep-thumb"><Icon name={p.hasArchive ? "play_arrow" : isNow ? "live_tv" : "schedule"} /></span>
                          <span className="ep-mid">
                            <div className="ep-title">{p.title}</div>
                            <div className="ep-sub">{hm(p.startTs)}–{hm(p.stopTs)}</div>
                          </span>
                          {isNow ? <span className="ep-flag"><Icon name="live_tv" /> Ahora</span> : null}
                          {p.hasArchive ? <span className="ep-flag"><Icon name="history" /> Grabado</span> : null}
                          <span className="ep-dur">{p.durationMins} min</span>
                        </FocusableButton>
                      );
                    })}
                  </FocusZone>
                )}
              </div>
            )}
          </div>
        </div>
        <Hints items={view === "archive"
          ? [{ k: "↕", label: "Navegar" }, { k: "OK", label: "Reproducir" }, { k: "Esc", label: "Volver" }]
          : [{ k: "↕", label: "Navegar" }, { k: "←→", label: "Vista" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
