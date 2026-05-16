import { XMLParser } from "fast-xml-parser";
import type { EpgProgram } from "./types";

interface XmltvProgrammeNode {
  "@_start"?: string;
  "@_stop"?: string;
  "@_channel"?: string;
  title?: string | { "#text"?: string };
  desc?: string | { "#text"?: string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "programme",
});

function getText(value: string | { "#text"?: string } | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim();
  return value["#text"]?.trim();
}

function parseXmltvDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{2})(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tzH, tzM] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tzH ? `${tzH}:${tzM}` : "Z"}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function parseXmltv(xml: string): EpgProgram[] {
  const doc = parser.parse(xml) as { tv?: { programme?: XmltvProgrammeNode[] } };
  const programmes = doc.tv?.programme ?? [];
  const out: EpgProgram[] = [];
  for (const p of programmes) {
    const channel = p["@_channel"] ?? "";
    const title = getText(p.title);
    const start = parseXmltvDate(p["@_start"]);
    const stop = parseXmltvDate(p["@_stop"]);
    if (channel && title && start !== null && stop !== null) {
      out.push({
        channelTvgId: channel,
        title,
        description: getText(p.desc),
        startMs: start,
        stopMs: stop,
      });
    }
  }
  return out;
}

export function groupByChannel(programs: EpgProgram[]): Map<string, EpgProgram[]> {
  const map = new Map<string, EpgProgram[]>();
  for (const p of programs) {
    const arr = map.get(p.channelTvgId);
    if (arr) arr.push(p);
    else map.set(p.channelTvgId, [p]);
  }
  return map;
}

export function findNowPlaying(
  byChannel: Map<string, EpgProgram[]>,
  tvgId: string | undefined,
): EpgProgram | undefined {
  if (!tvgId) return undefined;
  const list = byChannel.get(tvgId);
  if (!list) return undefined;
  const now = Date.now();
  return list.find((p) => now >= p.startMs && now <= p.stopMs);
}
