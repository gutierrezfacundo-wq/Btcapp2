import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { FocusableButton } from "./FocusableButton";
import { Icon } from "./Icon";
import { PinDialog } from "./PinDialog";
import { useBack } from "../navigation/backStack";
import { focusWhenReady } from "../navigation/focusMemory";

const CLOSE_SECONDS = 45;

function closeApp() {
  try { (window as unknown as { webOS?: { platformBack?: () => void } }).webOS?.platformBack?.(); } catch { /* noop */ }
  try { window.close(); } catch { /* noop */ }
}

/**
 * Temporizador del modo Felix: cuando vence, pausa el video, tapa toda la
 * app con la pantalla "a dormir" y cierra la app tras una cuenta regresiva.
 * "Seguir usando" pide el PIN parental (si hay) y apaga el temporizador.
 */
export function KidsSleepGuard() {
  const kidsMode = useAppStore((s) => s.kidsMode);
  const endsAt = useAppStore((s) => s.kidsTimerEndsAt);
  const setKidsTimer = useAppStore((s) => s.setKidsTimer);
  const parentalPin = useAppStore((s) => s.parentalPin);

  const [expired, setExpired] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [closeIn, setCloseIn] = useState(CLOSE_SECONDS);
  const pinOpenRef = useRef(false); pinOpenRef.current = pinOpen;

  // Vigilar el vencimiento (chequeo liviano cada 5s).
  useEffect(() => {
    if (!kidsMode || !endsAt) { setExpired(false); return; }
    const check = () => { if (Date.now() >= endsAt) setExpired(true); };
    check();
    const t = window.setInterval(check, 5000);
    return () => window.clearInterval(t);
  }, [kidsMode, endsAt]);

  // Al vencer: pausar lo que se esté reproduciendo y contar para cerrar.
  useEffect(() => {
    if (!expired) return;
    try { (document.querySelector("video") as HTMLVideoElement | null)?.pause(); } catch { /* noop */ }
    focusWhenReady("SLEEP_MORE");
    setCloseIn(CLOSE_SECONDS);
    const t = window.setInterval(() => {
      setCloseIn((n) => {
        if (n <= 1) { window.clearInterval(t); closeApp(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [expired]);

  // Congelar la navegación del fondo mientras la pantalla está tapada.
  useEffect(() => {
    if (!expired) return;
    const onKey = (e: KeyboardEvent) => {
      if ([37, 38, 39, 40].includes(e.keyCode)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expired]);

  // Back no saca la pantalla (solo cierra el diálogo de PIN, que tiene su capa).
  useBack(() => { /* consumido */ }, expired && !pinOpen);

  const dismiss = () => { setKidsTimer(null); setPinOpen(false); setExpired(false); };

  if (!expired) return null;
  return (
    <div className="sleep-ov">
      <div className="sleep-moon">🌙</div>
      <div className="sleep-t">¡Se terminó por hoy, Felix!</div>
      <div className="sleep-s">Hora de descansar. La app se cierra en {closeIn} s…</div>
      <FocusableButton focusKey="SLEEP_MORE" className="btn sleep-btn" onEnterPress={() => (parentalPin ? setPinOpen(true) : dismiss())}>
        <Icon name="lock" /> Soy grande: seguir usando
      </FocusableButton>
      {pinOpen ? (
        <PinDialog
          mode="verify"
          expected={parentalPin}
          title="Modo grandes"
          onSuccess={dismiss}
          onClose={() => setPinOpen(false)}
        />
      ) : null}
    </div>
  );
}
