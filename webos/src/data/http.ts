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
        `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s): el servidor no respondió desde la TV.`,
      );
    }
    throw new HttpError(
      "No se pudo conectar desde la TV: revisá la URL, la red de la TV, o que el servidor no bloquee la conexión.",
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
