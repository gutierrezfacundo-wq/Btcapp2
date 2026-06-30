import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { Icon } from "../components/Icon";
import { useAppStore } from "../store/useAppStore";
import { fetchJson, fetchText } from "../data/http";
import { parseM3u } from "../data/m3u";
import type { SavedSource, SourceConfig } from "../data/types";

type Tab = "xtream" | "m3u";

export function Setup() {
  const navigate = useNavigate();
  const sources = useAppStore((s) => s.sources);
  const activeSourceId = useAppStore((s) => s.activeSourceId);
  const addSource = useAppStore((s) => s.addSource);
  const updateSource = useAppStore((s) => s.updateSource);
  const removeSource = useAppStore((s) => s.removeSource);
  const setActiveSource = useAppStore((s) => s.setActiveSource);

  // null = creando nueva; string = editando esa id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(sources.length === 0);

  const [tab, setTab] = useState<Tab>("xtream");
  const [name, setName] = useState("");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [m3uUrl, setM3uUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const { ref, focusKey } = useFocusable({ trackChildren: true, focusKey: "SETUP" });
  useEffect(() => {
    setFocus(sources.length === 0 ? "ED_NAME" : "SRC_0");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadIntoEditor = (s: SavedSource | null) => {
    setTestResult(null);
    if (!s) {
      setIsNew(true);
      setEditingId(null);
      setTab("xtream");
      setName(""); setServer(""); setUser(""); setPass("");
      setM3uUrl(""); setEpgUrl("");
      setFocus("ED_NAME");
      return;
    }
    setIsNew(false);
    setEditingId(s.id);
    setName(s.name);
    if (s.config.kind === "xtream") {
      setTab("xtream");
      setServer(s.config.server); setUser(s.config.username); setPass(s.config.password);
      setM3uUrl(""); setEpgUrl("");
    } else {
      setTab("m3u");
      setM3uUrl(s.config.playlistUrl); setEpgUrl(s.config.epgUrl ?? "");
      setServer(""); setUser(""); setPass("");
    }
    setFocus("ED_NAME");
  };

  const buildConfig = (): SourceConfig | null => {
    if (tab === "xtream") {
      if (!server.trim() || !user.trim() || !pass) return null;
      return { kind: "xtream", server: server.trim(), username: user.trim(), password: pass };
    }
    if (!m3uUrl.trim()) return null;
    return { kind: "m3u", playlistUrl: m3uUrl.trim(), epgUrl: epgUrl.trim() || undefined };
  };
  const config = buildConfig();

  const onTest = async () => {
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    try {
      if (config.kind === "m3u") {
        const text = await fetchText(config.playlistUrl, 30000);
        const ch = parseM3u(text).length;
        setTestResult(ch > 0 ? `ok:${ch} canales detectados` : "warn:Descargó pero no parece un M3U válido");
      } else {
        const url = `${config.server.replace(/\/+$/, "")}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;
        const info = await fetchJson<{ user_info?: { auth?: number; status?: string } }>(url, 20000);
        setTestResult(
          info.user_info?.auth === 1
            ? `ok:Usuario válido (${info.user_info.status ?? "activo"})`
            : "warn:El servidor rechazó las credenciales",
        );
      }
    } catch (e) {
      setTestResult(`err:${e instanceof Error ? e.message : "Error de conexión"}`);
    } finally {
      setTesting(false);
    }
  };

  const onSave = async (activate: boolean) => {
    if (!config) return;
    if (editingId) {
      updateSource(editingId, { name, config });
      if (activate) await setActiveSource(editingId);
    } else {
      const id = addSource(name, config);
      if (activate || sources.length === 0) {
        await setActiveSource(id);
        navigate("/hub");
        return;
      }
      setEditingId(id);
      setIsNew(false);
    }
  };

  const onDelete = () => {
    if (editingId) {
      removeSource(editingId);
      loadIntoEditor(null);
    }
  };

  const editorTitle = isNew ? "Nueva lista" : "Editar lista";

  const testTone = useMemo(() => {
    if (!testResult) return null;
    const [k, ...rest] = testResult.split(":");
    return { kind: k as "ok" | "warn" | "err", msg: rest.join(":") };
  }, [testResult]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="page mylists" ref={ref}>
        <div className="a-top">
          {sources.length > 0 ? (
            <FocusableButton className="a-railbtn back-inline" onEnterPress={() => navigate("/hub")}>
              <Icon name="arrow_back" />
            </FocusableButton>
          ) : null}
          <div className="a-logo">POTR<span>I</span></div>
          <div className="a-catnow">Mis listas</div>
        </div>

        <div className="ml-body">
          {/* Columna fuentes */}
          <aside className="ml-sources">
            <div className="ml-sources-h">
              <span className="ml-sources-t">LISTAS</span>
              <span className="ml-sources-c">{sources.length}</span>
            </div>
            <div className="ml-sources-list">
              {sources.map((s, i) => {
                const active = s.id === activeSourceId;
                const editing = s.id === editingId;
                return (
                  <FocusableButton
                    key={s.id}
                    focusKey={`SRC_${i}`}
                    className={`ml-src ${editing ? "editing" : ""}`}
                    onEnterPress={() => loadIntoEditor(s)}
                  >
                    <div className="ml-src-top">
                      <span className={`ml-badge ${s.config.kind}`}>
                        {s.config.kind === "xtream" ? "XTREAM" : "M3U"}
                      </span>
                      {active ? <span className="ml-active-flag">● Activa</span> : null}
                    </div>
                    <div className="ml-src-name">{s.name}</div>
                    <div className="ml-src-sub">
                      {s.config.kind === "xtream"
                        ? `${s.config.server} · ${s.config.username}`
                        : s.config.playlistUrl}
                    </div>
                  </FocusableButton>
                );
              })}
              <FocusableButton
                focusKey={`SRC_${sources.length}`}
                className="ml-add"
                onEnterPress={() => loadIntoEditor(null)}
              >
                <Icon name="add_circle" /> Agregar lista
              </FocusableButton>
            </div>
          </aside>

          {/* Editor */}
          <main className="ml-editor">
            <div className="ml-editor-t">{editorTitle}</div>
            <div className="ml-tabs">
              <FocusableButton
                className={`ml-tab ${tab === "xtream" ? "on" : ""}`}
                onEnterPress={() => setTab("xtream")}
              >
                Xtream Codes
              </FocusableButton>
              <FocusableButton
                className={`ml-tab ${tab === "m3u" ? "on" : ""}`}
                onEnterPress={() => setTab("m3u")}
              >
                Lista M3U
              </FocusableButton>
            </div>

            <div className="ml-fields">
              <label className="ml-field">
                <span className="ml-label"><Icon name="label" /> Nombre</span>
                <FocusableInput focusKey="ED_NAME" value={name} onChange={setName} placeholder="Mi proveedor" />
              </label>

              {tab === "xtream" ? (
                <>
                  <label className="ml-field">
                    <span className="ml-label"><Icon name="dns" /> Servidor</span>
                    <FocusableInput value={server} onChange={setServer} placeholder="http://host:puerto" />
                  </label>
                  <label className="ml-field">
                    <span className="ml-label"><Icon name="person" /> Usuario</span>
                    <FocusableInput value={user} onChange={setUser} placeholder="Usuario" />
                  </label>
                  <label className="ml-field">
                    <span className="ml-label"><Icon name="vpn_key" /> Contraseña</span>
                    <div className="ml-pass">
                      <FocusableInput
                        value={pass}
                        onChange={setPass}
                        placeholder="Contraseña"
                        type={showPass ? "text" : "password"}
                      />
                      <FocusableButton className="ml-eye" onEnterPress={() => setShowPass((v) => !v)}>
                        <Icon name={showPass ? "visibility_off" : "visibility"} />
                      </FocusableButton>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <label className="ml-field">
                    <span className="ml-label"><Icon name="link" /> URL de la lista</span>
                    <FocusableInput value={m3uUrl} onChange={setM3uUrl} placeholder="http://…/lista.m3u" />
                  </label>
                  <label className="ml-field">
                    <span className="ml-label"><Icon name="schedule" /> URL EPG (opcional)</span>
                    <FocusableInput value={epgUrl} onChange={setEpgUrl} placeholder="http://…/xmltv.php" />
                  </label>
                </>
              )}

              {testTone ? (
                <div className={`ml-test ${testTone.kind}`}>
                  <Icon name={testTone.kind === "ok" ? "check_circle" : testTone.kind === "warn" ? "info" : "wifi_off"} />
                  {testTone.msg}
                </div>
              ) : null}

              <div className="ml-actions">
                <FocusableButton className="btn" onEnterPress={onTest} disabled={!config || testing}>
                  {testing ? "Probando…" : "Probar conexión"}
                </FocusableButton>
                <FocusableButton className="btn primary" onEnterPress={() => onSave(true)} disabled={!config}>
                  {isNew ? "Crear y activar" : "Guardar y activar"}
                </FocusableButton>
                {!isNew ? (
                  <FocusableButton className="btn" onEnterPress={() => onSave(false)} disabled={!config}>
                    Guardar
                  </FocusableButton>
                ) : null}
                {editingId && editingId !== activeSourceId ? (
                  <FocusableButton className="btn" onEnterPress={() => setActiveSource(editingId)}>
                    Activar
                  </FocusableButton>
                ) : null}
                {editingId ? (
                  <FocusableButton className="btn danger" onEnterPress={onDelete}>
                    <Icon name="delete" /> Eliminar
                  </FocusableButton>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </FocusContext.Provider>
  );
}
