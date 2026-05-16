import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect } from "react";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { useAppStore } from "../store/useAppStore";

type Tab = "m3u" | "xtream";

export function Setup() {
  const navigate = useNavigate();
  const setSource = useAppStore((s) => s.setSource);
  const [tab, setTab] = useState<Tab>("m3u");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [m3uUrl, setM3uUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SETUP" });

  useEffect(() => {
    setFocus("SETUP");
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (tab === "m3u") {
        if (!m3uUrl.trim()) throw new Error("Pegá la URL de la lista");
        await setSource({
          kind: "m3u",
          playlistUrl: m3uUrl.trim(),
          epgUrl: epgUrl.trim() || undefined,
        });
      } else {
        if (!server.trim() || !user.trim() || !pass) throw new Error("Completá todos los campos");
        await setSource({
          kind: "xtream",
          server: server.trim(),
          username: user.trim(),
          password: pass,
        });
      }
      navigate("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    tab === "m3u"
      ? m3uUrl.trim().length > 0
      : server.trim().length > 0 && user.trim().length > 0 && pass.length > 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page" ref={ref}>
        <div className="topbar">Configurar fuente</div>
        <div className="tabs">
          <FocusableButton
            className={`tab ${tab === "m3u" ? "active" : ""}`}
            onEnterPress={() => setTab("m3u")}
          >
            Lista M3U
          </FocusableButton>
          <FocusableButton
            className={`tab ${tab === "xtream" ? "active" : ""}`}
            onEnterPress={() => setTab("xtream")}
          >
            Xtream Codes
          </FocusableButton>
        </div>

        <div className="setup-form">
          {tab === "m3u" ? (
            <>
              <FocusableInput
                value={m3uUrl}
                onChange={setM3uUrl}
                placeholder="URL .m3u o .m3u8"
              />
              <FocusableInput
                value={epgUrl}
                onChange={setEpgUrl}
                placeholder="URL EPG XMLTV (opcional)"
              />
            </>
          ) : (
            <>
              <FocusableInput
                value={server}
                onChange={setServer}
                placeholder="https://host:puerto"
              />
              <FocusableInput value={user} onChange={setUser} placeholder="Usuario" />
              <FocusableInput
                value={pass}
                onChange={setPass}
                placeholder="Contraseña"
                type="password"
              />
            </>
          )}

          <FocusableButton
            className="btn primary"
            onEnterPress={onSave}
            disabled={!canSave || saving}
          >
            {saving ? "Cargando…" : "Guardar y cargar"}
          </FocusableButton>

          {error ? <div className="error" style={{ padding: 0 }}>{error}</div> : null}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
