import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import QRCode from "qrcode";
import { useAppStore } from "../store/useAppStore";
import { encodeB64Url } from "../data/b64url";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";
import { FocusableButton } from "../components/FocusableButton";
import { Icon } from "../components/Icon";

/**
 * QR del control remoto por celular. Se escanea UNA vez: el teléfono guarda
 * el código (y la config Xtream para poder buscar en el catálogo) y queda
 * vinculado para siempre — se puede agregar a la pantalla de inicio.
 */
export function RemotePair() {
  const navigate = useNavigate();
  const companionUrl = useAppStore((s) => s.companionUrl);
  const remoteCode = useAppStore((s) => s.remoteCode);
  const source = useAppStore((s) => s.source);
  const kidsMode = useAppStore((s) => s.kidsMode);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => { if (kidsMode) navigate("/hub"); }, [kidsMode, navigate]);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "REMOTEPAIR" });
  useEffect(() => { focusWhenReady("RP_BACK"); }, []);
  useBack(() => { navigate("/setup"); });

  // La config viaja dentro del QR para que el celular busque en el catálogo
  // (solo Xtream; con M3U el control funciona igual, sin búsqueda).
  const sParam = source?.kind === "xtream" ? `&s=${encodeB64Url(source)}` : "";
  const url = companionUrl ? `${companionUrl}/remote.html?code=${remoteCode}${sParam}` : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#0a0a0c", light: "#f3f2f5" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <div className="a-top">
          <div className="a-logo">POTR<span>I</span></div>
          <div className="a-screentitle">Control remoto</div>
        </div>
        <div className="pair">
          {!companionUrl ? (
            <div className="pair-card">
              <Icon name="link_off" size={56} />
              <div className="pair-title">Falta la URL de vinculación</div>
              <div className="pair-desc">Cargá la URL de tu companion en <b>Mis Listas</b> (ej. https://tu-proyecto.pages.dev) y volvé acá.</div>
              <FocusableButton focusKey="RP_BACK" className="btn primary" onEnterPress={() => navigate("/setup")}>Ir a Mis Listas</FocusableButton>
            </div>
          ) : (
            <div className="pair-card">
              <div className="pair-qr">{qr ? <img src={qr} alt="QR" width={320} height={320} /> : <div className="spinner" />}</div>
              <div className="pair-side">
                <div className="pair-step"><span className="pair-num">1</span> Escaneá el QR con el celular (una sola vez)</div>
                <div className="pair-step"><span className="pair-num">2</span> Guardá la página en el inicio del teléfono</div>
                <div className="pair-step"><span className="pair-num">3</span> Buscá contenido y tocá ▶ para verlo en la TV</div>
                <div className="pair-desc" style={{ marginTop: 8 }}>También tenés pausa, volver y cambio de canal. El vínculo queda guardado en el celular.</div>
                <div className="pair-code">Código: <b>{remoteCode}</b></div>
                <FocusableButton focusKey="RP_BACK" className="btn" onEnterPress={() => navigate("/setup")}>Listo</FocusableButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
