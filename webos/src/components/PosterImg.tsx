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

// ============================================================
// Cola de descargas. Antes cada póster montado salía a bajarse en el acto:
// ~50 pedidos simultáneos al abrir el Inicio y ~140 en Películas, compitiendo
// con la descarga del catálogo y con el hilo principal de la TV. Ahora: pocas
// a la vez, lo último que se montó primero (suele ser lo que está en
// pantalla), sin repetir la misma URL, y lo que salió de pantalla antes de
// empezar a bajarse se descarta.
// ============================================================
const MAX_ACTIVE = 4;
/** Un póster que no termina en este tiempo libera su lugar en la cola: si no,
 *  cuatro imágenes de un servidor muerto bloqueaban todas las demás. */
const POSTER_TIMEOUT_MS = 8000;

interface Job {
  src: string;
  waiters: Set<(url: string) => void>;
  started: boolean;
}

const jobs = new Map<string, Job>(); // en cola o bajando
const stack: Job[] = [];             // todavía sin empezar (LIFO)
let active = 0;

function finish(job: Job, url: string) {
  jobs.delete(job.src);
  for (const cb of job.waiters) cb(url);
}

function pump() {
  while (active < MAX_ACTIVE && stack.length) {
    const job = stack.pop()!;
    job.started = true;
    active++;
    // Una vez empezada, la descarga se completa aunque la fila se desmonte
    // (scroll rápido): deja el póster cacheado para la próxima.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), POSTER_TIMEOUT_MS);
    fetch(job.src, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        const obj = URL.createObjectURL(b);
        remember(job.src, obj);
        finish(job, obj);
      })
      .catch(() => finish(job, job.src)) // CORS/error/timeout: <img> directo como antes
      .finally(() => {
        clearTimeout(timer);
        active--;
        pump();
      });
  }
}

/** Pide un póster; devuelve la función para retirar el pedido al desmontar. */
function requestPoster(src: string, cb: (url: string) => void): () => void {
  let job = jobs.get(src);
  if (!job) {
    job = { src, waiters: new Set(), started: false };
    jobs.set(src, job);
    stack.push(job);
  } else if (!job.started) {
    // Lo volvieron a pedir: pasa adelante.
    const i = stack.indexOf(job);
    if (i >= 0) { stack.splice(i, 1); stack.push(job); }
  }
  job.waiters.add(cb);
  pump();
  const j = job;
  return () => {
    j.waiters.delete(cb);
    if (!j.started && j.waiters.size === 0) {
      const i = stack.indexOf(j);
      if (i >= 0) stack.splice(i, 1);
      jobs.delete(j.src);
    }
  };
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
    return requestPoster(src, setUrl);
  }, [src]);

  if (!url) return null; // bajando: queda visible el placeholder de la tarjeta
  return <img src={url} alt="" decoding="async" className={className} style={style} />;
}
