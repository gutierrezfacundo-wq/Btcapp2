// Versiones de una misma película o serie.
//
// Los proveedores publican el mismo título varias veces, una por idioma o
// calidad, y lo marcan en el nombre: "4K-TOP - Spider-Man: Brand New Day",
// "EN - Spider-Man: Brand New Day", "ES-DO - Spider-Man: Brand New Day",
// "Duna (2021) [LAT]", "Duna - CASTELLANO". Acá se separa el título real de
// esas marcas, para mostrar una sola tarjeta por título y elegir la versión
// adentro de la ficha.
//
// Se calcula una vez por título al armar el catálogo (en el worker), así que
// puede usar regex sin culpa; agrupar después es una pasada con un Map.

export interface VariantInfo {
  /** Clave de agrupación: el título normalizado (sin marcas, acentos ni signos). */
  key: string;
  /** Título limpio para mostrar. */
  title: string;
  /** Lo que distingue a esta versión ("Español", "Inglés · 4K"); "" si nada. */
  label: string;
  /** Idioma del AUDIO (ISO 639-1) si el nombre lo declara: para elegir la
   *  versión por defecto según el idioma preferido. Una versión subtitulada
   *  no declara audio aunque diga "Sub Español". */
  lang?: string;
  /** Año, si el nombre lo trae entre paréntesis/corchetes o separado: separa remakes. */
  year?: string;
}

/** Idiomas: marca → [nombre para la UI, código ISO del audio]. */
const LANGS: Record<string, [string, string | undefined]> = {
  en: ["Inglés", "en"], eng: ["Inglés", "en"], english: ["Inglés", "en"], ingles: ["Inglés", "en"],
  // "VO" es versión original, en el idioma que sea (Parásitos es coreana).
  vo: ["V.O.", undefined],
  es: ["Español", "es"], esp: ["Español", "es"], spa: ["Español", "es"], espanol: ["Español", "es"],
  lat: ["Latino", "es"], latino: ["Latino", "es"], latam: ["Latino", "es"], mx: ["Latino", "es"],
  cast: ["Castellano", "es"], castellano: ["Castellano", "es"], espana: ["Castellano", "es"],
  sub: ["Subtitulada", undefined], subs: ["Subtitulada", undefined], subtitulado: ["Subtitulada", undefined],
  subtitulada: ["Subtitulada", undefined], vose: ["Subtitulada", undefined], vos: ["Subtitulada", undefined],
  dual: ["Dual", undefined], multi: ["Multi", undefined], multisub: ["Multi", undefined], multisubs: ["Multi", undefined],
  pt: ["Portugués", "pt"], por: ["Portugués", "pt"], br: ["Portugués", "pt"], portugues: ["Portugués", "pt"],
  fr: ["Francés", "fr"], fre: ["Francés", "fr"], fra: ["Francés", "fr"],
  ita: ["Italiano", "it"], // "it" suelto no: es una palabra ("IT - Capítulo Dos")
  de: ["Alemán", "de"], ger: ["Alemán", "de"], deu: ["Alemán", "de"],
  gr: ["Griego", "el"], gre: ["Griego", "el"],
  tr: ["Turco", "tr"], tur: ["Turco", "tr"],
  pl: ["Polaco", "pl"], ru: ["Ruso", "ru"], nl: ["Neerlandés", "nl"],
  cat: ["Catalán", "ca"], catalan: ["Catalán", "ca"], catala: ["Catalán", "ca"],
  eus: ["Euskera", "eu"], euskera: ["Euskera", "eu"], gallego: ["Gallego", "gl"], galego: ["Gallego", "gl"],
  ar: ["Árabe", "ar"], ara: ["Árabe", "ar"], arabic: ["Árabe", "ar"],
  // Otros paneles internacionales. Sin los que son palabras (IT, IN, NO, SE, AL, FIN, DAN, RON, NOR…).
  kr: ["Coreano", "ko"], kor: ["Coreano", "ko"], jp: ["Japonés", "ja"], jpn: ["Japonés", "ja"],
  cn: ["Chino", "zh"], zho: ["Chino", "zh"], hu: ["Húngaro", "hu"], ro: ["Rumano", "ro"],
  dk: ["Danés", "da"], fi: ["Finés", "fi"], cz: ["Checo", "cs"], cze: ["Checo", "cs"],
  bg: ["Búlgaro", "bg"], hr: ["Croata", "hr"], hrv: ["Croata", "hr"], ua: ["Ucraniano", "uk"], ukr: ["Ucraniano", "uk"],
  swe: ["Sueco", "sv"], rus: ["Ruso", "ru"],
  // Paneles franceses, alemanes, polacos, turcos y brasileños.
  vf: ["Francés", "fr"], vff: ["Francés", "fr"], vfq: ["Francés", "fr"], french: ["Francés", "fr"], truefrench: ["Francés", "fr"],
  german: ["Alemán", "de"], deutsch: ["Alemán", "de"],
  vost: ["Subtitulada", undefined], vostfr: ["Subtitulada", undefined], legendado: ["Subtitulada", undefined],
  napisy: ["Subtitulada", undefined], altyazili: ["Subtitulada", undefined],
  lektor: ["Doblada", undefined], dubbing: ["Doblada", undefined], dublaj: ["Doblada", undefined], dublado: ["Doblada", undefined],
};

