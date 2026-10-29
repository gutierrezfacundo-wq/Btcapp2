import { DEVICE_NAME } from "../platform";

export class HttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      throw new HttpError(`El servidor respondió HTTP ${r.status}`, r.status);
    }
    return r;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if ((e as Error)?.name === "AbortError") {
      throw new HttpError(
        `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s): el servidor no respondió desde ${DEVICE_NAME}.`,
      );
    }
    throw new HttpError(
      `No se pudo conectar desde ${DEVICE_NAME}: revisá la URL, la conexión a internet, o que el servidor no bloquee la conexión.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, timeoutMs = 45000): Promise<string> {
  const r = await fetchWithTimeout(url, timeoutMs);
  return r.text();
}

export async function fetchJson<T>(url: string, timeoutMs = 30000): Promise<T> {
  const r = await fetchWithTimeout(url, timeoutMs);
  try {
    return (await r.json()) as T;
  } catch {
    throw new HttpError("El servidor devolvió una respuesta inválida (no es JSON). ¿Credenciales correctas?");
  }
}

/** Sin recibir ni un byte durante este tiempo, la descarga se da por muerta. */
const IDLE_TIMEOUT_MS = 30000;

/**
 * Baja una respuesta grande en pedazos, a medida que llegan, y se los pasa a
 * `onChunk`. Sirve para mandarlos a un worker sin juntar nunca decenas de MB
 * en el hilo principal (pedir el cuerpo entero con .text() o .arrayBuffer()
 * arma ese bloque de una sola vez y traba la TV un segundo largo).
 *
 * Límites: `headersTimeoutMs` hasta que responde el servidor (como el resto
 * de los pedidos) y después 30 s de inactividad, que se reinician con cada
 * pedazo. No hay tope total: un catálogo de 40 MB en una conexión lenta puede
 * tardar minutos y no por eso está colgado.
 * `signal` permite cancelarla desde afuera.
 */
export async function fetchChunks(
  url: string,
  headersTimeoutMs: number,
  onChunk: (chunk: Uint8Array) => void,
  signal?: AbortSignal,
): Promise<void> {
  const ctrl = new AbortController();
  let timedOut = 0;
  let timer = setTimeout(() => { timedOut = headersTimeoutMs; ctrl.abort(); }, headersTimeoutMs);
  const rearm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = IDLE_TIMEOUT_MS; ctrl.abort(); }, IDLE_TIMEOUT_MS);
  };
  const onOuterAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onOuterAbort);
  }
  try {
    let r: Response;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } catch (e) {
      throw networkError(e, timedOut);
    }
    if (!r.ok) throw new HttpError(`El servidor respondió HTTP ${r.status}`, r.status);
    rearm();
    if (!r.body) {
      onChunk(new Uint8Array(await r.arrayBuffer()));
      return;
    }
    const reader = r.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rearm();
        if (value && value.byteLength) onChunk(value);
      }
    } catch (e) {
      throw networkError(e, timedOut);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** `timedOutAfterMs`: si fue por un límite propio, cuál (0 = cancelada desde afuera o error de red). */
function networkError(e: unknown, timedOutAfterMs: number): HttpError {
  if (e instanceof HttpError) return e;
  if ((e as Error)?.name === "AbortError") {
    if (!timedOutAfterMs) return new HttpError("Descarga cancelada.");
    return new HttpError(
      `Tiempo de espera agotado (${Math.round(timedOutAfterMs / 1000)}s): el servidor no respondió desde ${DEVICE_NAME}.`,
    );
  }
  return new HttpError(
    `No se pudo conectar desde ${DEVICE_NAME}: revisá la URL, la conexión a internet, o que el servidor no bloquee la conexión.`,
  );
}
