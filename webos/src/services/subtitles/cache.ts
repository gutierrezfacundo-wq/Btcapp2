// Caché simple con TTL sobre localStorage. Evita búsquedas/descargas repetidas.
// Es tolerante a fallos: si localStorage no está disponible, degrada a no-cache.

interface Entry<T> {
  at: number;
  ttl: number;
  value: T;
}

/** Contrato de caché para poder inyectar una implementación en memoria en tests. */
export interface SubtitleCache {
  get<T>(k: string): T | null;
  set<T>(k: string, value: T, ttl?: number): void;
}

export class TtlCache implements SubtitleCache {
  constructor(private readonly prefix: string, private readonly defaultTtl: number) {}

  private key(k: string): string {
    return `${this.prefix}:${k}`;
  }

  get<T>(k: string): T | null {
    try {
      const raw = localStorage.getItem(this.key(k));
      if (!raw) return null;
      const e = JSON.parse(raw) as Entry<T>;
      if (Date.now() - e.at > e.ttl) {
        localStorage.removeItem(this.key(k));
        return null;
      }
      return e.value;
    } catch {
      return null;
    }
  }

  set<T>(k: string, value: T, ttl = this.defaultTtl): void {
    try {
      const e: Entry<T> = { at: Date.now(), ttl, value };
      localStorage.setItem(this.key(k), JSON.stringify(e));
    } catch {
      /* cuota llena o storage no disponible: seguimos sin cache */
    }
  }
}