/** Marcas de subtítulos: el idioma que las acompaña es el del subtítulo, no el del audio. */
const SUB_TAGS = new Set(["sub", "subs", "subtitulado", "subtitulada", "vose", "vos", "vost", "vostfr", "legendado", "napisy", "altyazili"]);
/** Marcas que solo hablan del audio (mandan sobre un "Español" genérico). */
const AUDIO_TAGS = new Set(["lat", "latino", "latam", "mx", "cast", "castellano", "espana"]);

/** Calidad / formato: marca → texto para la UI. */
const QUALITY: Record<string, string> = {
  "4k": "4K", "8k": "8K", "2k": "2K", uhd: "UHD", fhd: "FHD", hd: "HD", sd: "SD",
  "2160p": "2160p", "1080p": "1080p", "720p": "720p", "1080": "1080p", "720": "720p",
  hdr: "HDR", hdr10: "HDR10", "hdr10+": "HDR10+", dv: "Dolby Vision", dolby: "Dolby", atmos: "Atmos",
  "3d": "3D", imax: "IMAX", hevc: "HEVC", h265: "HEVC", x265: "HEVC",
  cam: "CAM", hdcam: "CAM", ts: "TS",
};

/** Marcas que solo se aceptan ADELANTE (al final pueden ser parte del título). */
const PREFIX_ONLY: Record<string, string> = {
  top: "TOP", vip: "VIP", new: "Nuevo", nuevo: "Nuevo", estreno: "Estreno", estrenos: "Estreno",
  premiere: "Estreno", netflix: "Netflix", nf: "Netflix", amzn: "Amazon", amz: "Amazon",
  dsnp: "Disney+", hbo: "HBO", hmax: "HBO Max", atvp: "Apple TV+", pmtp: "Paramount+", web: "WEB", webdl: "WEB",
  webrip: "WEB", bluray: "BluRay", bdrip: "BluRay", remux: "Remux",
};

/** Palabras de relleno que acompañan a un idioma ("Audio Latino", "Doblaje Castellano"):
 *  solo valen junto a un idioma y no cuentan como marca. */
const FILLER = new Set(["audio", "doblaje", "doblada", "doblado", "idioma", "version", "original", "y", "con"]);

/** Al final del título, sin separador, en cualquier forma: nunca son parte del título. */
const UNAMBIGUOUS_TAIL = new Set([
  "subtitulado", "subtitulada", "vose", "multisub", "multisubs", "vostfr", "truefrench", "legendado",
  "4k", "8k", "uhd", "fhd", "1080p", "720p", "2160p", "hdr", "hdr10", "hdr10+", "imax", "hevc", "h265", "x265",
]);
/** Al final, en MAYÚSCULAS dentro de un título en minúsculas ("Duna LAT").
 *  Sin códigos de país que también son sufijos de franquicias ("Skam NL"). */
