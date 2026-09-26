import type { Channel, MediaKind } from "./types";

const ATTR_REGEX = /([a-zA-Z0-9-]+)="([^"]*)"/g;

function inferKind(url: string, group: string | undefined): MediaKind {
  const u = url.toLowerCase();
  const g = (group ?? "").toLowerCase();
  if (u.includes("/series/") || g.includes("series")) return "series-episode";
  if (
    u.includes("/movie/") ||
    g.includes("vod") ||
    g.includes("movie") ||
    g.includes("pel") ||
    g.includes("film")
  )
    return "movie";
  return "live";
}

export function parseM3u(text: string): Channel[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0 || !lines[0].startsWith("#EXTM3U")) return [];

  const out: Channel[] = [];
  let pendingName: string | null = null;
  let pendingAttrs: Record<string, string> = {};
  let index = 0;

  for (const line of lines) {
    if (line.toUpperCase().startsWith("#EXTINF")) {
      const commaAt = line.indexOf(",");
      pendingName = commaAt >= 0 ? line.slice(commaAt + 1).trim() : "Canal";
      const header = commaAt >= 0 ? line.slice(0, commaAt) : line;
      pendingAttrs = {};
      let m: RegExpExecArray | null;
      ATTR_REGEX.lastIndex = 0;
      while ((m = ATTR_REGEX.exec(header))) {
        pendingAttrs[m[1].toLowerCase()] = m[2];
      }
    } else if (line.startsWith("#")) {
      // skip other directives
    } else if (pendingName !== null) {
      const group = pendingAttrs["group-title"] || undefined;
      out.push({
        id: `m3u-${index++}-${hash(line)}`,
        name: pendingName,
        streamUrl: line,
        logoUrl: pendingAttrs["tvg-logo"] || undefined,
        groupTitle: group,
        tvgId: pendingAttrs["tvg-id"] || undefined,
        kind: inferKind(line, group),
      });
      pendingName = null;
      pendingAttrs = {};
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
