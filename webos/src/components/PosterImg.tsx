import { useEffect, useState, type CSSProperties } from "react";

// ============================================================
// Cache en memoria de pósters (blob URLs con LRU): al volver a
// Películas/Series las imágenes aparecen al instante en vez de
// re-descargarse (muchos proveedores las sirven sin cabeceras de
// caché y el navegador de la TV las vuelve a pedir cada vez).
// ============================================================
const cache = new Map<string, string>(); // url → objectURL (orden de inserción = LRU)
const MAX = 400;

function remember(url: string, obj: string) {
  if (cache.has(url)) cache.delete(url);
  cache.set(url, obj);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value as string;
    const old = cache.get(oldest);
    cache.delete(oldest);
    if (old) URL.revokeObjectURL(old);
  }
}

export function PosterImg({ src, className, style }: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [url, setUrl] = useState<string>(() => cache.get(src) ?? "");

  useEffect(() => {
    const hit = cache.get(src);
    if (hit) { remember(src, hit); setUrl(hit); return; }
    let alive = true;
    // Sin abort a propósito: aunque la fila se desmonte (scroll rápido),
    // completar la descarga deja el póster cacheado para la próxima.
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        const obj = URL.createObjectURL(b);
        remember(src, obj);
        if (alive) setUrl(obj);
      })
      .catch(() => { if (alive) setUrl(src); }); // CORS/error: <img> directo como antes
    return () => { alive = false; };
  }, [src]);

  if (!url) return null; // bajando: queda visible el placeholder de la tarjeta
  return <img src={url} alt="" decoding="async" className={className} style={style} />;
}