const TAIL_CODES = new Set([
  "es", "esp", "en", "eng", "lat", "latam", "latino", "cast", "castellano", "vo", "vos", "vose", "sub", "subs",
  "dual", "multi", "cam", "hdcam", "ts", "hd", "sd", "dolby", "atmos", "dv", "hdr",
]);
/** Al final de un título TODO en mayúsculas ("DUNA LAT"): solo marcas de 3 letras o más. */
const CAPS_TAIL = new Set([
  "lat", "latam", "cast", "castellano", "esp", "spa", "eng", "sub", "subs", "vose", "multi",
  "multisubs", "fhd", "uhd", "4k", "1080p", "720p", "2160p", "hdr", "cam", "hdcam",
]);
/** Igual, pero también son palabras ("MASTERCHEF LATINO", "PERSONALIDAD DUAL"):
 *  solo pegadas a otra marca ("DUNA 4K DUAL") o con el año entre paréntesis. */
const CAPS_TAIL_WEAK = new Set(["latino", "dual"]);

/** Banderas (pares de indicadores regionales) → marca de idioma. */
const FLAGS: Record<string, string> = {
  MX: "LAT", AR: "LAT", CO: "LAT", CL: "LAT", PE: "LAT", VE: "LAT", UY: "LAT", EC: "LAT", BO: "LAT",
  PY: "LAT", GT: "LAT", CR: "LAT", PA: "LAT", DO: "LAT", SV: "LAT", HN: "LAT", NI: "LAT", CU: "LAT",
  ES: "CAST", US: "EN", GB: "EN", UK: "EN", AU: "EN", CA: "EN", BR: "PT", PT: "PT", FR: "FR", IT: "ITA",
  DE: "DE", GR: "GR", TR: "TR", PL: "PL", RU: "RU", NL: "NL",
  KR: "KR", JP: "JP", CN: "CN", HU: "HU", RO: "RO", DK: "DK", FI: "FI", CZ: "CZ", BG: "BG", HR: "HR", UA: "UA",
};

function fold(s: string): string {
  // normalize() es caro: solo si hay caracteres fuera de ASCII.
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(s)) return s.toLowerCase();
  // NFD separa tildes y acentos (también griegos); estas letras no se
  // descomponen y hay que pasarlas a mano (turco, polaco, nórdicos…).
  // Solo los acentos latinos/griegos/cirílicos y las vocales opcionales del
  // árabe y el hebreo: el resto de las marcas son letras (dakuten japonés,
  // vocales del hindi o el tailandés) y sacarlas junta títulos distintos.
  return s.normalize("NFD").replace(/[\u0300-\u036f\u0591-\u05c7\u064b-\u065f\u0670]/g, "").toLowerCase()
    .replace(/[ıłßøæđœ]/g, (c) => ({ "ı": "i", "ł": "l", "ß": "ss", "ø": "o", "æ": "ae", "đ": "d", "œ": "oe" } as Record<string, string>)[c]);
}

type TokenKind = "lang" | "quality" | "prefix" | "filler" | "code" | null;

/** ¿Qué es esta palabra? `code`: código corto en mayúsculas sin significado conocido (ES-DO → "DO"). */
function tokenKind(raw: string): TokenKind {
  const t = fold(raw);
  // "Cat" y "ts" son palabras: como marca, solo en mayúsculas.
  if ((t === "cat" || t === "ts") && raw !== raw.toUpperCase()) return null;
  if (LANGS[t]) return "lang";
  if (QUALITY[t]) return "quality";
  if (PREFIX_ONLY[t]) return "prefix";
  if (FILLER.has(t)) return "filler";
  if (/^[A-Z]{2,3}$/.test(raw)) return "code";
  return null;
}

function tokensOf(s: string): string[] {
  return s.split(/[\s\-_/,.]+/).filter(Boolean);
}

