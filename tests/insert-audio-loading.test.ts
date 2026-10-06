import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  InsertAudioMixer,
  clearDecodedAudioCache,
  decodeInsertAudio,
  decodedAudioCacheStats,
  DECODED_AUDIO_CACHE_BYTES,
  type AudioFetch,
  type AudioFetchResponse,
  type InsertAudioPlan,
} from "../src/lib/insert-audio";
import { mp3Duration } from "../src/lib/mp3-prefix";

/* ------------------------------------------------------------------ *
 * Getting a sound from a URL to a playable buffer.
 *
 * Three separate faults lived in the dozen lines this replaces, and each one
 * is checked here against a fetch that records what was asked for.
 *
 *   1. The whole file was downloaded, however little of it the timeline
 *      played — a quarter of an hour of music for a ninety-second video.
 *   2. `cache: "force-cache"` accepted whatever the HTTP cache was holding.
 *      The library's Test button plays these same files through an <audio>
 *      element, which leaves 206 partials behind; a partial decodes to a
 *      fraction of a second, which is heard as silence.
 *   3. Sounds were decoded one after another, so the wait before playback
 *      was the sum of every sound rather than the longest of them.
 *
 * And the fourth, which is not a fault but a limit: decoded audio is float
 * samples, so the cache has to be bounded.
 * ------------------------------------------------------------------ */

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------- a server to fetch from */

interface Request {
  url: string;
  range: string | null;
  cache: string | null;
}

interface ServerOptions {
  /** Bytes the file is made of. */
  body: Uint8Array;
  /** When false, Range headers are ignored and the whole file comes back. */
  ranges?: boolean;
  /**
   * A stale partial sitting in the HTTP cache, as the library's own preview
   * player leaves behind. A real cache keeps serving it — as the 206 it was
   * stored as, or dressed up as a 200 — until a request bypasses the cache.
   */
  cachedPartial?: "206" | "200";
  /** Milliseconds each response takes to arrive. */
  latencyMs?: number;
  status?: number;
}

function createServer(options: ServerOptions) {
  const requests: Request[] = [];

  const respond = (status: number, body: Uint8Array, headers: Record<string, string>): AudioFetchResponse => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => body.slice().buffer as ArrayBuffer,
  });

  const fetchImpl: AudioFetch = async (url, init) => {
    const range = init?.headers?.Range ?? init?.headers?.range ?? null;
    requests.push({ url, range, cache: init?.cache ?? null });
    if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));

    if (options.status && options.status >= 400) {
      return respond(options.status, new Uint8Array(0), {});
    }

    const total = options.body.length;

    // The poisoned cache answers everything until it is bypassed.
    if (options.cachedPartial && init?.cache !== "reload") {
      const slice = options.body.subarray(0, Math.min(65536, total));
      return options.cachedPartial === "206"
        ? respond(206, slice, {
            "content-range": `bytes 0-${slice.length - 1}/${total}`,
            "content-length": String(slice.length),
          })
        : respond(200, slice, { "content-length": String(total) });
    }

    if (range && options.ranges !== false) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range);
      const from = match ? Number(match[1]) : 0;
      const to = match && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      const slice = options.body.subarray(from, to + 1);
      return respond(206, slice, {
        "content-range": `bytes ${from}-${to}/${total}`,
        "content-length": String(slice.length),
      });
    }

    return respond(200, options.body, { "content-length": String(total) });
  };

  return { fetchImpl, requests };
}

/* ------------------------------------------------- an audio context to decode in */

interface FakeBuffer {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  bytesDecoded: number;
}

class FakeGain {
  gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
  connect() {}
  disconnect() {}
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  constructor(private sink: FakeSource[]) {
    sink.push(this);
  }
  connect() {}
  disconnect() {}
  start(when?: number) {
    this.startedAt = when ?? 0;
  }
  stop() {}
}

/** Decodes by reading the real frame headers, so a bad cut cannot pass. */
class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  decoded: FakeBuffer[] = [];
  sources: FakeSource[] = [];
  /** Set to make decoding fail, the way a corrupt or empty body does. */
  rejectAll = false;

  createGain() {
    return new FakeGain() as unknown as GainNode;
  }
  createBufferSource() {
    return new FakeSource(this.sources) as unknown as AudioBufferSourceNode;
  }
  async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    if (this.rejectAll) throw new Error("decode failed");
    const bytes = new Uint8Array(data);
    const duration = mp3Duration(bytes);
    if (!(duration > 0)) throw new Error("not decodable audio");
    const buffer: FakeBuffer = {
      duration,
      length: Math.round(duration * this.sampleRate),
      numberOfChannels: 2,
      sampleRate: this.sampleRate,
      bytesDecoded: bytes.length,
    };
    this.decoded.push(buffer);
    return buffer as unknown as AudioBuffer;
  }
}

