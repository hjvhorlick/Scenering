/**
 * Insert Audio Engine — plays the audio attached to timeline inserts
 * (Background Music, Sound Effects, CTA jingles, Intro/Outro attached sounds)
 * in both the live preview (VideoPreview) and the final render (RenderView).
 *
 * Before this module existed, insert audio was only used for credit
 * attribution — it was never actually heard in preview or render.
 */
import type { TimelineInsert } from "../types";
import { sectionSoundUrl, type SectionConfig } from "../data/intro-outro";
import { resolveAudioUrl } from "./custom-music";
import {
  cutMp3Prefix,
  looksLikeMpeg,
  planMp3Prefix,
  MP3_HEAD_BYTES,
  MP3_PREFIX_TAIL_SECONDS,
} from "./mp3-prefix";

export interface InsertAudioPlan {
  key: string;
  url: string;
  /** What to call this sound when something goes wrong with it. */
  name: string;
  startTime: number; // absolute seconds on the video timeline
  endTime: number; // absolute seconds
  volume: number; // 0..1
  loop: boolean;
}

/**
 * Computes when every insert's sound should play on the absolute video
 * timeline (intro + script scenes + outro).
 */
export function buildInsertAudioPlan(
  inserts: TimelineInsert[] | undefined,
  totalDuration: number
): InsertAudioPlan[] {
  if (!inserts || inserts.length === 0 || totalDuration <= 0) return [];

  const plans: InsertAudioPlan[] = [];

  // A music selection replaces the previous selection. Keep this defensive
  // guard in the audio engine as well as the UI so legacy saved projects can
  // never render two background beds over one another.
  let lastMusicIndex = -1;
  for (let i = 0; i < inserts.length; i++) {
    if (inserts[i].category === "background_music") lastMusicIndex = i;
  }

  for (let insertIndex = 0; insertIndex < inserts.length; insertIndex++) {
    const ins = inserts[insertIndex];
    if (ins.category === "background_music" && insertIndex !== lastMusicIndex) continue;
    const as = ins.audioSettings;
    if (!as || !as.soundUrl) continue;
    if (as.muted) continue;

    const volume = Math.max(0, Math.min(1, as.volume ?? 0.8));
    const isMusic = ins.category === "background_music";

    // Loop: explicit setting wins; legacy `loopAudio` (old catalog data) counts;
    // background music loops by default so short tracks fill the whole video.
    const loop =
      as.loop !== undefined
        ? Boolean(as.loop)
        : Boolean((as as { loopAudio?: boolean }).loopAudio) || isMusic;

    const delay = Math.max(0, as.delay ?? 0);
    let startTime: number;
    let endTime: number;

    if (ins.category === "intro") {
      // Intro is always the first segment of the timeline
      startTime = 0;
      endTime = Math.min(totalDuration, Math.max(0, ins.duration));
    } else if (ins.category === "outro") {
      // Outro is always the last segment
      startTime = Math.max(0, totalDuration - Math.max(0, ins.duration));
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "entire_video") {
      startTime = 0;
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "from_here") {
      startTime = Math.max(0, ins.startTime);
      endTime = totalDuration;
    } else if (isMusic && ins.scope === "this_scene") {
      startTime = Math.max(0, ins.startTime);
      endTime = Math.min(totalDuration, ins.startTime + Math.max(0.5, ins.duration));
    } else if (isMusic) {
      /**
       * A bed with no scope is a bed under the whole video.
       *
       * This case covers two real projects. The first is anything saved
       * before scopes existed: those inserts carry a start time and nothing
       * else. The second was music added from the Video Studio grid, which
       * built its insert at the playhead like a sound effect — so the bed
       * began wherever the playhead happened to be, a minute late, and when
       * the playhead sat near the end the window collapsed and the music was
       * never heard at all. Music added anywhere now spans the video
       * (see createCatalogInsert), and reading a scope-less bed from the
       * first frame is what makes the projects already saved play correctly.
       */
      startTime = 0;
      endTime = totalDuration;
    } else {
      startTime = Math.max(0, ins.startTime);
      endTime = Math.min(totalDuration, ins.startTime + Math.max(0.5, ins.duration));
    }

    // Delay shifts the whole sound window
    startTime += delay;
    endTime += delay;
    if (startTime >= totalDuration || endTime <= startTime) continue;

    plans.push({
      key: ins.id,
      url: as.soundUrl,
      name: as.soundName || ins.title || "Sound",
      startTime,
      endTime,
      volume,
      loop,
    });
  }

  return plans;
}

