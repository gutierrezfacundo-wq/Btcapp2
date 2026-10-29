// Puente mínimo al bus Luna de webOS (API de sistema de LG). Las web apps
// acceden vía window.PalmServiceBridge; fuera de la TV es no-op seguro.
// Es el mecanismo que usan las apps IPTV nativas-web (Hot IPTV, etc.) para
// hablar con el pipeline de medios (com.webos.media).

interface PalmServiceBridgeLike {
  onservicecallback: ((msg: string) => void) | null;
  call(uri: string, params: string): void;
  cancel(): void;
}

declare global {
  interface Window {
    PalmServiceBridge?: new () => PalmServiceBridgeLike;
  }
}

export function hasLuna(): boolean {
  return typeof window !== "undefined" && typeof window.PalmServiceBridge === "function";
}

/**
 * Llama a un método Luna. Con `subscribe: true` el callback se invoca por cada
 * mensaje hasta cancelar. Devuelve una función para cancelar la llamada.
 */
export function lunaCall<T = Record<string, unknown>>(
  uri: string,
  method: string,
  params: Record<string, unknown>,
  onResponse?: (r: T) => void,
  subscribe = false,
): () => void {
  if (!hasLuna()) return () => undefined;
  try {
    const bridge = new (window.PalmServiceBridge as NonNullable<typeof window.PalmServiceBridge>)();
    bridge.onservicecallback = (msg: string) => {
      try { onResponse?.(JSON.parse(msg) as T); } catch { /* mensaje no-JSON: ignorar */ }
    };
    bridge.call(`${uri}/${method}`, JSON.stringify(subscribe ? { ...params, subscribe: true } : params));
    return () => { try { bridge.cancel(); } catch { /* noop */ } };
  } catch {
    return () => undefined;
  }
}