/**
 * ¿Este tramo es solo marcas? Devuelve las marcas (sin el relleno) o null.
 * `generic`: si se aceptan códigos cortos en mayúsculas que no conocemos
 * ("DO" en "ES-DO"); `prefixOnly`: si se aceptan las marcas que solo valen
 * adelante ("TOP", "NUEVO").
 */
function allTags(segment: string, generic: boolean, prefixOnly: boolean): string[] | null {
  if (segment.length > 32) return null;
  const toks = tokensOf(segment);
  if (!toks.length) return null;
  let known = false, hasLang = false, hasCode = false, hasFiller = false;
  const out: string[] = [];
  for (const t of toks) {
    const k = tokenKind(t);
    if (k === null) return null;
    // "CAT" es catalán solo, o pegado con guion ("CAT-4K"); con otra palabra
    // al lado es parte de un título ("TOP CAT").
    if (fold(t) === "cat" && /\s/.test(segment.trim())) return null;
    if (k === "code") { if (!generic) return null; hasCode = true; out.push(t); continue; }
    if (k === "prefix" && !prefixOnly) return null;
    if (k === "filler") { hasFiller = true; continue; }
    if (k === "lang") hasLang = true;
    known = true;
    out.push(t);
  }
  // Un código que no conocemos, o una palabra de relleno, solo cuentan junto a
  // un idioma: "ES-DO" o "Audio Latino" sí; "TOP GUN" o "UP" no (son títulos).
  // Y el código, pegado con guion: "EN EL MAR" es un título, no "EN" + códigos.
  if ((hasCode || hasFiller) && !hasLang) return null;
  if (hasCode && /\s/.test(segment.trim())) return null;
  return known ? out : null;
}

const YEAR_RE = /^(19|20)\d\d$/;
const SEP_PREFIX = /^(.{1,32}?)\s*(\s[-–—•»➤★►▶/]\s|-\s|\||:)\s*(.+)$/;
const SEP_SUFFIX = /^(.+?)\s*(\s[-–—•»➤★►▶/]\s|\|)\s*([^-–—|•»➤★►▶]{1,32})$/;
// Pares bien formados; las barras solo como "|ES|" (pegadas al texto), para
// no confundirlas con el separador de "ES | Duna".
const BRACKETS = /\[([^[\](){}|]{1,32})\]|\(([^[\](){}|]{1,32})\)|\{([^[\](){}|]{1,32})\}|\|(\S[^|]{0,30}\S|\S)\|/g;
const SUPERSCRIPT: Record<string, string> = { "¹": " 1", "²": " 2", "³": " 3" };

