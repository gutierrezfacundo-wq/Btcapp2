import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useAppStore } from "../store/useAppStore";
import { loadCatchupGuide, type CatchupProgram } from "../data/xtream";
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

/** Programas grabados (catch-up) de un canal con tv_archive. */
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

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "CATCHUP" });

  useEffect(() => {
    if (!source || source.kind !== "xtream" || !streamId) {
      setError("Los programas grabados solo están disponibles con Xtream.");
      return;
    }
    loadCatchupGuide(source, streamId)
      .then(setPrograms)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la guía"));
  }, [source, streamId]);

  useEffect(() => {
    if (programs?.length) focusWhenReady("CT_0");
    else if (programs || error) focusWhenReady("CT_BACK");
  }, [programs, error]);

  const goBack = () => {
    navigate("/home?tab=live");
    window.setTimeout(() => {
      if (window.location.hash.replace(/^#/, "").startsWith("/catchup")) window.location.hash = "#/home?tab=live";
    }, 60);
  };
  useBack(() => { goBack(); });

  const play = (p: CatchupProgram) => {
    if (!source || source.kind !== "xtream" || !streamId || !channel) return;
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
    (programs ?? []).forEach((p, idx) => {
      const d = dayLabel(p.startTs);
      if (d !== lastDay) { out.push({ day: d }); lastDay = d; }
      out.push({ p, idx });
    });
    return out;
  }, [programs]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Grabados" center={channel ? <div className="a-catnow">{channel.name}</div> : undefined} />
        <div className="a-body">
          <Rail active="live" onSelect={railNav} />
          <div className="a-screen">
            {error ? (
              <div className="ld">
                <Icon name="history" className="eo-ic" />
                <div className="ld-step" style={{ color: "var(--err)" }}>{error}</div>
                <FocusableButton focusKey="CT_BACK" className="btn primary" onEnterPress={goBack}>Volver</FocusableButton>
              </div>
            ) : programs === null ? (
              <div className="ld"><div className="ld-spin spinner" /><div className="ld-step">Cargando guía de grabados…</div></div>
            ) : !programs.length ? (
              <div className="ld">
                <Icon name="history" className="eo-ic" />
                <div className="ld-step">Este canal no tiene programas grabados disponibles.</div>
                <FocusableButton focusKey="CT_BACK" className="btn primary" onEnterPress={goBack}>Volver</FocusableButton>
              </div>
            ) : (
              <div className="det">
                <div className="det-top">
                  <FocusableButton className="det-back" onEnterPress={goBack}>
                    <Icon name="arrow_back" /> Volver a En vivo
                  </FocusableButton>
                  {channel?.archiveDays ? <span className="det-mchip" style={{ marginLeft: 18 }}>{channel.archiveDays} día{channel.archiveDays > 1 ? "s" : ""} de archivo</span> : null}
                </div>
                <FocusZone zone="catchup:list" className="det-eps scroll">
                  {rows.map((r, i) =>
                    r.day ? (
                      <div key={`d-${i}`} className="gsr-h">{r.day}</div>
                    ) : (
                      <FocusableButton key={`p-${i}`} focusKey={r.idx === 0 ? "CT_0" : undefined} className="ep-row" onEnterPress={() => play(r.p as CatchupProgram)}>
                        <span className="ep-num">{hm((r.p as CatchupProgram).startTs)}</span>
                        <span className="ep-thumb"><Icon name="play_arrow" /></span>
                        <span className="ep-mid">
                          <div className="ep-title">{(r.p as CatchupProgram).title}</div>
                          <div className="ep-sub">{hm((r.p as CatchupProgram).startTs)}–{hm((r.p as CatchupProgram).stopTs)}</div>
                        </span>
                        <span className="ep-dur">{(r.p as CatchupProgram).durationMins} min</span>
                      </FocusableButton>
                    ),
                  )}
                </FocusZone>
              </div>
            )}
          </div>
        </div>
        <Hints items={[{ k: "↕", label: "Navegar" }, { k: "OK", label: "Reproducir" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
