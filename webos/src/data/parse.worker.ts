// Web Worker: decodifica y parsea las respuestas grandes (películas, series y
// la guía XMLTV) fuera del hilo principal, para que el control remoto no se
// trabe.
//
// La descarga NO se hace acá: queda en el hilo principal, donde la app de la
// TV corre sin restricciones CORS. Los pedazos llegan a medida que se bajan
// (transferidos, sin copia) y se decodifican al vuelo. El resultado vuelve en
// lotes chicos: cada lote se deserializa en su propia tarea, y entre uno y
// otro la app atiende las teclas.

import { mapCatalogList, type CatalogJob } from "./xtreamMap";
import { parseXmltvChunked } from "./xmltv";
import type { EpgProgram } from "./types";

export type XmltvJob = { kind: "xmltv"; keep: string[] | null; fromMs: number; toMs: number };
export type WorkerJob = CatalogJob | XmltvJob;

type Request =
  | { type: "ping"; id: number }
  | { type: "begin"; id: number; job: WorkerJob }
  | { type: "chunk"; id: number; buf: ArrayBuffer }
  | { type: "end"; id: number }
  | { type: "abort"; id: number };

const BATCH_ITEMS = 2000;
const BATCH_PROGRAMS = 3000;

const ctx = self as unknown as {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent<Request>) => void) | null;
};

const jobs = new Map<number, { job: WorkerJob; decoder: TextDecoder; parts: string[] }>();

ctx.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "ping":
      ctx.postMessage({ type: "pong", id: msg.id });
      return;
    case "begin":
      jobs.set(msg.id, { job: msg.job, decoder: new TextDecoder("utf-8"), parts: [] });
      return;
    case "chunk": {
      const j = jobs.get(msg.id);
      if (j) j.parts.push(j.decoder.decode(new Uint8Array(msg.buf), { stream: true }));
      return;
    }
    case "abort":
      jobs.delete(msg.id);
      return;
    case "end": {
      const j = jobs.get(msg.id);
      jobs.delete(msg.id);
      if (!j) return;
      j.parts.push(j.decoder.decode());
      const text = j.parts.join("");
      j.parts.length = 0;
      void finish(msg.id, j.job, text);
      return;
    }
  }
};

async function finish(id: number, job: WorkerJob, text: string) {
  try {
    if (job.kind === "xmltv") {
      const map = await parseXmltvChunked(text, {
        keepChannels: job.keep ? new Set(job.keep) : undefined,
        fromMs: job.fromMs,
        toMs: job.toMs,
        sliceMs: Infinity, // acá no hay a quién cederle el hilo
      });
      let batch: [string, EpgProgram[]][] = [];
      let n = 0;
      for (const entry of map) {
        batch.push(entry);
        n += entry[1].length;
        if (n >= BATCH_PROGRAMS) {
          ctx.postMessage({ type: "epg", id, entries: batch });
          batch = [];
          n = 0;
        }
      }
      if (batch.length) ctx.postMessage({ type: "epg", id, entries: batch });
      ctx.postMessage({ type: "done", id });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      ctx.postMessage({ type: "error", id, message: "json" });
      return;
    }
    const items = mapCatalogList(job, parsed);
    for (let i = 0; i < items.length; i += BATCH_ITEMS) {
      ctx.postMessage({ type: "batch", id, items: items.slice(i, i + BATCH_ITEMS) });
    }
    ctx.postMessage({ type: "done", id });
  } catch (err) {
    ctx.postMessage({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
}
