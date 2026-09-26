// Codificación base64url para llevar datos chicos (la config a precargar) dentro
// de la URL del QR de vinculación. unescape/escape es el truco clásico para que
// btoa/atob (que solo manejan latin1) soporten UTF-8; funciona en el WebKit de webOS.

export function encodeB64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeB64Url<T>(s: string): T | null {
  try {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
  } catch {
    return null;
  }
}
