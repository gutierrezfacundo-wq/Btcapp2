import { describe, it, expect, vi } from "vitest";
import { OpenSubtitlesProvider } from "./OpenSubtitlesProvider";
import type { SubtitleCache } from "./cache";
import type { SubtitleConfig } from "./config";
import { SubtitleError } from "./types";

class MemoryCache implements SubtitleCache {
  private m = new Map<string, unknown>();
  get<T>(k: string): T | null { return (this.m.has(k) ? this.m.get(k) : null) as T | null; }
  set<T>(k: string, v: T): void { this.m.set(k, v); }
}

const CONFIG: SubtitleConfig = { apiKey: "key", relayBase: "https://relay.test", cacheTtlMs: 1000, timeoutMs: 1000 };
const silentLogger = { info: () => {}, error: () => {} };

function jsonRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
function textRes(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "text/plain; charset=utf-8" : null) },
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

const SAMPLE = {
  data: [
    { id: "1", attributes: { language: "es", release: "Movie.2026.1080p", download_count: 500, hearing_impaired: false, uploader: { name: "bob" }, files: [{ file_id: 111, file_name: "movie.srt" }] } },
    { id: "2", attributes: { language: "en", release: "Movie.2026.720p", download_count: 20, files: [{ file_id: 222 }] } },
  ],
};

function make(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, cache = new MemoryCache()) {
  return new OpenSubtitlesProvider(CONFIG, { fetchFn, cache, logger: silentLogger, now: () => 0 });
}

describe("OpenSubtitlesProvider", () => {
  it("búsqueda exitosa: mapea los resultados", async () => {
    const fetchFn = vi.fn(async () => jsonRes(SAMPLE));
    const svc = make(fetchFn);
    const out = await svc.searchSubtitles({ type: "movie", title: "Movie", year: "2026" });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ fileId: 111, languageCode: "es", downloads: 500, uploader: "bob" });
    // la URL lleva el proxy del relay y el query en minúsculas
    expect(fetchFn.mock.calls[0][0]).toContain("https://relay.test/api/os/search");
    expect(fetchFn.mock.calls[0][0]).toContain("query=movie");
    expect(fetchFn.mock.calls[0][0]).toContain("year=2026");
  });

  it("búsqueda sin resultados: devuelve []", async () => {
    const svc = make(async () => jsonRes({ data: [] }));
    expect(await svc.searchSubtitles({ type: "movie", title: "Nada" })).toEqual([]);
  });

  it("prioriza imdb_id sobre título", async () => {
    const fetchFn = vi.fn(async () => jsonRes({ data: [] }));
    await make(fetchFn).searchSubtitles({ type: "movie", title: "x", imdbId: "tt1234567" });
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("imdb_id=1234567");
    expect(url).not.toContain("query=");
  });

  it("caché: no repite el fetch para la misma búsqueda", async () => {
    const fetchFn = vi.fn(async () => jsonRes(SAMPLE));
    const svc = make(fetchFn);
    await svc.searchSubtitles({ type: "movie", title: "Movie" });
    await svc.searchSubtitles({ type: "movie", title: "Movie" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("descarga: devuelve VTT desde el SRT del relay", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nHola";
    const svc = make(async () => textRes(srt));
    const file = await svc.downloadSubtitle(111);
    expect(file.format).toBe("vtt");
    expect(file.content.startsWith("WEBVTT")).toBe(true);
    expect(file.content).toContain("00:00:01.000 --> 00:00:02.000");
  });

  it("error HTTP 401: SubtitleError code=auth", async () => {
    const svc = make(async () => jsonRes({ error: "bad" }, 401));
    await expect(svc.searchSubtitles({ type: "movie", title: "x" })).rejects.toMatchObject({ code: "auth" });
  });

  it("rate limit 429: SubtitleError code=rate_limit", async () => {
    const svc = make(async () => jsonRes({}, 429));
    await expect(svc.searchSubtitles({ type: "movie", title: "x" })).rejects.toMatchObject({ code: "rate_limit" });
  });

  it("timeout: aborta y devuelve SubtitleError code=timeout", async () => {
    const svc = make(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); });
    await expect(svc.searchSubtitles({ type: "movie", title: "x" })).rejects.toBeInstanceOf(SubtitleError);
    await expect(svc.searchSubtitles({ type: "movie", title: "y" })).rejects.toMatchObject({ code: "timeout" });
  });
});