export function variantInfo(rawName: string): VariantInfo {
  // Hay paneles que mandan el nombre como número.
  const name = typeof rawName === "string" ? rawName : String(rawName ?? "");
  const tags: string[] = [];
  let year: string | undefined;

  let s = name.trim()
    // Una sola marca, aunque venga partida.
    .replace(/\bmulti[\s\-_]?subs?\b/gi, "MULTISUBS")
    .replace(/\bdolby[\s\-_]?vision\b/gi, "DV")
    // Plataformas con "+" o en dos palabras (tokensOf corta en el "+"); solo adelante.
    .replace(/^(?:disney\+|d\+)(?=[\s:|])/i, "DSNP").replace(/^apple\s?tv\+?(?=[\s:|])/i, "ATVP")
    .replace(/^paramount\+(?=[\s:|])/i, "PMTP").replace(/^hbo\s?max(?=[\s:|])/i, "HMAX")
    .replace(/\bV\.O\.(?:S\.)?(?:E\.)?(?=[\s\])}|]|$)/gi, (m) => m.replace(/\./g, ""));

  // Banderas al principio o al final.
  s = s.replace(/^\s*((?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+)|((?:\s*[\u{1F1E6}-\u{1F1FF}]{2})+)\s*$/gu, (m) => {
    for (const f of m.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) ?? []) {
      const cc = [...f].map((c) => String.fromCharCode((c.codePointAt(0) ?? 0) - 0x1f1e6 + 65)).join("");
      if (FLAGS[cc]) tags.push(FLAGS[cc]);
    }
    return " ";
  }).trim();

  // Atajos: la mayoría de los títulos no tiene marcas; los regex se corren
  // solo si aparece el carácter que los haría falta.
  const hasBrackets = /[[({|]/.test(s);
  const hasSep = /\s[-–—•»➤★►▶/]\s|-\s|\||:/.test(s);

  // 1) Entre corchetes, paréntesis, llaves o barras: año, marcas, o las dos cosas.
  if (hasBrackets) {
    s = s.replace(BRACKETS, (m, a?: string, b?: string, c?: string, d?: string) => {
      const inner = (a ?? b ?? c ?? d ?? "").trim();
      if (YEAR_RE.test(inner)) { year = year ?? inner; return " "; }
      // Rango de años de una serie: "(2005-2013)", "(2018-)".
      const range = /^((?:19|20)\d\d)\s*[-–—]\s*(?:(?:19|20)\d\d)?$/.exec(inner);
      if (range) { year = year ?? range[1]; return " "; }
      // Un código de PAÍS solo entre paréntesis suele ser la edición de ese
      // país ("MasterChef (MX)", "The Office (US)"), no un idioma. "(VF)" o
      // "(EN)" no son países: esos sí son marcas de idioma.
      if (b !== undefined && /^[A-Z]{2}$/.test(inner) && FLAGS[inner]) return m;
      const toks = tokensOf(inner);
      const years = toks.filter((t) => YEAR_RE.test(t));
      if (years.length === 1 && toks.length > 1) {
        const tg = allTags(toks.filter((t) => !YEAR_RE.test(t)).join(" "), true, true);
        if (tg) { year = year ?? years[0]; tags.push(...tg); return " "; }
      }
      const tg = allTags(inner, true, true);
      if (tg) { tags.push(...tg); return " "; }
      return m;
    }).replace(/\s+/g, " ").trim();
  }

  // 2) Prefijos: "EN - ", "4K-TOP - ", "ES-DO - ", "LAT | ", "ES: ", "LAT- ".
  for (let guard = 0; hasSep && guard < 4; guard++) {
    const m = SEP_PREFIX.exec(s);
    if (!m) break;
    // Con ":" solo marcas conocidas ("NCIS: Los Ángeles" no es una marca),
    // salvo un par idioma-país pegado con guion ("ES-DO:", "PT-BR:").
    const pair = m[2] === ":" && /^[A-Z]{2,3}-[A-Z]{2}$/.test(m[1].trim()) && LANGS[fold(m[1].trim().split("-")[0])];
    const tg = allTags(m[1], m[2] !== ":" || !!pair, true);
    if (!tg) break;
    tags.push(...tg);
    s = m[3].trim();
  }

  // 3) Sufijos tras separador: " - LATINO", " | ES", " - 2018".
  for (let guard = 0; hasSep && guard < 4; guard++) {
    const m = SEP_SUFFIX.exec(s);
    if (!m) break;
    const tail = m[3].trim();
    if (YEAR_RE.test(tail)) { year = year ?? tail; s = m[1].trim(); continue; }
    const tg = allTags(tail, true, false);
    if (!tg) break;
    tags.push(...tg);
    s = m[1].trim();
  }

  // 4) Palabras sueltas al final ("Duna LAT", "Duna 4K", "DUNA LAT").
  let tailWords = 0;
  for (let guard = 0; guard < 4; guard++) {
    const sp = s.lastIndexOf(" ");
    if (sp <= 0) break;
    const rest = s.slice(0, sp).trimEnd();
    const word = s.slice(sp + 1);
    if (!rest || !word) break;
    const k = tokenKind(word);
    if (k !== "lang" && k !== "quality") break;
    const w = fold(word);
    // "3D" pegado al final es parte del título en muchas secuelas (Saw 3D,
    // Piraña 3D); como marca va entre corchetes o tras un separador.
    if (w === "3d") break;
    const upper = word === word.toUpperCase();
    const restHasLower = /\p{Ll}/u.test(rest);
    const ok = UNAMBIGUOUS_TAIL.has(w)
      || (upper && restHasLower && (TAIL_CODES.has(w) || k === "quality"))
      || (upper && !restHasLower && CAPS_TAIL.has(w))
      || (upper && !restHasLower && CAPS_TAIL_WEAK.has(w) && (!!year || tailWords > 0
        || /^(lang|quality)$/.test(String(tokenKind(rest.slice(rest.lastIndexOf(" ") + 1))))));
    if (!ok) break;
    tags.push(word);
    s = rest;
    tailWords++;
  }
  const title = s.replace(/^[\s\-–—:|.•»➤★►▶]+|[\s\-–—:|.•»➤★►▶]+$/g, "").replace(/\s+/g, " ") || name.trim();
  // Letras y números de cualquier alfabeto: con [a-z0-9] los títulos en
  // cirílico, griego o árabe quedaban reducidos a sus números ("Тачки 3" y
  // "История игрушек 3" daban la misma clave "3").
  const key = fold(title.replace(/[¹²³]/g, (d) => SUPERSCRIPT[d]))
    .replace(/&/g, " and ").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();

  // Etiqueta legible e idioma del audio.
  const folded = tags.map(fold);
  const hasSub = folded.some((t) => SUB_TAGS.has(t));
  const audio = folded.find((t) => AUDIO_TAGS.has(t));
  let lang: string | undefined = audio ? LANGS[audio][1] : undefined;
  if (!lang && !hasSub) {
    for (const t of folded) if (LANGS[t]?.[1]) { lang = LANGS[t][1]; break; }
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const t = folded[i];
    let text: string;
    if (LANGS[t]) text = LANGS[t][0];
    else if (QUALITY[t]) text = QUALITY[t];
    else if (PREFIX_ONLY[t]) text = PREFIX_ONLY[t];
    else text = tags[i].toUpperCase();
    if (!seen.has(text)) { seen.add(text); parts.push(text); }
  }
  // "Español Latino" / "Español España" dicen lo mismo dos veces.
  if (seen.has("Español") && (seen.has("Latino") || seen.has("Castellano"))) parts.splice(parts.indexOf("Español"), 1);
  return { key: key || fold(title), title, label: parts.join(" · "), lang, year };
}

/**
 * Completa en el objeto los campos de versión (vKey, vTitle…). Solo agrega los
 * que tienen valor: el catálogo viaja del worker en lotes y cada campo vacío
 * de 50.000 títulos cuesta.
 */
export function addVariantFields<T extends { name: string; vKey?: string; vTitle?: string; vLabel?: string; vLang?: string; vYear?: string }>(x: T): T {
  const v = variantInfo(x.name);
  if (typeof x.name !== "string") x.name = String(x.name ?? "");
  x.vKey = v.key;
  // El año sale de la clave (para agrupar) pero se muestra: si el proveedor no
  // manda el año aparte, "Dune (1984)" y "Dune (2021)" no pueden decir solo "Dune".
  const shown = v.year ? `${v.title} (${v.year})` : v.title;
  if (shown !== x.name) x.vTitle = shown;
  if (v.label) x.vLabel = v.label;
  if (v.lang) x.vLang = v.lang;
  if (v.year) x.vYear = v.year;
  return x;
}

// ===================== Agrupar =====================

export interface Variantable {
  id: string;
  name: string;
  vKey?: string;
  vLang?: string;
  vYear?: string;
  year?: string;
  /** Número de grupo (asignado con assignVariantGroups): mismo número = mismo título. */
  vg?: number;
}

export interface VariantGroup<T> {
  /** La versión que representa al grupo (la del idioma preferido o la primera). */
  rep: T;
  /** Todas las versiones, en el orden de la lista. */
  members: T[];
}

const WORD_LANG_PREFIX = /^(?:\[([A-Z]{2})\]\s*|([A-Z]{2})\s*(?:\s[-–—]\s|\|)\s*)\S/;

function yearOf(x: Variantable): string | undefined {
  return x.vYear ?? (x.year ? /(19|20)\d\d/.exec(x.year)?.[0] : undefined);
}

/**
 * Agrupa las versiones de cada título conservando el orden de la lista (cada
 * grupo queda donde aparece su primera versión). Si hay títulos iguales de
 * años distintos (remakes), se separan por año.
 * `preferLang`: idioma preferido (ISO) para elegir la versión que representa.
 */
export function groupVariants<T extends Variantable>(list: T[], preferLang?: string): VariantGroup<T>[] {
  // Una pasada: cada grupo nace en la posición de su primera versión, así que
  // salen ya en orden. Solo si hay que separar remakes por año hace falta
  // reordenar (y es raro).
  const byKey = new Map<string, T[]>();
  const order: T[][] = [];
  // "IT - Duna", "[SE] Duna": los códigos de idioma que también son palabras
  // (IT, IN, NO, SE, AL…) no se sacan en variantInfo ("IT - Capítulo Dos",
  // "UP - Una aventura de altura"). Viendo la lista entera, se unen solo si el
  // resto es la clave de otra versión que declara su idioma ("EN - Duna").
  let withLang: Set<string> | undefined;
  for (const it of list) {
    let k = it.vKey || `id:${it.id}`;
    const wp = it.vLang ? null : WORD_LANG_PREFIX.exec(it.name);
    if (wp && k.startsWith((wp[1] ?? wp[2]).toLowerCase() + " ")) {
      if (!withLang) { withLang = new Set(); for (const x of list) if (x.vLang && x.vKey) withLang.add(x.vKey); }
      const alt = k.slice(k.indexOf(" ") + 1);
      if (withLang.has(alt)) k = alt;
    }
    const arr = byKey.get(k);
    if (arr) arr.push(it);
    else {
      const fresh = [it];
      byKey.set(k, fresh);
      order.push(fresh);
    }
  }
  const out: VariantGroup<T>[] = [];
  let split = false;
  for (const members of order) {
    if (members.length === 1) { out.push({ rep: members[0], members }); continue; }
    const parts = splitByYear(members);
    if (parts.length > 1) split = true;
    for (const part of parts) out.push({ rep: pickRep(part, preferLang), members: part });
  }
  if (split) {
    const pos = new Map<T, number>();
    list.forEach((it, i) => pos.set(it, i));
    out.sort((a, b) => (pos.get(a.members[0]) ?? 0) - (pos.get(b.members[0]) ?? 0));
  }
  return out;
}

/** Remakes: mismo título, años distintos. Lo que no tiene año va con el grupo más grande. */
function splitByYear<T extends Variantable>(members: T[]): T[][] {
  if (members.length < 2) return [members];
  const byYear = new Map<string, T[]>();
  const unknown: T[] = [];
  for (const m of members) {
    const y = yearOf(m);
    if (!y) { unknown.push(m); continue; }
    const arr = byYear.get(y);
    if (arr) arr.push(m);
    else byYear.set(y, [m]);
  }
  if (byYear.size <= 1) return [members];
  // Años a 1 de distancia son el mismo estreno (fecha de cine vs. de plataforma).
  const years = [...byYear.keys()].sort();
  const merged: T[][] = [];
  let cur: T[] = byYear.get(years[0])!;
  for (let i = 1; i < years.length; i++) {
    if (Number(years[i]) - Number(years[i - 1]) <= 1) cur = cur.concat(byYear.get(years[i])!);
    else { merged.push(cur); cur = byYear.get(years[i])!; }
  }
  merged.push(cur);
  if (unknown.length) {
    let big = merged[0];
    for (const g of merged) if (g.length > big.length) big = g;
    big.push(...unknown);
  }
  // Conservar el orden original dentro de cada grupo.
  const idx = new Map<T, number>();
  members.forEach((m, i) => idx.set(m, i));
  for (const g of merged) g.sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
  return merged;
}

function pickRep<T extends Variantable>(members: T[], preferLang?: string): T {
  if (preferLang && members.length > 1) {
    const p = preferLang.toLowerCase().slice(0, 2);
    const hit = members.find((m) => m.vLang === p);
    if (hit) return hit;
  }
  return members[0];
}

// ===================== Grupos numerados =====================
// Agrupar por texto (arriba) cuesta ~45 ms por cada 40.000 títulos en una PC:
// en la TV, ~0,3 s del hilo principal cada vez que se entra a Películas o se
// cambia un filtro. Por eso se agrupa UNA vez por catálogo, en el worker, y a
// cada título se le pone el número de su grupo. En pantalla alcanza con
// recorrer la lista marcando números en un arreglo.

/** Numera los grupos de un catálogo completo (incluye la separación de remakes por año). */
export function assignVariantGroups<T extends Variantable>(items: T[]): void {
  const groups = groupVariants(items);
  for (let g = 0; g < groups.length; g++) {
    for (const m of groups[g].members) m.vg = g;
  }
}

export interface Collapsed<T> {
  /** Una versión por título, en el orden de la lista. */
  items: T[];
  /** Cuántas versiones tiene cada uno (misma posición que `items`). */
  counts: number[];
}

/**
 * Una tarjeta por título: deja la primera versión de cada grupo en su lugar,
 * cambiada por la del idioma preferido si la lista también la trae. Lineal y
 * sin mapas de texto.
 */
export function collapseVariants<T extends Variantable>(list: T[], preferLang?: string): Collapsed<T> {
  const prefer = preferLang ? preferLang.toLowerCase().slice(0, 2) : "";
  let max = -1;
  for (const it of list) if (it.vg !== undefined && it.vg > max) max = it.vg;
  const slot = new Int32Array(max + 1).fill(-1);
  const items: T[] = [];
  const counts: number[] = [];
  for (const it of list) {
    const g = it.vg;
    if (g === undefined) { items.push(it); counts.push(1); continue; }
    const at = slot[g];
    if (at < 0) {
      slot[g] = items.length;
      items.push(it);
      counts.push(1);
    } else {
      counts[at]++;
      if (prefer && it.vLang === prefer && items[at].vLang !== prefer) items[at] = it;
    }
  }
  return { items, counts };
}

/** Las versiones de un título dentro de una lista (para la ficha). */
export function variantsOf<T extends Variantable>(list: T[], item: T | undefined): T[] {
  if (!item) return [];
  if (item.vg === undefined) return [item];
  return list.filter((x) => x.vg === item.vg);
}

/**
 * La mejor versión de cada título entre las permitidas (la del idioma
 * preferido; si no, la más nueva) y la fecha de alta más reciente del grupo:
 * un título que el proveedor volvió a subir en otro idioma cuenta como nuevo.
 * Para las filas del Inicio. Lineal, con arreglos indexados por grupo.
 */
export function bestOfGroups<T extends Variantable & { addedAt?: number }>(
  list: T[],
  allow: (x: T) => boolean,
  preferLang?: string,
): { items: T[]; at: number[] } {
  const prefer = preferLang ? preferLang.toLowerCase().slice(0, 2) : "";
  let max = -1;
  for (const it of list) if (it.vg !== undefined && it.vg > max) max = it.vg;
  const best = new Int32Array(max + 1).fill(-1);
  const newest = new Float64Array(max + 1);
  const items: T[] = [];
  const at: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (!allow(x)) continue;
    const a = x.addedAt ?? 0;
    const g = x.vg;
    if (g === undefined) { items.push(x); at.push(a); continue; }
    if (a > newest[g]) newest[g] = a;
    const b = best[g];
    if (b < 0) { best[g] = i; continue; }
    const cur = list[b];
    const xPref = !!prefer && x.vLang === prefer;
    const curPref = !!prefer && cur.vLang === prefer;
    if ((xPref && !curPref) || (xPref === curPref && a > (cur.addedAt ?? 0))) best[g] = i;
  }
  for (let g = 0; g <= max; g++) {
    if (best[g] >= 0) { items.push(list[best[g]]); at.push(newest[g]); }
  }
  return { items, at };
}