const plan = (over: Partial<InsertAudioPlan> & { key: string; url: string }): InsertAudioPlan => ({
  name: over.key,
  startTime: 0,
  endTime: 90,
  volume: 1,
  loop: true,
  ...over,
});

/* ---------------------------------------------------- the real music bed */

const bedPath = join(repoRoot, "public/sounds/yt_dark_glow_mountains.mp3");
const haveBed = existsSync(bedPath);
const bed = haveBed ? new Uint8Array(readFileSync(bedPath)) : new Uint8Array(0);
h.ok(haveBed, "the 11 MB music bed is in the repository to test against");
h.ok(bed.length > 11_000_000, "and is the long one");

/* ------------------------------- 1. only the stretch the timeline plays */

{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();

  const buffer = await decodeInsertAudio("/sounds/bed.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });

  h.ok(buffer !== null, "the bed decodes");
  h.ok(server.requests.length >= 1, "it was fetched");
  h.ok(
    server.requests.every((req) => req.range !== null),
    "every request carried a Range header — the file is never asked for whole"
  );
  h.eq(server.requests[0].range, "bytes=0-65535", "the first request is a small head");

  const fetched = server.requests.reduce((sum, req) => {
    const match = /bytes=(\d+)-(\d+)/.exec(req.range || "");
    return sum + (match ? Number(match[2]) - Number(match[1]) + 1 : 0);
  }, 0);
  h.ok(fetched < 2_000_000, `under 2 MB was fetched, not 11 (${(fetched / 1e6).toFixed(2)} MB)`);
  h.ok(fetched / bed.length < 0.2, "which is under a fifth of the file");

  const decoded = ctx.decoded[0];
  h.ok(decoded.duration >= 90, "the buffer still covers the whole ninety-second window");
  h.ok(decoded.duration < 95, "and not a minute more");
  h.ok(decoded.bytesDecoded < 1_400_000, "only the cut prefix reached the decoder");

  h.ok(
    server.requests.every((req) => req.cache !== "force-cache"),
    "force-cache is gone"
  );
}

/* ---- a window longer than the track takes the whole track, once ---- */
{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();

  await decodeInsertAudio("/sounds/bed.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 3600,
    fetchImpl: server.fetchImpl,
  });

  h.ok(ctx.decoded.length === 1, "a video longer than the bed decodes it once");
  h.near(ctx.decoded[0].duration, mp3Duration(bed), 0.1, "and gets all of it, so the loop point is real");
}

/* ------------------------------- 2. partial answers are refetched */