/**
 * Sound plan for the Intro / Outro sections built in the Intro & Outro studio.
 * These are not timeline inserts — they live on the project settings — but they
 * ride the exact same mixer so they are heard in preview and baked into the
 * exported file.
 */
export function buildSectionAudioPlan(
  intro: SectionConfig | null | undefined,
  outro: SectionConfig | null | undefined,
  introDuration: number,
  totalDuration: number
): InsertAudioPlan[] {
  const plans: InsertAudioPlan[] = [];
  if (totalDuration <= 0) return plans;

  if (intro?.enabled) {
    const url = sectionSoundUrl(intro);
    if (url) {
      plans.push({
        key: "section_intro",
        url,
        name: "Intro sound",
        startTime: 0,
        endTime: Math.min(totalDuration, Math.max(0.5, introDuration)),
        volume: Math.max(0, Math.min(1, intro.volume)),
        loop: false,
      });
    }
  }

  if (outro?.enabled) {
    const url = sectionSoundUrl(outro);
    if (url) {
      const dur = Math.max(0.5, outro.duration);
      plans.push({
        key: "section_outro",
        url,
        name: "Outro sound",
        startTime: Math.max(0, totalDuration - dur),
        endTime: totalDuration,
        volume: Math.max(0, Math.min(1, outro.volume)),
        loop: false,
      });
    }
  }

  return plans;
}

/* ------------------------------------------------------------------ *
 * Fetching and decoding
 *
 * Three things used to go wrong between a sound file and a playable buffer,
 * and all three are handled here.
 *
 * 1. **The whole file was always downloaded.** A thirteen-minute bed is
 *    fifteen megabytes, and a ninety-second video needs a minute and a half
 *    of it. The loader now asks for a prefix with a Range request and cuts
 *    it on a frame boundary (see lib/mp3-prefix.ts).
 *
 * 2. **`cache: "force-cache"` served partial responses.** The library's own
 *    Test button plays these files through an `<audio>` element, which
 *    streams them with ranged requests and leaves 206 responses in the HTTP
 *    cache. force-cache then happily returned one of those as if it were the
 *    file — a few hundred kilobytes that decode to a fraction of a second,
 *    or to silence. A partial answer to a whole-file request is now detected
 *    and refetched instead of being trusted.
 *
 * 3. **Sounds were decoded one after another.** Each await blocked the next,
 *    so four sounds took as long as all four together. They are decoded
 *    concurrently now.
 * ------------------------------------------------------------------ */

/**
 * Ceiling for decoded audio kept in memory.
 *
 * Decoded audio is float samples, not compressed bytes: one minute of stereo
 * at 48 kHz is 23 MB, so a single long bed decoded in full can be three
 * hundred. Caching is still worth it — scrubbing the preview re-decodes
 * everything otherwise — but it needs a limit, and the limit needs an
 * eviction order. Least recently used goes first.
 */
export const DECODED_AUDIO_CACHE_BYTES = 192 * 1024 * 1024;

interface DecodedEntry {
  buffer: AudioBuffer;
  /** Memory this entry occupies, in bytes. */
  bytes: number;
  /** Seconds of audio it holds — a prefix only answers for its own window. */
  seconds: number;
  /** True when the whole file was decoded, so no window can ever want more. */
  whole: boolean;
}

/** Insertion order is the LRU order: re-reading an entry moves it to the end. */
const decodedCache = new Map<string, DecodedEntry>();
let decodedCacheBytes = 0;

