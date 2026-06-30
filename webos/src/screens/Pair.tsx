import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import QRCode from "qrcode";
import { useAppStore } from "../store/useAppStore";
import type { SourceConfig } from "../data/types";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";
import { isBackKey } from "../webos/remote-keys";

function genCode(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1 para que sea legible
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

interface CompanionPayload {
  v?: number;
  name?: string;
  source?: SourceConfig;
  subtitlesApiKey?: string;
}

export function Pair() {
  const navigate = useNavigate();
  const companionUrl = useAppStore((s) => s.companionUrl);
  const addSource = useAppStore((s) => s.addSource);
  const setActiveSource = useAppStore((s) => s.setActiveSource);
  const setSubtitlesApiKey = useAppStore((s) => s.setSubtitlesApiKey);

  const codeRef = useRef(genCode());
  const code = codeRef.current;
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<"waiting" | "applying" | "done" | "error">("waiting");

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "PAIR" });
  useEffect(() => { setFocus("PAIR_CANCEL"); }, []);

  const pairUrl = companionUrl ? `${companionUrl}/?code=${code}` : "";

  useEffect(() => {
    if (!pairUrl) return;
    QRCode.toDataURL(pairUrl, { width: 320, margin: 1, color: { dark: "#0a0a0c", light: "#f3f2f5" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [pairUrl]);

  // Back vuelve a Mis Listas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isBackKey(e)) { e.preventDefault(); navigate("/setup"); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Polling del relay hasta recibir la config.
  useEffect(() => {
    if (!companionUrl) return;
    let alive = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`${companionUrl}/api/pair/${code}`, { cache: "no-store" });
        const data = (await res.json()) as CompanionPayload & { pending?: boolean };
        if (!alive) return;
        if (data && !data.pending && data.source) {
          setStatus("applying");
          const id = addSource(data.name || "Mi lista", data.source);
          if (data.subtitlesApiKey) setSubtitlesApiKey(data.subtitlesApiKey);
          await setActiveSource(id);
          if (!alive) return;
          setStatus("done");
          window.setTimeout(() => navigate("/hub"), 700);
          return;
        }
      } catch {
        /* reintenta */
      }
      if (alive) timer = window.setTimeout(poll, 2500);
    };
    timer = window.setTimeout(poll, 2000);
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionUrl, code]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <div className="a-top">
          <div className="a-logo">POTR<span>I</span></div>
          <div className="a-screentitle">Vincular con el celular</div>
        </div>
        <div className="pair">
          {!companionUrl ? (
            <div className="pair-card">
              <Icon name="link_off" size={56} />
              <div className="pair-title">Falta configurar la URL de vinculación</div>
              <div className="pair-desc">Entrá a <b>Mis Listas</b> y cargá la URL de tu companion (la app web que desplegaste, ej. https://tu-proyecto.pages.dev). Después volvé acá.</div>
              <FocusableButton focusKey="PAIR_CANCEL" className="btn primary" onEnterPress={() => navigate("/setup")}>Ir a Mis Listas</FocusableButton>
            </div>
          ) : status === "done" ? (
            <div className="pair-card">
              <Icon name="check_circle" size={64} />
              <div className="pair-title">¡Configurado!</div>
              <div className="pair-desc">Cargando tu lista…</div>
            </div>
          ) : (
            <div className="pair-card">
              <div className="pair-qr">{qr ? <img src={qr} alt="QR" width={320} height={320} /> : <div className="spinner" />}</div>
              <div className="pair-side">
                <div className="pair-step"><span className="pair-num">1</span> Escaneá este QR con el celular</div>
                <div className="pair-step"><span className="pair-num">2</span> Cargá tu lista y la API key en la web</div>
                <div className="pair-step"><span className="pair-num">3</span> Tocá <b>Enviar</b> — la TV se configura sola</div>
                <div className="pair-code">Código: <b>{code}</b></div>
                <div className="pair-wait"><span className="spinner" style={{ width: 18, height: 18, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} /> {status === "applying" ? "Aplicando…" : "Esperando datos del celular…"}</div>
                <FocusableButton focusKey="PAIR_CANCEL" className="btn" onEnterPress={() => navigate("/setup")}>Cancelar</FocusableButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
