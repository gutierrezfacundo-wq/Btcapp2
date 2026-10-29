// Descarga y parseo de las respuestas grandes (películas, series, guía XMLTV)
// sin trabar el hilo principal.
//
// - La descarga se hace acá, en el hilo principal (en la TV la app corre sin
//   restricciones CORS; un worker podría no tenerlas). Los pedazos se le pasan
//   al worker a medida que llegan, transferidos, sin juntarlos nunca acá.
// - El worker va embebido en el bundle (?worker&inline → se crea desde un
//   Blob), así no depende de que la TV permita cargar un .js de file://.
// - Antes de usarlo se le hace un ping. Si no contesta (webOS viejo, política
//   del navegador) o se cae, todo sigue por el camino de respaldo en el hilo
//   principal, que da exactamente el mismo resultado.

import ParseWorker from "./parse.worker?worker&inline";
import type { WorkerJob } from "./parse.worker";
import { mapCatalogList, type CatalogJob } from "./xtreamMap";
import { parseXmltvChunked } from "./xmltv";
import { fetchChunks, HttpError } from "./http";
import type { EpgProgram } from "./types";

const INVALID_JSON = "El servidor devolvió una respuesta inválida (no es JSON). ¿Credenciales correctas?";

type WorkerMsg =
  | { type: "pong"; id: number }
  | { type: "batch"; id: number; items: unknown[] }
  | { type: "epg"; id: number; entries: [string, EpgProgram[]][] }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };

class WorkerCrash extends Error {}

// Estado del worker: se crea una vez; "broken" solo si falla de verdad (evento
// error). Que el ping tarde no lo descarta: con la TV ocupada justo en ese
// momento, el pong puede llegar tarde y desde ahí se usa normalmente.
let worker: Worker | null = null;
let state: "none" | "pinging" | "ok" | "broken" = "none";
const pingWaiters = new Set<(w: Worker | null) => void>();
const PING_ID = 0;
let nextId = 1;
/** Trabajos en curso: si el worker se cae, se les avisa a todos. */
const activeJobs = new Set<(err: Error) => void>();

function settlePing(w: Worker | null) {
  for (const cb of pingWaiters) cb(w);
  pingWaiters.clear();
}

function getWorker(): Promise<Worker | null> {
  if (state === "ok") return Promise.resolve(worker);
  if (state === "broken") return Promise.resolve(null);
  if (state === "none") {
    try {
      worker = new ParseWorker();
    } catch {
      state = "broken";
      return Promise.resolve(null);
    }
    state = "pinging";
    worker.addEventListener("message", (e: MessageEvent<WorkerMsg>) => {
      if (e.data?.type === "pong" && e.data.id === PING_ID && state === "pinging") {
        state = "ok";
        settlePing(worker);
      }
    });
    worker.addEventListener("error", () => disableWorker());
    worker.postMessage({ type: "ping", id: PING_ID });
  }
  // Este pedido espera un rato; si no hay respuesta va por el respaldo, pero
  // el worker sigue vivo para los próximos.
  return new Promise<Worker | null>((resolve) => {
    const cb = (w: Worker | null) => { clearTimeout(t); resolve(w); };
    const t = setTimeout(() => { pingWaiters.delete(cb); resolve(null); }, 5000);
    pingWaiters.add(cb);
  });
}

/** El worker falló de verdad: no se lo vuelve a usar en esta sesión. */
function disableWorker() {
  if (state === "broken") return;
  state = "broken";
  try { worker?.terminate(); } catch { /* noop */ }
  worker = null;
  settlePing(null);
  // Un worker terminado no emite nada más: los trabajos en curso se cierran acá.
  for (const fail of [...activeJobs]) fail(new WorkerCrash("worker"));
}

/** Arranca el worker de antemano (en un momento libre) para no esperar el ping después. */
export function warmUpParser(): void {
  void getWorker();
}

/**
 * Baja `url` mandándole los pedazos al worker y junta lo que devuelve.
 * `onMsg` recibe los lotes; la promesa termina con "done".
 */