function bufferBytes(buffer: AudioBuffer): number {
  const samples = (buffer.length || 0) * (buffer.numberOfChannels || 1);
  const bytes = samples * 4; // Float32 per sample per channel
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function readCache(key: string, seconds: number): AudioBuffer | null {
  const entry = decodedCache.get(key);
  if (!entry) return null;
  // A prefix that is shorter than this timeline needs is not a hit: the
  // music would stop early, or a bed would loop where it should not.
  if (!entry.whole && entry.seconds + 0.25 < seconds) return null;
  decodedCache.delete(key);
  decodedCache.set(key, entry); // most recently used
  return entry.buffer;
}

function writeCache(key: string, entry: DecodedEntry) {
  const existing = decodedCache.get(key);
  if (existing) decodedCacheBytes -= existing.bytes;
  decodedCache.delete(key);
  decodedCache.set(key, entry);
  decodedCacheBytes += entry.bytes;

  for (const [oldest, held] of decodedCache) {
    if (decodedCacheBytes <= DECODED_AUDIO_CACHE_BYTES) break;
    if (oldest === key) continue; // never evict what we just decoded
    decodedCache.delete(oldest);
    decodedCacheBytes -= held.bytes;
  }
}

/** Bytes of decoded audio held, and how many sounds that is. For tests and telemetry. */
export function decodedAudioCacheStats(): { bytes: number; entries: number } {
  return { bytes: decodedCacheBytes, entries: decodedCache.size };
}

export function clearDecodedAudioCache() {
  decodedCache.clear();
  decodedCacheBytes = 0;
  inFlight.clear();
}

/* ---- the small slice of fetch() this module uses ---- */

export interface AudioFetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type AudioFetch = (
  url: string,
  init?: { headers?: Record<string, string>; cache?: "reload" | "no-store" }
) => Promise<AudioFetchResponse>;

export interface DecodeAudioOptions {
  /** Seconds of this sound the timeline actually plays; the rest is not fetched. */
  seconds?: number;
  /** Injected in tests; the browser's fetch otherwise. */
  fetchImpl?: AudioFetch;
}

function defaultFetch(): AudioFetch | null {
  return typeof fetch === "function" ? (fetch as unknown as AudioFetch) : null;
}

/** Total file size out of a `Content-Range: bytes 0-65535/11778042` header. */
function contentRangeTotal(res: AudioFetchResponse): number {
  const header = res.headers.get("content-range") || "";
  const slash = header.lastIndexOf("/");
  if (slash < 0) return 0;
  const total = Number.parseInt(header.slice(slash + 1), 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * A response that answered less than was asked for.
 *
 * 206 to a request that carried no Range header is the signature of a cached
 * partial from the preview player. So is a body shorter than the
 * Content-Length the same response declares.
 */
function isPartialAnswer(res: AudioFetchResponse, received: number): boolean {
  if (res.status === 206) return true;
  const declared = Number.parseInt(res.headers.get("content-length") || "", 10);
  return Number.isFinite(declared) && declared > 0 && received > 0 && received < declared;
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Whether it is worth asking this URL for part of itself.
 *
 * Ranges only make sense over HTTP — a blob: or data: URL is already in
 * memory. Cross-origin is excluded on purpose: a Range header turns a simple
 * request into a preflighted one, and a third-party host that does not allow
 * the header would fail the fetch outright. Every sound the app ships is
 * served from its own origin.
 */
function isRangeable(url: string): boolean {
  if (url.startsWith("/")) return true;
  if (!/^https?:/i.test(url)) return false;
  try {
    // No document means no browser and no CORS to trip over.
    if (typeof location === "undefined") return true;
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

interface FetchedAudio {
  bytes: Uint8Array;
  /** True when these are all the bytes there are. */
  whole: boolean;
}

async function fetchWholeAudio(url: string, doFetch: AudioFetch): Promise<FetchedAudio | null> {
  let res = await doFetch(url);
  if (!res.ok) return null;
  let bytes = new Uint8Array(await res.arrayBuffer());

  if (isPartialAnswer(res, bytes.length)) {
    // Go back to the network and ignore whatever the cache is holding.
    res = await doFetch(url, { cache: "reload" });
    if (!res.ok) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
    if (isPartialAnswer(res, bytes.length)) return null;
  }
  return bytes.length > 0 ? { bytes, whole: true } : null;
}

/**
 * Fetches enough of a sound to cover `seconds` of timeline, or all of it when
 * a prefix is not possible (a short file, a server that ignores Range, a
 * format that is not MPEG).
 */
async function fetchAudioBytes(
  url: string,
  seconds: number,
  doFetch: AudioFetch
): Promise<FetchedAudio | null> {
  if (!(seconds > 0) || !isRangeable(url)) return fetchWholeAudio(url, doFetch);

  // A rejected range request must never cost the sound: fall back to the
  // plain fetch that has always worked.
  let head: AudioFetchResponse;
  try {
    head = await doFetch(url, { headers: { Range: `bytes=0-${MP3_HEAD_BYTES - 1}` } });
  } catch {
    return fetchWholeAudio(url, doFetch);
  }
  if (!head.ok) return head.status === 416 ? fetchWholeAudio(url, doFetch) : null;

  const headBytes = new Uint8Array(await head.arrayBuffer());
  // A server that ignores Range answers 200 with the entire file. That is a
  // complete answer, not a partial one, and there is nothing left to ask for
  // — unless the body is shorter than the length the response itself
  // declares, which is a stale partial out of the cache wearing a 200.
  if (head.status !== 206) {
    if (isPartialAnswer(head, headBytes.length)) return fetchWholeAudio(url, doFetch);
    return headBytes.length > 0 ? { bytes: headBytes, whole: true } : null;
  }
  // Frame cutting is an MPEG trick. A WAV or OGG effect is small anyway.
  if (!looksLikeMpeg(headBytes)) return fetchWholeAudio(url, doFetch);

  const total = contentRangeTotal(head);
  const plan = planMp3Prefix(headBytes, seconds, total);

  let bytes = headBytes;
  if (plan.byteLength > bytes.length) {
    const rest = await doFetch(url, {
      headers: { Range: `bytes=${bytes.length}-${plan.byteLength - 1}` },
    });
    if (!rest.ok) return fetchWholeAudio(url, doFetch);
    const restBytes = new Uint8Array(await rest.arrayBuffer());
    if (rest.status === 206) {
      bytes = concat(bytes, restBytes);
    } else {
      return restBytes.length > 0 ? { bytes: restBytes, whole: true } : null;
    }
  }

  return { bytes, whole: total > 0 && bytes.length >= total };
}

/** url -> the decode already running for it, so two slots never fetch twice. */
const inFlight = new Map<string, { seconds: number; promise: Promise<AudioBuffer | null> }>();

/**
 * Fetches, trims and decodes one sound, returning null rather than throwing
 * so one unreachable file cannot silence the rest of the mix.
 */
export async function decodeInsertAudio(
  url: string,
  ctx: BaseAudioContext,
  options: DecodeAudioOptions = {}
): Promise<AudioBuffer | null> {
  // A looping bed only ever needs as much of itself as the timeline plays:
  // past that, it repeats what it already has.
  const seconds = Number.isFinite(options.seconds) ? Math.max(0, options.seconds as number) : 0;
  const cached = readCache(url, seconds);
  if (cached) return cached;

  const running = inFlight.get(url);
  if (running && (running.seconds === 0 || running.seconds >= seconds)) return running.promise;

  const work = (async (): Promise<AudioBuffer | null> => {
    try {
      // Uploaded music is stored as `custom-music:<id>` so a saved project keeps
      // working across reloads; resolve it to this page's object URL to fetch.
      const playableUrl = resolveAudioUrl(url);
      if (!playableUrl) return null;
      const doFetch = options.fetchImpl || defaultFetch();
      if (!doFetch) return null;

      const fetched = await fetchAudioBytes(playableUrl, seconds, doFetch);
      if (!fetched || fetched.bytes.length === 0) return null;

      let usable = fetched.bytes;
      let covered = Number.POSITIVE_INFINITY;

      if (!fetched.whole) {
        const cut = cutMp3Prefix(fetched.bytes, seconds);
        // The estimate can fall short on a file whose opening minutes are
        // denser than its average. Rather than play a bed that stops early,
        // fall back to the whole file — correctness first, speed second.
        if (cut && cut.seconds + 0.25 >= seconds + MP3_PREFIX_TAIL_SECONDS) {
          usable = cut.bytes;
          covered = cut.seconds;
        } else {
          const all = await fetchWholeAudio(playableUrl, doFetch);
          if (!all) return null;
          usable = all.bytes;
        }
      }

      const arrayBuf =
        usable.byteOffset === 0 && usable.byteLength === usable.buffer.byteLength
          ? (usable.buffer as ArrayBuffer)
          : (usable.slice().buffer as ArrayBuffer);
      const buffer = await ctx.decodeAudioData(arrayBuf);
      if (!buffer) return null;

      writeCache(url, {
        buffer,
        bytes: bufferBytes(buffer),
        seconds: Math.min(covered, buffer.duration || covered),
        whole: covered === Number.POSITIVE_INFINITY,
      });
      return buffer;
    } catch (err) {
      console.warn(`Insert audio decode failed for ${url}:`, err);
      return null;
    }
  })();

  inFlight.set(url, { seconds, promise: work });
  try {
    return await work;
  } finally {
    if (inFlight.get(url)?.promise === work) inFlight.delete(url);
  }
}

interface ActiveSlot {
  plan: InsertAudioPlan;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  started: boolean;
  finished: boolean;
}

/** A sound the mixer could not load, named so the screen can say which. */
export interface InsertAudioFailure {
  key: string;
  name: string;
  url: string;
}

export interface InsertAudioLoadResult {
  /** Sounds ready to play. */
  loaded: number;
  /** Sounds that will not be heard, and what they were called. */
  failed: InsertAudioFailure[];
}

/**
 * Schedules & tracks insert audio for one playback session.
 * Call startFrom() once when playback begins, then tick() every frame with
 * the current absolute timeline time. stop()/dispose() when playback ends.
 */
export class InsertAudioMixer {
  private ctx: BaseAudioContext;
  private master: GainNode;
  private slots: ActiveSlot[] = [];
  /** Set by scheduleAll(): the timeline is already placed, so polling must stop. */
  private prescheduled = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    // 0.85 gain headroom prevents harsh digital clipping when multiple sounds sum together
    this.master.gain.value = 0.85;
    this.master.connect(dest);
  }

  /**
   * Pre-decode every planned sound.
   *
   * Concurrently: these are independent network fetches, and awaiting them in
   * turn made the wait before playback the sum of all of them. Slots are
   * still built in plan order afterwards, so the mix is deterministic.
   *
   * Anything that could not be loaded is returned by name rather than quietly
   * dropped — a bed that is missing from the video is worth a sentence on
   * screen.
   */
  async load(
    plans: InsertAudioPlan[],
    options: { fetchImpl?: AudioFetch } = {}
  ): Promise<InsertAudioLoadResult> {
    const decoded = await Promise.all(
      plans.map(async (plan) => {
        // The timeline window is all this sound can ever be heard for.
        const seconds = Math.max(0, plan.endTime - plan.startTime);
        const buffer = await decodeInsertAudio(plan.url, this.ctx, {
          seconds,
          fetchImpl: options.fetchImpl,
        });
        return { plan, buffer };
      })
    );

    this.slots = [];
    const failed: InsertAudioFailure[] = [];
    for (const { plan, buffer } of decoded) {
      if (!buffer) {
        failed.push({ key: plan.key, name: plan.name || "Sound", url: plan.url });
        continue;
      }
      this.slots.push({
        plan,
        buffer,
        source: null,
        gain: null,
        started: false,
        finished: false,
      });
    }
    return { loaded: this.slots.length, failed };
  }

  private startSlot(slot: ActiveSlot, at: number, when?: number) {
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = slot.buffer;
      if (slot.plan.loop) source.loop = true;

      // `when` is an absolute time on the audio clock. A real-time render
      // hands one in so the bed and the narration start on the same instant.
      const startAt = typeof when === "number" && when > this.ctx.currentTime ? when : this.ctx.currentTime;

      const gain = this.ctx.createGain();
      gain.gain.value = slot.plan.volume;
      // Gentle 25ms micro-fade prevents hard DC-offset clicks/crackles at buffer start
      if (typeof gain.gain.setValueAtTime === "function" && typeof gain.gain.exponentialRampToValueAtTime === "function") {
        try {
          gain.gain.setValueAtTime(0.001, startAt);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.001, slot.plan.volume), startAt + 0.025);
        } catch {}
      }
      source.connect(gain);
      gain.connect(this.master);

      const bufDur = Math.max(0.01, slot.buffer.duration);
      const offset = ((at - slot.plan.startTime) % bufDur + bufDur) % bufDur;
      source.start(startAt, offset);

      source.onended = () => {
        if (slot.source === source) {
          slot.source = null;
          slot.gain = null;
          if (!slot.plan.loop) slot.finished = true;
        }
      };

      slot.source = source;
      slot.gain = gain;
      slot.started = true;
    } catch (err) {
      console.warn("Insert audio start failed:", err);
    }
  }

  /**
   * Offline render path: place every sound on the timeline up front.
   *
   * Live playback has to poll, because it cannot know when the user will
   * pause or scrub. An offline render knows the whole timeline before it
   * starts, so each sound is scheduled once at its exact start time and
   * stopped at its exact end time. The Web Audio clock then places it to the
   * sample, instead of the nearest frame a poll happened to land on, and the
   * render no longer has to be interrupted once per frame to check.
   *
   * Only for an OfflineAudioContext, and only before rendering begins.
   * Do not call tick() afterwards — the sounds are already placed.
   */
  scheduleAll(): number {
    this.prescheduled = true;
    let placed = 0;
    for (const slot of this.slots) {
      const { startTime, endTime, loop, volume } = slot.plan;
      if (!(endTime > startTime)) continue;
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = slot.buffer;
        if (loop) source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = volume;

        if (typeof gain.gain.setValueAtTime === "function" && typeof gain.gain.exponentialRampToValueAtTime === "function") {
          try {
            const start = Math.max(0, startTime);
            const end = Math.max(0, endTime);
            const targetVol = Math.max(0.001, volume);
            const fadeSec = Math.min(0.04, (end - start) * 0.1);
            if (fadeSec > 0.005) {
              gain.gain.setValueAtTime(0.001, start);
              gain.gain.exponentialRampToValueAtTime(targetVol, start + fadeSec);
              gain.gain.setValueAtTime(targetVol, end - fadeSec);
              gain.gain.exponentialRampToValueAtTime(0.001, end);
            }
          } catch {}
        }

        source.connect(gain);
        gain.connect(this.master);

        source.start(Math.max(0, startTime));
        // Harmless for a one-shot that has already finished; it truncates a
        // sound that would otherwise outrun its slot, which is what tick() did.
        source.stop(Math.max(0, endTime));

        slot.source = source;
        slot.gain = gain;
        slot.started = true;
        placed++;
      } catch (err) {
        console.warn("Insert audio scheduling failed:", err);
      }
    }
    return placed;
  }

  /**
   * Begin everything that is already active at `time`.
   *
   * `anchor` is an absolute time on the audio clock to start them at. A
   * real-time render schedules its narration a fraction of a second ahead to
   * get every scene lined up before the first sample plays; without the same
   * anchor the music bed started the moment this was called and ran about
   * 120 ms in front of the voice for the length of the video.
   */
  startFrom(time: number, anchor?: number) {
    for (const slot of this.slots) {
      if (
        !slot.started &&
        !slot.finished &&
        time >= slot.plan.startTime &&
        time < slot.plan.endTime
      ) {
        this.startSlot(slot, time, anchor);
      }
    }
  }

  /** Per-frame update: start sounds whose start time was crossed, stop ones past their end. */
  tick(time: number) {
    // Everything is already placed on the clock. Polling now would only do
    // harm: the stop() below takes no argument, so it would cut a sound off
    // at the context's current time instead of its planned end.
    if (this.prescheduled) return;
    for (const slot of this.slots) {
      if (slot.started) {
        // Stop at the planned end — also for looping beds (music that fills the video)
        if (time >= slot.plan.endTime && slot.source) {
          const s = slot.source;
          const g = slot.gain;
          if (g && typeof g.gain.setValueAtTime === "function" && typeof g.gain.linearRampToValueAtTime === "function") {
            try {
              const now = this.ctx.currentTime;
              g.gain.setValueAtTime(g.gain.value, now);
              g.gain.linearRampToValueAtTime(0.001, now + 0.03);
            } catch {}
          }
          setTimeout(() => {
            try {
              s.stop();
            } catch {}
          }, 35);
          slot.source = null;
          slot.finished = true;
        }
        continue;
      }
      if (slot.finished) continue;
      if (time >= slot.plan.startTime && time < slot.plan.endTime) {
        this.startSlot(slot, time);
      } else if (time >= slot.plan.endTime) {
        slot.finished = true;
      }
    }
  }

  /** Stop everything immediately and reset state. */
  stop() {
    this.prescheduled = false;
    for (const slot of this.slots) {
      if (slot.source) {
        const s = slot.source;
        // Drop onended first: it checks `slot.source === source`, and we are
        // about to reassign that field. Clearing it keeps the callback from
        // firing against a slot that has already been reset.
        try { s.onended = null; } catch {}
        try { s.stop(); } catch {}
        // A stopped source still holds its connection to the master gain
        // until it is collected; unhook it now so a paused preview leaves
        // nothing behind on the music bus.
        try { s.disconnect(); } catch {}
      }
      if (slot.gain) {
        try { slot.gain.disconnect(); } catch {}
      }
      slot.source = null;
      slot.gain = null;
      slot.started = false;
      slot.finished = false;
    }
  }

  dispose() {
    this.stop();
    this.slots = [];
    try {
      this.master.disconnect();
    } catch {}
  }
}