{
  clearDecodedAudioCache();
  // The exact fault force-cache used to walk into: a 65 kB partial, left in
  // the cache by the Test button's <audio> element, handed back as if it
  // were the file. It decodes to four seconds, which is heard as a bed that
  // stops before the first sentence does.
  const server = createServer({ body: bed, ranges: false, cachedPartial: "200" });
  const ctx = new FakeContext();

  const buffer = await decodeInsertAudio("/sounds/bed.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });

  h.ok(buffer !== null, "the bed still loads from a server that ignores Range");
  h.ok(
    server.requests.some((req) => req.cache === "reload"),
    "the partial answer was refetched past the cache"
  );
  h.near(ctx.decoded[0].duration, mp3Duration(bed), 0.1, "and what decoded is the whole file, not the partial");
  h.ok(
    ctx.decoded.every((item) => item.duration > 60),
    "no truncated 65 kB body was ever handed to the decoder"
  );
}

{
  clearDecodedAudioCache();
  // The same stale entry stored as the 206 it arrived as, answering a
  // request that carried no Range at all.
  const server = createServer({ body: bed, cachedPartial: "206" });
  const ctx = new FakeContext();

  await decodeInsertAudio("blob:stale-cache", ctx as unknown as BaseAudioContext, {
    seconds: 45,
    fetchImpl: server.fetchImpl,
  });

  h.eq(server.requests[0].range, null, "a blob URL asks for the whole thing");
  h.ok(
    server.requests.some((req) => req.cache === "reload"),
    "a 206 to a request that asked for no range is treated as the partial it is"
  );
  h.near(ctx.decoded[0].duration, mp3Duration(bed), 0.1, "and the file that decodes is the complete one");
}

{
  clearDecodedAudioCache();
  // A response whose body is shorter than its own Content-Length is the same
  // fault wearing a 200.
  const requests: Request[] = [];
  let served = 0;
  const fetchImpl: AudioFetch = async (url, init) => {
    requests.push({ url, range: init?.headers?.Range ?? null, cache: init?.cache ?? null });
    served++;
    const body = served === 1 ? bed.subarray(0, 40_000) : bed;
    return {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "content-length" ? String(bed.length) : null) },
      arrayBuffer: async () => body.slice().buffer as ArrayBuffer,
    };
  };

  const ctx = new FakeContext();
  await decodeInsertAudio("blob:preview-bed", ctx as unknown as BaseAudioContext, {
    seconds: 30,
    fetchImpl,
  });
  h.eq(requests.length, 2, "a short body against its own Content-Length is fetched again");
  h.eq(requests[1].cache, "reload", "and the second time the cache is bypassed");
  h.near(ctx.decoded[0].duration, mp3Duration(bed), 0.1, "the complete file is what decodes");
}

{
  clearDecodedAudioCache();
  // A host that refuses the Range header outright — a CORS preflight that
  // does not allow it, say. The sound still has to play.
  const whole = createServer({ body: bed });
  const ctx = new FakeContext();
  let refused = 0;
  const refusesRanges: AudioFetch = (url, init) => {
    if (init?.headers?.Range) {
      refused++;
      return Promise.reject(new Error("Range not allowed by Access-Control-Allow-Headers"));
    }
    return whole.fetchImpl(url, init);
  };

  const buffer = await decodeInsertAudio("/sounds/bed.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 60,
    fetchImpl: refusesRanges,
  });
  h.eq(refused, 1, "the range request was tried once");
  h.ok(buffer !== null, "and a refusal falls back to the plain fetch that always worked");
  h.near(ctx.decoded[0].duration, mp3Duration(bed), 0.1, "with the whole file decoded");
}

/* ---- an uploaded blob: URL is not ranged, it is simply read ---- */
{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();
  await decodeInsertAudio("blob:local-upload", ctx as unknown as BaseAudioContext, {
    seconds: 60,
    fetchImpl: server.fetchImpl,
  });
  h.ok(
    server.requests.every((req) => req.range === null),
    "a blob URL is read whole — there is no server to range against"
  );
}

/* ------------------------------- 3. decoding runs concurrently */

{
  clearDecodedAudioCache();
  const server = createServer({ body: bed, latencyMs: 60 });
  const ctx = new FakeContext();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);

  const started = Date.now();
  const result = await mixer.load(
    [
      plan({ key: "bed", url: "/sounds/a.mp3" }),
      plan({ key: "sting", url: "/sounds/b.mp3", startTime: 10, endTime: 14, loop: false }),
      plan({ key: "chime", url: "/sounds/c.mp3", startTime: 30, endTime: 33, loop: false }),
    ],
    { fetchImpl: server.fetchImpl }
  );
  const elapsed = Date.now() - started;

  h.eq(result.loaded, 3, "all three sounds loaded");
  h.eq(result.failed.length, 0, "and none failed");
  h.ok(
    elapsed < 60 * 3,
    `three sounds took less than three times one sound (${elapsed}ms against 180ms serial)`
  );
}

/* ---- the same URL twice is one download ---- */
{
  clearDecodedAudioCache();
  const server = createServer({ body: bed, latencyMs: 10 });
  const ctx = new FakeContext();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);

  await mixer.load(
    [
      plan({ key: "bed-a", url: "/sounds/same.mp3" }),
      plan({ key: "bed-b", url: "/sounds/same.mp3" }),
    ],
    { fetchImpl: server.fetchImpl }
  );
  h.eq(ctx.decoded.length, 1, "two slots on one file decode it once between them");
}

/* ------------------------------- 4. failures are named, not dropped */

