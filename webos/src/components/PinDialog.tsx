import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useBack } from "../navigation/backStack";

interface Props {
  /** "verify": comprobar contra `expected`. "set": ingresar y repetir para crear. */
  mode: "verify" | "set";
  expected?: string;
  title: string;
  onSuccess: (pin: string) => void;
  onClose: () => void;
}

/** Diálogo de PIN de 4 dígitos: se ingresa con los números del control remoto. */
export function PinDialog({ mode, expected, title, onSuccess, onClose }: Props) {
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null); // modo "set": primera entrada
  const [err, setErr] = useState<string | null>(null);

  useBack(() => { onClose(); });

  useEffect(() => {
    const submit = (p: string) => {
      if (mode === "verify") {
        if (p === expected) { onSuccess(p); return; }
        setErr("PIN incorrecto");
        setPin("");
        return;
      }
      if (first === null) { setFirst(p); setPin(""); return; }
      if (first === p) { onSuccess(p); return; }
      setErr("No coinciden, probá de nuevo");
      setFirst(null);
      setPin("");
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.keyCode;
      let d = -1;
      if (k >= 48 && k <= 57) d = k - 48;
      else if (k >= 96 && k <= 105) d = k - 96;
      if (d >= 0) {
        e.preventDefault(); e.stopPropagation();
        setErr(null);
        setPin((p) => {
          const n = (p + String(d)).slice(0, 4);
          if (n.length === 4) window.setTimeout(() => submit(n), 150);
          return n;
        });
        return;
      }
      if (k === 8 || k === 46) { e.preventDefault(); e.stopPropagation(); setPin((p) => p.slice(0, -1)); return; }
      // Congelar la navegación del fondo (flechas/OK) mientras el PIN está abierto.
      if ([13, 37, 38, 39, 40].includes(k)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expected, first, onSuccess]);

  return (
    <div className="pin-ov">
      <div className="pin-card">
        <Icon name="lock" size={44} className="pin-ic" />
        <div className="pin-t">{title}</div>
        <div className="pin-sub">
          {mode === "set"
            ? first === null ? "Ingresá 4 números con el control" : "Repetí el PIN para confirmar"
            : "Ingresá el PIN con los números del control"}
        </div>
        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${pin.length > i ? "on" : ""}`} />)}
        </div>
        {err ? <div className="pin-err">{err}</div> : null}
        <div className="pin-hint">Botón Volver para cancelar</div>
      </div>
    </div>
  );
}