function streamThroughWorker(
  w: Worker,
  url: string,
  timeoutMs: number,
  job: WorkerJob,
  onMsg: (m: WorkerMsg) => void,
): Promise<void> {
  const id = nextId++;
  const download = new AbortController();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let hang: ReturnType<typeof setTimeout> | undefined;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(hang);
      activeJobs.delete(finish);
      w.removeEventListener("message", handler);
      if (err) {
        download.abort(); // que no siga bajando en paralelo con un reintento
        try { w.postMessage({ type: "abort", id }); } catch { /* worker ya terminado */ }
        reject(err);
      } else {
        resolve();
      }
    };
    const handler = (e: MessageEvent<WorkerMsg>) => {
      const m = e.data;
      if (!m || m.id !== id) return;
      if (m.type === "done") finish();
      else if (m.type === "error") finish(m.message === "json" ? new HttpError(INVALID_JSON) : new Error(m.message));
      else onMsg(m);
    };
    activeJobs.add(finish);
    w.addEventListener("message", handler);

    w.postMessage({ type: "begin", id, job });
    fetchChunks(url, timeoutMs, (chunk) => {
      if (settled) return;
      // Transferir requiere un buffer propio y completo.
      const own = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
        ? chunk
        : chunk.slice();
      w.postMessage({ type: "chunk", id, buf: own.buffer }, [own.buffer]);
    }, download.signal).then(
      () => {
        if (settled) return;
        w.postMessage({ type: "end", id });
        // Recién ahora corre el reloj del parseo: la descarga puede tardar lo
        // que tenga que tardar, pero parsear no debería llevar minutos.
        hang = setTimeout(() => finish(new WorkerCrash("timeout")), 120000);
      },
      (err: Error) => finish(err),
    );
  });
}

/** Respaldo: baja y decodifica de a pedazos en el hilo principal. */
async function fetchTextChunked(url: string, timeoutMs: number): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  await fetchChunks(url, timeoutMs, (chunk) => parts.push(decoder.decode(chunk, { stream: true })));
  parts.push(decoder.decode());
  return parts.join("");
}

/** Películas o series de Xtream: baja, parsea y arma los objetos. */
export async function loadCatalogStream<T>(url: string, timeoutMs: number, job: CatalogJob): Promise<T[]> {
  const w = await getWorker();
  if (w) {
    const out: T[] = [];
    try {
      await streamThroughWorker(w, url, timeoutMs, job, (m) => {
        if (m.type === "batch") for (const it of m.items) out.push(it as T);
      });
      return out;
    } catch (e) {
      if (!(e instanceof WorkerCrash)) throw e; // error de red, JSON inválido: error real
      disableWorker(); // se cayó: se reintenta abajo, en el hilo principal
    }
  }
  const text = await fetchTextChunked(url, timeoutMs);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(INVALID_JSON);
  }
  return mapCatalogList(job, parsed) as T[];
}

/** Guía XMLTV: baja y parsea solo los canales y la ventana de tiempo pedidos. */
export async function loadXmltvStream(
  url: string,
  timeoutMs: number,
  opts: { keepChannels?: Set<string>; fromMs: number; toMs: number },
): Promise<Map<string, EpgProgram[]>> {
  const w = await getWorker();
  if (w) {
    const map = new Map<string, EpgProgram[]>();
    try {
      await streamThroughWorker(w, url, timeoutMs, {
        kind: "xmltv",
        keep: opts.keepChannels ? [...opts.keepChannels] : null,
        fromMs: opts.fromMs,
        toMs: opts.toMs,
      }, (m) => {
        if (m.type === "epg") for (const [ch, list] of m.entries) map.set(ch, list);
      });
      return map;
    } catch (e) {
      if (!(e instanceof WorkerCrash)) throw e;
      disableWorker();
    }
  }
  const xml = await fetchTextChunked(url, timeoutMs);
  return parseXmltvChunked(xml, opts);
}