{
  clearDecodedAudioCache();
  const missing = createServer({ body: new Uint8Array(0), status: 404 });
  const ctx = new FakeContext();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);

  const result = await mixer.load(
    [plan({ key: "bgm-1", url: "/sounds/gone.mp3", name: "Dark Glow Mountains" })],
    { fetchImpl: missing.fetchImpl }
  );

  h.eq(result.loaded, 0, "a missing file loads nothing");
  h.eq(result.failed.length, 1, "and is reported rather than skipped in silence");
  h.eq(result.failed[0].name, "Dark Glow Mountains", "the sound is named, so the screen can say which");
  h.eq(result.failed[0].key, "bgm-1", "and tied back to its insert");
}

{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);
  const broken = createServer({ body: new Uint8Array(0), status: 500 });

  // One good, one bad: the good one must still play.
  const mixed: AudioFetch = (url, init) =>
    url.includes("broken") ? broken.fetchImpl(url, init) : server.fetchImpl(url, init);

  const result = await mixer.load(
    [
      plan({ key: "good", url: "/sounds/good.mp3", name: "Calm Piano" }),
      plan({ key: "bad", url: "/sounds/broken.mp3", name: "Evening Rain" }),
    ],
    { fetchImpl: mixed }
  );

  h.eq(result.loaded, 1, "one unreachable sound does not silence the rest of the mix");
  h.eq(result.failed.map((item) => item.name).join(), "Evening Rain", "only the broken one is named");
}

/* ------------------------------- 5. the decoded cache is bounded */

{
  clearDecodedAudioCache();
  const stats = decodedAudioCacheStats();
  h.eq(stats.entries, 0, "the cache starts empty");
  h.eq(stats.bytes, 0, "with nothing accounted to it");
  h.eq(DECODED_AUDIO_CACHE_BYTES, 192 * 1024 * 1024, "the ceiling is 192 MB");
}

{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();

  await decodeInsertAudio("/sounds/one.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });
  const afterFirst = decodedAudioCacheStats();
  h.eq(afterFirst.entries, 1, "a decoded sound is cached");
  h.ok(afterFirst.bytes > 0, "and its memory is accounted for");
  // 92 seconds, stereo, 48 kHz, 4 bytes a sample.
  h.near(afterFirst.bytes / 1e6, 92 * 48000 * 2 * 4 / 1e6, 1.5, "the accounting is the real buffer size");

  const before = ctx.decoded.length;
  await decodeInsertAudio("/sounds/one.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });
  h.eq(ctx.decoded.length, before, "asking again is served from the cache");

  // A longer window cannot be served by a shorter prefix: that is how a bed
  // would go quiet two minutes into a five-minute video.
  await decodeInsertAudio("/sounds/one.mp3", ctx as unknown as BaseAudioContext, {
    seconds: 300,
    fetchImpl: server.fetchImpl,
  });
  h.eq(ctx.decoded.length, before + 1, "a longer window re-reads the file rather than reusing the prefix");
  h.ok(ctx.decoded[before].duration >= 300, "and the new buffer covers the longer window");
}

{
  // Eviction, driven through the public door: decode until the ceiling is
  // crossed and check the oldest entries were the ones let go.
  clearDecodedAudioCache();
  const ctx = new FakeContext();
  const server = createServer({ body: bed });

  // Each entry is ~35 MB of float samples at 92 seconds, so six fit under
  // 192 MB and the seventh has to push one out.
  const urls = Array.from({ length: 8 }, (_, i) => `/sounds/bed-${i}.mp3`);
  for (const url of urls) {
    await decodeInsertAudio(url, ctx as unknown as BaseAudioContext, {
      seconds: 90,
      fetchImpl: server.fetchImpl,
    });
  }

  const stats = decodedAudioCacheStats();
  h.ok(stats.bytes <= DECODED_AUDIO_CACHE_BYTES, `the cache stays under its ceiling (${(stats.bytes / 1e6).toFixed(0)} MB)`);
  h.ok(stats.entries < urls.length, "so something was evicted");
  h.ok(stats.entries >= 4, "but not everything — the cache is still a cache");

  // The one just decoded is still there; the first one is not.
  const decodesBefore = ctx.decoded.length;
  await decodeInsertAudio(urls[urls.length - 1], ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });
  h.eq(ctx.decoded.length, decodesBefore, "the most recently used entry survived");

  await decodeInsertAudio(urls[0], ctx as unknown as BaseAudioContext, {
    seconds: 90,
    fetchImpl: server.fetchImpl,
  });
  h.eq(ctx.decoded.length, decodesBefore + 1, "and the least recently used was the one evicted");
}

{
  // Reading an entry makes it recent: the LRU order has to be touched on
  // reads, not only on writes, or the cache evicts the bed it is playing.
  clearDecodedAudioCache();
  const ctx = new FakeContext();
  const server = createServer({ body: bed });
  const urls = Array.from({ length: 5 }, (_, i) => `/sounds/lru-${i}.mp3`);
  for (const url of urls) {
    await decodeInsertAudio(url, ctx as unknown as BaseAudioContext, { seconds: 90, fetchImpl: server.fetchImpl });
  }
  // Touch the oldest, then push the cache over its ceiling.
  await decodeInsertAudio(urls[0], ctx as unknown as BaseAudioContext, { seconds: 90, fetchImpl: server.fetchImpl });
  for (let i = 5; i < 9; i++) {
    await decodeInsertAudio(`/sounds/lru-${i}.mp3`, ctx as unknown as BaseAudioContext, {
      seconds: 90,
      fetchImpl: server.fetchImpl,
    });
  }
  const decodesBefore = ctx.decoded.length;
  await decodeInsertAudio(urls[1], ctx as unknown as BaseAudioContext, { seconds: 90, fetchImpl: server.fetchImpl });
  h.eq(ctx.decoded.length, decodesBefore + 1, "an untouched entry is evicted before a touched one");
}

/* ------------------------------- 6. what the mixer does with the result */

{
  clearDecodedAudioCache();
  const server = createServer({ body: bed });
  const ctx = new FakeContext();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);

  const result = await mixer.load([plan({ key: "bed", url: "/sounds/bed.mp3" })], {
    fetchImpl: server.fetchImpl,
  });
  h.eq(result.loaded, 1, "the bed is in the mixer");

  ctx.currentTime = 4;
  mixer.startFrom(0);
  h.eq(ctx.sources.length, 1, "playing from the first frame starts the bed");
  h.near(ctx.sources[0].startedAt ?? -1, 4, 1e-9, "at the audio clock's current time");
}

