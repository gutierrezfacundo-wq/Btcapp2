import type { EpgProgram } from "./types";

// Guía XMLTV (xmltv.php del proveedor o la URL de EPG de una lista M3U).
//
// Antes se parseaba entera con fast-xml-parser en el hilo principal: con una
// guía típica (30+ MB, una semana de miles de canales) eran varios segundos
// seguidos con la TV sin responder al control, justo al arrancar. Acá:
// - se recorre el texto a mano buscando <programme>, sin armar un árbol;
// - se descartan de entrada los canales que no están en la lista del usuario
//   y los programas fuera de la ventana que la app muestra (ahora/después);
// - se trabaja por tramos cortos, devolviéndole el control al navegador entre
//   uno y otro, para que el D-pad responda mientras tanto.

export interface XmltvParseOptions {
  /** tvg-id de los canales de la lista: el resto se saltea sin procesarlo. */
  keepChannels?: Set<string>;
  /** Ventana de tiempo a conservar (ms epoch): programas que terminan antes de
   *  `fromMs` o empiezan después de `toMs` se descartan. */
  fromMs?: number;
  toMs?: number;
  /** Milisegundos de trabajo seguido antes de ceder el hilo (default 8). */
  sliceMs?: number;
}

/** Cede el hilo principal: deja pasar teclas, render y timers. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** "20261018203000 -0300" → ms epoch, sin regex ni Date.parse (es el camino caliente). */
export function parseXmltvDate(raw: string | undefined): number | null {
  if (!raw || raw.length < 14) return null;
  const n = (from: number, len: number) => {
    let v = 0;
    for (let i = from; i < from + len; i++) {
      const c = raw.charCodeAt(i) - 48;
      if (c < 0 || c > 9) return NaN;
      v = v * 10 + c;
    }
    return v;
  };
  const ms = Date.UTC(n(0, 4), n(4, 2) - 1, n(6, 2), n(8, 2), n(10, 2), n(12, 2));
  if (!Number.isFinite(ms)) return null;
  // Zona horaria opcional: "+HHMM" / "-HHMM" después de los 14 dígitos.
  let i = 14;
  while (i < raw.length && raw.charCodeAt(i) === 32) i++;
  const sign = raw[i];
  if (sign === "+" || sign === "-") {
    const tzH = n(i + 1, 2);
    const tzM = n(i + 3, 2);
    if (Number.isFinite(tzH) && Number.isFinite(tzM)) {
      const off = (tzH * 60 + tzM) * 60000;
      return sign === "+" ? ms - off : ms + off;
    }
  }
  return ms;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Fuera de rango, fromCodePoint tira RangeError: un solo programa
      // malformado no puede llevarse puesta la guía entera.
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

/**
 * Copia "propia" de un string. V8 implementa slice() como una vista sobre el
 * string original: sin esto, cada título guardado mantendría vivo el XML
 * entero (decenas de MB) mientras exista la guía.
 */
function own(s: string): string {
  return (" " + s).slice(1);
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Valor de un atributo dentro del texto de la etiqueta de apertura. */
function attr(tag: string, name: string): string | undefined {
  // El atributo puede venir separado por espacio, tab o salto de línea.
  let from = 0;
  for (;;) {
    const at = tag.indexOf(`${name}=`, from);
    if (at < 0) return undefined;
    from = at + 1;
    if (at === 0 || !isSpace(tag.charCodeAt(at - 1))) continue;
    const i = at + name.length + 1;
    const q = tag[i];
    if (q !== '"' && q !== "'") return undefined;
    const end = tag.indexOf(q, i + 1);
    return end < 0 ? undefined : tag.slice(i + 1, end);
  }
}

/**
 * Texto del primer <name …>…</name> dentro del cuerpo de UN programa.
 * Se busca solo en ese tramo a propósito: buscar en el XML entero con un
 * límite que se chequea después hacía que, si la guía no trae <desc> (muchos
 * paneles no lo mandan), cada búsqueda recorriera todo el archivo hasta el
 * final — parseo cuadrático, minutos con una guía real.
 */
function childText(body: string, name: string): string | undefined {
  let open = body.indexOf(`<${name}`);
  // Que sea exactamente esa etiqueta y no otra que empieza igual (<title-x>).
  while (open >= 0) {
    const c = body.charCodeAt(open + name.length + 1);
    if (c === 62 /* > */ || c === 47 /* / */ || isSpace(c)) break;
    open = body.indexOf(`<${name}`, open + 1);
  }
  if (open < 0) return undefined;
  const gt = body.indexOf(">", open);
  if (gt < 0) return undefined;
  if (body[gt - 1] === "/") return undefined; // <title/>
  const close = body.indexOf(`</${name}>`, gt);
  if (close < 0) return undefined;
  let text = body.slice(gt + 1, close);
  if (text.startsWith("<![CDATA[")) text = text.slice(9, text.endsWith("]]>") ? -3 : undefined);
  else text = decodeEntities(text);
  text = text.trim();
  return text ? own(text) : undefined;
}

/**
 * Parsea la guía por tramos y la devuelve agrupada por canal, cada lista
 * ordenada por horario. Nunca bloquea el hilo más de `sliceMs` seguidos.
 */
export async function parseXmltvChunked(
  xml: string,
  opts: XmltvParseOptions = {},
): Promise<Map<string, EpgProgram[]>> {
  const { keepChannels, fromMs = -Infinity, toMs = Infinity, sliceMs = 8 } = opts;
  const map = new Map<string, EpgProgram[]>();
  let pos = 0;
  let sliceStart = performance.now();

  for (;;) {
    const open = xml.indexOf("<programme", pos);
    if (open < 0) break;
    const gt = xml.indexOf(">", open);
    if (gt < 0) break;
    const tag = xml.slice(open, gt);
    const selfClosing = xml[gt - 1] === "/";
    const close = selfClosing ? gt : xml.indexOf("</programme>", gt);
    if (close < 0) break;
    pos = close + 1;

    if (!selfClosing) {
      // El id puede traer entidades (channel="A&amp;E.us"): el del catálogo no.
      const rawChannel = attr(tag, "channel");
      const channel = rawChannel ? decodeEntities(rawChannel) : undefined;
      if (channel && (!keepChannels || keepChannels.has(channel))) {
        const start = parseXmltvDate(attr(tag, "start"));
        const stop = parseXmltvDate(attr(tag, "stop"));
        if (start !== null && stop !== null && stop >= fromMs && start <= toMs) {
          const body = xml.slice(gt + 1, close);
          const title = childText(body, "title");
          if (title) {
            // Copia propia también para la clave del Map: si no, retiene el XML.
            const key = own(channel);
            const p: EpgProgram = {
              channelTvgId: key,
              title,
              description: childText(body, "desc"),
              startMs: start,
              stopMs: stop,
            };
            const list = map.get(key);
            if (list) list.push(p);
            else map.set(key, [p]);
          }
        }
      }
    }

    if (performance.now() - sliceStart > sliceMs) {
      await yieldToMain();
      sliceStart = performance.now();
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.startMs - b.startMs);
    if (performance.now() - sliceStart > sliceMs) {
      await yieldToMain();
      sliceStart = performance.now();
    }
  }
  return map;
}

export function findNowPlaying(
  byChannel: Map<string, EpgProgram[]>,
  tvgId: string | undefined,
  offsetMs = 0,
): EpgProgram | undefined {
  if (!tvgId) return undefined;
  const list = byChannel.get(tvgId);
  if (!list) return undefined;
  const now = Date.now();
  const p = list.find((x) => now >= x.startMs + offsetMs && now <= x.stopMs + offsetMs);
  // Devolvemos los horarios ya corregidos: las barras/horas se muestran bien.
  return p && offsetMs ? { ...p, startMs: p.startMs + offsetMs, stopMs: p.stopMs + offsetMs } : p;
}

export function findNextProgram(
  byChannel: Map<string, EpgProgram[]>,
  tvgId: string | undefined,
  offsetMs = 0,
): EpgProgram | undefined {
  if (!tvgId) return undefined;
  const list = byChannel.get(tvgId);
  if (!list) return undefined;
  const now = Date.now();
  let best: EpgProgram | undefined;
  for (const p of list) {
    if (p.startMs + offsetMs > now && (!best || p.startMs < best.startMs)) best = p;
  }
  return best && offsetMs ? { ...best, startMs: best.startMs + offsetMs, stopMs: best.stopMs + offsetMs } : best;
}
