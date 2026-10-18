import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { dispatchBack } from "../navigation/backStack";
import { encodeB64Url } from "../data/b64url";

interface RemoteCmd {
  action?: string;
  url?: string;
  title?: string;
  meta?: string;
  dir?: number;
  num?: number;
}

/**
 * Control remoto por celular: la TV pollea el relay (/api/cmd/<código>) y
 * ejecuta el comando más nuevo. play → reproductor; pause → video visible;
 * back → pila central de Volver; zap → lo resuelve Home (evento potri-remote).
 */
export function RemoteBridge() {
  const companionUrl = useAppStore((s) => s.companionUrl);
  const remoteCode = useAppStore((s) => s.remoteCode);
  // Solo comandos posteriores al arranque de la app.
  const lastSeq = useRef(Date.now());

  useEffect(() => {
    if (!companionUrl || !remoteCode) return;
    let alive = true;
    let timer: number | undefined;

    const exec = (cmd: RemoteCmd) => {
      if (!cmd || typeof cmd !== "object") return;
      if (cmd.action === "pause") {
        const v = document.querySelector("video") as HTMLVideoElement | null;
        if (v) { if (v.paused) v.play().catch(() => undefined); else v.pause(); }
        return;
      }
      if (cmd.action === "back") { dispatchBack(); return; }
      if (cmd.action === "zap" || cmd.action === "zapTo") {
        window.dispatchEvent(new CustomEvent("potri-remote", { detail: cmd }));
        return;
      }
      if (cmd.action === "play" && typeof cmd.url === "string" && cmd.url) {
        const st = encodeB64Url({ from: "/hub" });
        const title = encodeURIComponent(cmd.title || "Desde el celular");
        const meta = cmd.meta ? `&meta=${encodeURIComponent(cmd.meta)}` : "";
        window.location.hash = `#/player?url=${encodeURIComponent(cmd.url)}&title=${title}${meta}&st=${st}`;
      }
    };

    const poll = async () => {
      try {
        const r = await fetch(`${companionUrl}/api/cmd/${remoteCode}?since=${lastSeq.current}`, { cache: "no-store" });
        const d = (await r.json()) as { pending?: boolean; seq?: number; cmd?: RemoteCmd };
        if (alive && d && !d.pending && typeof d.seq === "number" && d.seq > lastSeq.current) {
          lastSeq.current = d.seq;
          exec(d.cmd as RemoteCmd);
        }
      } catch {
        /* sin red: reintenta en el próximo ciclo */
      }
      if (alive) timer = window.setTimeout(poll, 3000);
    };
    timer = window.setTimeout(poll, 3000);
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, [companionUrl, remoteCode]);

  return null;
}