/* ------------------------------- 7. against a real server and real fetch */

{
  /**
   * Everything above runs against a fetch written for the purpose. This runs
   * against node's own HTTP server and the platform's own fetch, so the
   * Range header, the 206, the Content-Range and the byte accounting are the
   * real ones. It is the claim the whole change rests on, measured: an 11 MB
   * bed costs about a megabyte and a half to put under a ninety-second
   * video.
   */
  clearDecodedAudioCache();
  let servedBytes = 0;
  let rangeRequests = 0;

  const server = createHttpServer((req, res) => {
    const range = req.headers.range;
    const match = range ? /bytes=(\d+)-(\d+)?/.exec(range) : null;
    if (match) {
      rangeRequests++;
      const from = Number(match[1]);
      const to = match[2] ? Math.min(Number(match[2]), bed.length - 1) : bed.length - 1;
      const slice = bed.subarray(from, to + 1);
      servedBytes += slice.length;
      res.writeHead(206, {
        "content-type": "audio/mpeg",
        "content-range": `bytes ${from}-${to}/${bed.length}`,
        "content-length": String(slice.length),
        "accept-ranges": "bytes",
      });
      res.end(Buffer.from(slice));
      return;
    }
    servedBytes += bed.length;
    res.writeHead(200, { "content-type": "audio/mpeg", "content-length": String(bed.length) });
    res.end(Buffer.from(bed));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const ctx = new FakeContext();

  const buffer = await decodeInsertAudio(`http://127.0.0.1:${port}/sounds/bed.mp3`, ctx as unknown as BaseAudioContext, {
    seconds: 90,
  });

  server.close();

  h.ok(buffer !== null, "the bed loads over a real HTTP connection");
  h.ok(rangeRequests >= 1, "with real Range requests");
  h.ok(
    servedBytes < 2_000_000,
    `and ${(servedBytes / 1e6).toFixed(2)} MB over the wire instead of ${(bed.length / 1e6).toFixed(2)} MB`
  );
  h.ok((buffer?.duration ?? 0) >= 90, "the buffer still covers the ninety seconds the timeline plays");
  h.ok((buffer?.duration ?? 0) < 95, "and stops shortly after them");
}

h.done("insert-audio loading");
