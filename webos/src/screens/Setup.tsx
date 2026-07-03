import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { FocusableButton } from "../components/FocusableButton";
import { FocusableInput } from "../components/FocusableInput";
import { PinDialog } from "../components/PinDialog";
import { Icon } from "../components/Icon";
import { Rail } from "../components/Rail";
import { TopBar } from "../components/TopBar";
import { Hints } from "../components/Hints";
import { useRailNav } from "../hooks/useRailNav";
import { useAppStore } from "../store/useAppStore";
import { useBack } from "../navigation/backStack";
import { fetchJson, fetchText } from "../data/http";
import { parseM3u } from "../data/m3u";
import { loadAccountInfo, type AccountInfo } from "../data/xtream";
import type { SavedSource, SourceConfig } from "../data/types";

type Tab = "xtream" | "m3u";

function relTime(ms?: number): string {
  if (!ms) return "—";
  const d = Date.now() - ms;
  const h = Math.floor(d / 3600000);
  if (h < 1) return "recién";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

export function Setup() {
  const navigate = useNavigate();
  const railNav = useRailNav();
  const sources = useAppStore((s) => s.sources);
  const activeSourceId = useAppStore((s) => s.activeSourceId);
  const addSource = useAppStore((s) => s.addSource);
  const updateSource = useAppStore((s) => s.updateSource);
  const removeSource = useAppStore((s) => s.removeSource);
  const setActiveSource = useAppStore((s) => s.setActiveSource);
  const source = useAppStore((s) => s.source);
  const companionUrl = useAppStore((s) => s.companionUrl);
  const setCompanionUrl = useAppStore((s) => s.setCompanionUrl);
  const nativeSubs = useAppStore((s) => s.nativeSubs);
  const setNativeSubs = useAppStore((s) => s.setNativeSubs);
  const epgOffsetH = useAppStore((s) => s.epgOffsetH);
  const setEpgOffsetH = useAppStore((s) => s.setEpgOffsetH);
  const epgAutoOn = useAppStore((s) => s.epgAutoOn);
  const setEpgAutoOn = useAppStore((s) => s.setEpgAutoOn);
  const epgAutoMs = useAppStore((s) => s.epgAutoMs);
  const kidsMode = useAppStore((s) => s.kidsMode);
  const parentalPin = useAppStore((s) => s.parentalPin);
  const setParentalPin = useAppStore((s) => s.setParentalPin);
  const [pinOpen, setPinOpen] = useState(false);

  // La configuración no es accesible dentro del modo Felix.
  useEffect(() => { if (kidsMode) navigate("/hub"); }, [kidsMode, navigate]);

  // Info de la cuenta Xtream activa (vencimiento/conexiones), mejor esfuerzo.
  const [acct, setAcct] = useState<AccountInfo | null>(null);
  useEffect(() => {
    setAcct(null);
    if (source?.kind === "xtream") loadAccountInfo(source).then(setAcct).catch(() => setAcct(null));
  }, [source]);

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

  // Back: con lista activa vuelve al Inicio; sin lista, deja pasar (raíz).
  useBack(() => {
    if (source) { navigate("/hub"); return; }
    return false;
  });
  useEffect(() => {
    setFocus(sources.length === 0 ? "ED_NAME" : "SRC_0");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadIntoEditor = (s: SavedSource | null) => {
    setTestResult(null);
    if (!s) {
      setIsNew(true); setEditingId(null); setTab("xtream");
      setName(""); setServer(""); setUser(""); setPass(""); setM3uUrl(""); setEpgUrl("");
      setFocus("ED_NAME");
      return;
    }
    setIsNew(false); setEditingId(s.id); setName(s.name);
    if (s.config.kind === "xtream") {
      setTab("xtream"); setServer(s.config.server); setUser(s.config.username); setPass(s.config.password);
      setM3uUrl(""); setEpgUrl("");
    } else {
      setTab("m3u"); setM3uUrl(s.config.playlistUrl); setEpgUrl(s.config.epgUrl ?? "");
      setServer(""); setUser(""); setPass("");
    }
    setFocus("ED_NAME");
  };

  const config = useMemo<SourceConfig | null>(() => {
    if (tab === "xtream") {
      if (!server.trim() || !user.trim() || !pass) return null;
      return { kind: "xtream", server: server.trim(), username: user.trim(), password: pass };
    }
    if (!m3uUrl.trim()) return null;
    return { kind: "m3u", playlistUrl: m3uUrl.trim(), epgUrl: epgUrl.trim() || undefined };
  }, [tab, server, user, pass, m3uUrl, epgUrl]);

  const onTest = async () => {
    if (!config) return;
    setTesting(true); setTestResult(null);
    try {
      if (config.kind === "m3u") {
        const ch = parseM3u(await fetchText(config.playlistUrl, 30000)).length;
        setTestResult(ch > 0 ? `ok:Conexión OK · ${ch} canales` : "err:Descargó pero no es un M3U válido");
      } else {
        const url = `${config.server.replace(/\/+$/, "")}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;
        const info = await fetchJson<{ user_info?: { auth?: number; status?: string } }>(url, 20000);
        setTestResult(info.user_info?.auth === 1 ? `ok:Conexión OK · usuario válido` : "err:Credenciales rechazadas");
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
      if (activate || sources.length === 0) { await setActiveSource(id); navigate("/hub"); return; }
      setEditingId(id); setIsNew(false);
    }
  };

  const tone = useMemo(() => {
    if (!testResult) return null;
    const [k, ...rest] = testResult.split(":");
    return { kind: k as "ok" | "err", msg: rest.join(":") };
  }, [testResult]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div className="ascreen" ref={ref}>
        <TopBar title="Mis Listas" />
        <div className="a-body">
          <Rail active="settings" onSelect={railNav} />
          <div className="a-screen">
            <div className="lists">
              {/* Columna fuentes */}
              <div className="src-col">
                <div className="src-h">
                  <div className="src-h-t">Mis Listas</div>
                  <div className="src-h-c">{sources.length} listas</div>
                  <div className="src-h-c mono">
                    build {new Date(__BUILD_TIME__).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="src-list scroll">
                  {sources.map((s, i) => {
                    const active = s.id === activeSourceId;
                    return (
                      <FocusableButton
                        key={s.id}
                        focusKey={`SRC_${i}`}
                        className={`src-card ${s.id === editingId ? "editing" : ""} ${active ? "active-src" : ""}`}
                        onEnterPress={() => loadIntoEditor(s)}
                      >
                        <div className="src-card-top">
                          <span className={`src-badge ${s.config.kind}`}>{s.config.kind === "xtream" ? "XTREAM" : "M3U"}</span>
                          <span className="src-name">{s.name}</span>
                          {active ? <span className="src-activeflag"><Icon name="check_circle" /> Activa</span> : null}
                        </div>
                        <div className="src-meta">
                          {s.config.kind === "xtream" ? `${s.config.server} · ${s.config.username}` : s.config.playlistUrl}
                        </div>
                        <div className="src-foot">
                          <span className={`src-status ${active ? "active" : s.status === "error" ? "error" : "ok"}`}>
                            <span className="dot" /> {active ? "Activa" : s.status === "error" ? "Error de conexión" : "Conectada"}
                          </span>
                          {s.channelCount != null ? <><span className="sep">·</span><span>{s.channelCount} canales</span></> : null}
                          <span className="sep">·</span><span>{relTime(s.lastUpdated)}</span>
                        </div>
                        {active && acct?.expDate ? (
                          <div className={`src-exp ${acct.expDate - Date.now() < 7 * 86400000 ? "soon" : ""}`}>
                            <Icon name="event" /> Vence el {new Date(acct.expDate).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })}
                            {" "}({Math.max(0, Math.ceil((acct.expDate - Date.now()) / 86400000))} días)
                            {acct.maxCons ? <> · {acct.activeCons ?? 0}/{acct.maxCons} conexiones</> : null}
                          </div>
                        ) : null}
                      </FocusableButton>
                    );
                  })}
                  <FocusableButton focusKey={`SRC_${sources.length}`} className="src-add" onEnterPress={() => loadIntoEditor(null)}>
                    <Icon name="add_circle" /> Agregar lista
                  </FocusableButton>
                </div>
              </div>

              {/* Editor */}
              <div className="edt">
                <div className="edt-h"><Icon name="vpn_key" /> {isNew ? "Nueva lista" : "Editar lista"}</div>
                <div className="edt-tabs">
                  <FocusableButton className={`edt-tab ${tab === "xtream" ? "on" : ""}`} onEnterPress={() => setTab("xtream")}>
                    <Icon name="dns" /> Xtream Codes
                  </FocusableButton>
                  <FocusableButton className={`edt-tab ${tab === "m3u" ? "on" : ""}`} onEnterPress={() => setTab("m3u")}>
                    <Icon name="link" /> Lista M3U
                  </FocusableButton>
                </div>

                <div className="edt-form scroll">
                  <div className="fld">
                    <div className="fld-l">Nombre de la lista</div>
                    <div className="fld-in"><Icon name="label" /><FocusableInput focusKey="ED_NAME" value={name} onChange={setName} placeholder="Mi proveedor" /></div>
                  </div>

                  {tab === "xtream" ? (
                    <>
                      <div className="fld">
                        <div className="fld-l">Servidor</div>
                        <div className="fld-in"><Icon name="dns" /><FocusableInput value={server} onChange={setServer} placeholder="http://host:puerto" /></div>
                      </div>
                      <div className="fld-row">
                        <div className="fld">
                          <div className="fld-l">Usuario</div>
                          <div className="fld-in"><Icon name="person" /><FocusableInput value={user} onChange={setUser} placeholder="Usuario" /></div>
                        </div>
                        <div className="fld">
                          <div className="fld-l">Contraseña</div>
                          <div className="fld-in">
                            <Icon name="lock" />
                            <FocusableInput value={pass} onChange={setPass} placeholder="Contraseña" type={showPass ? "text" : "password"} />
                            <FocusableButton className="eye" onEnterPress={() => setShowPass((v) => !v)}>
                              <Icon name={showPass ? "visibility_off" : "visibility"} />
                            </FocusableButton>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="fld">
                        <div className="fld-l">URL de la lista (.m3u / .m3u8)</div>
                        <div className="fld-in"><Icon name="link" /><FocusableInput value={m3uUrl} onChange={setM3uUrl} placeholder="http://…/lista.m3u" /></div>
                      </div>
                      <div className="fld">
                        <div className="fld-l">URL EPG XMLTV (opcional)</div>
                        <div className="fld-in"><Icon name="schedule" /><FocusableInput value={epgUrl} onChange={setEpgUrl} placeholder="http://…/xmltv.php" /></div>
                      </div>
                    </>
                  )}

                  {tone ? (
                    <div className={`edt-test ${tone.kind}`}>
                      <Icon name={tone.kind === "ok" ? "check_circle" : "wifi_off"} /> {tone.msg}
                    </div>
                  ) : testing ? (
                    <div className="edt-test testing"><span className="spin" /> Probando…</div>
                  ) : null}

                  <div className="edt-actions">
                    <FocusableButton className="btn ghost" onEnterPress={onTest} disabled={!config || testing}>
                      <Icon name="wifi" /> Probar conexión
                    </FocusableButton>
                    <FocusableButton className="btn primary grow" onEnterPress={() => onSave(true)} disabled={!config}>
                      <Icon name="save" /> {isNew ? "Crear y activar" : "Guardar cambios"}
                    </FocusableButton>
                    {editingId && editingId !== activeSourceId ? (
                      <FocusableButton className="btn" onEnterPress={async () => { await setActiveSource(editingId); navigate("/hub"); }}>
                        <Icon name="power_settings_new" /> Activar
                      </FocusableButton>
                    ) : null}
                    {editingId ? (
                      <FocusableButton className="btn danger" onEnterPress={() => { removeSource(editingId); loadIntoEditor(null); }}>
                        <Icon name="delete" /> Eliminar
                      </FocusableButton>
                    ) : null}
                  </div>

                  <div className="fld" style={{ marginTop: 18 }}>
                    <label className="fld-l"><Icon name="closed_caption" /> Subtítulos embebidos (reproductor nativo webOS)</label>
                    <FocusableButton className={`btn ${nativeSubs ? "primary" : ""}`} onEnterPress={() => setNativeSubs(!nativeSubs)}>
                      <Icon name={nativeSubs ? "toggle_on" : "toggle_off"} /> {nativeSubs ? "Activado" : "Desactivado"}
                    </FocusableButton>
                    <div className="a-pdesc" style={{ marginTop: 6 }}>Usa el pipeline nativo de webOS para exponer/renderizar subtítulos embebidos de las pelis/series. Si algún video no reproduce en la TV, desactivalo (cae al modo estándar).</div>
                  </div>

                  <div className="fld" style={{ marginTop: 18 }}>
                    <label className="fld-l"><Icon name="schedule" /> Corrección horaria de la guía (EPG)</label>
                    <FocusableButton className={`btn ${epgAutoOn ? "primary" : ""}`} onEnterPress={() => setEpgAutoOn(!epgAutoOn)}>
                      <Icon name={epgAutoOn ? "toggle_on" : "toggle_off"} /> Automática {epgAutoOn && epgAutoMs !== 0 ? `· ${epgAutoMs > 0 ? "+" : "−"}${Math.abs(epgAutoMs) % 3600000 === 0 ? `${Math.abs(epgAutoMs) / 3600000} h` : `${Math.round(Math.abs(epgAutoMs) / 60000)} min`} detectados` : epgAutoOn ? "· sin desfasaje detectado" : ""}
                    </FocusableButton>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                      <FocusableButton className="btn" onEnterPress={() => setEpgOffsetH(epgOffsetH - 1)}><Icon name="remove" /></FocusableButton>
                      <span className="mono" style={{ fontSize: 24, minWidth: 90, textAlign: "center" }}>{epgOffsetH > 0 ? `+${epgOffsetH}` : epgOffsetH} h</span>
                      <FocusableButton className="btn" onEnterPress={() => setEpgOffsetH(epgOffsetH + 1)}><Icon name="add" /></FocusableButton>
                    </div>
                    <div className="a-pdesc" style={{ marginTop: 6 }}>La corrección automática compara el reloj del proveedor con el de la TV y endereza la guía sola. El ±h queda como ajuste fino manual (se suma a la automática).</div>
                  </div>

                  <div className="fld" style={{ marginTop: 18 }}>
                    <label className="fld-l"><Icon name="category" /> Categorías</label>
                    <FocusableButton className="btn" onEnterPress={() => navigate("/categories")}>
                      <Icon name="tune" /> Gestionar categorías
                    </FocusableButton>
                    <div className="a-pdesc" style={{ marginTop: 6 }}>Ocultá las categorías que no usás y cambiales el orden. Se guarda por lista y afecta En vivo, Películas y Series. Ahí también marcás las categorías aptas para el modo Felix.</div>
                  </div>

                  <div className="fld" style={{ marginTop: 18 }}>
                    <label className="fld-l"><Icon name="child_care" /> Modo Felix (niños)</label>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <FocusableButton className="btn primary" onEnterPress={() => navigate("/categories?view=kids")}>
                        <Icon name="child_care" /> Elegir contenido apto
                      </FocusableButton>
                      <FocusableButton className="btn" onEnterPress={() => setPinOpen(true)}>
                        <Icon name="lock" /> {parentalPin ? "Cambiar PIN" : "Establecer PIN"}
                      </FocusableButton>
                      {parentalPin ? (
                        <FocusableButton className="btn danger" onEnterPress={() => setParentalPin("")}>
                          <Icon name="lock_open" /> Quitar PIN
                        </FocusableButton>
                      ) : null}
                    </div>
                    <div className="a-pdesc" style={{ marginTop: 6 }}>
                      {parentalPin
                        ? "PIN configurado: salir del modo Felix pide el PIN."
                        : "Sin PIN, cualquiera puede salir del modo Felix. Configuralo para protegerlo."}
                      {" "}El modo se activa desde la caja “Felix” del Inicio.
                    </div>
                  </div>

                  {acct ? (
                    <div className="fld" style={{ marginTop: 18 }}>
                      <label className="fld-l"><Icon name="badge" /> Cuenta</label>
                      <div className="acct-row">
                        <span className={`src-status ${acct.status?.toLowerCase() === "active" ? "ok" : "error"}`}><span className="dot" /> {acct.status?.toLowerCase() === "active" ? "Activa" : acct.status ?? "—"}</span>
                        {acct.expDate ? <><span className="sep">·</span><span>Vence {new Date(acct.expDate).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })}</span></> : null}
                        {acct.maxCons ? <><span className="sep">·</span><span>Conexiones {acct.activeCons ?? 0}/{acct.maxCons}</span></> : null}
                        {acct.trial ? <><span className="sep">·</span><span>Prueba</span></> : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="fld" style={{ marginTop: 18 }}>
                    <label className="fld-l"><Icon name="qr_code_2" /> Configurar desde el celular (QR)</label>
                    <div className="fld-in">
                      <Icon name="link" />
                      <FocusableInput value={companionUrl} onChange={setCompanionUrl} placeholder="URL de tu companion, ej. https://tu-proyecto.pages.dev" />
                    </div>
                    <div className="a-pdesc" style={{ marginTop: 6 }}>Pegá la URL de la app web que desplegaste (Cloudflare Pages). Después tocá “Vincular” para mostrar el QR.</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      <FocusableButton
                        className="btn primary"
                        disabled={!companionUrl}
                        onEnterPress={() => navigate("/pair", { state: { prefill: { name, source: config } } })}
                      >
                        <Icon name="qr_code_2" /> Configurar lista desde el celular
                      </FocusableButton>
                      <FocusableButton
                        className="btn"
                        disabled={!companionUrl}
                        onEnterPress={() => navigate("/remote")}
                      >
                        <Icon name="settings_remote" /> Control remoto (celular)
                      </FocusableButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {pinOpen ? (
          <PinDialog
            mode="set"
            title="Nuevo PIN parental"
            onSuccess={(p) => { setParentalPin(p); setPinOpen(false); }}
            onClose={() => setPinOpen(false)}
          />
        ) : null}
        <Hints items={[{ k: "↕↔", label: "Navegar" }, { k: "OK", label: "Seleccionar" }, { k: "Esc", label: "Volver" }]} />
      </div>
    </FocusContext.Provider>
  );
}
