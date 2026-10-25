import type { Scene } from "../types";
import { SPEECHIFY_RENDITION, synthesizeSpeechify } from "./speechify-client";
import { cachedNarrationBelongsToScene, isPreparedVoiceoverId } from "./voiceover-generation";
import type { WordTiming } from "./word-sync";

export interface CachedAudioItem {
  audioBuffer: AudioBuffer;
  blobUrl: string;
  duration: number;
  voiceId: string;
  text: string;
  rawBuffer?: ArrayBuffer;
  blob?: Blob;
  mimeType?: string;
  /** Which scene this file narrates, so a replacement can retire every copy. */
  sceneId?: number;
  /**
   * Per-word spoken timings from the TTS engine, when the narration was
   * synthesised with word boundaries. This is what lets the karaoke captions
   * highlight each word at the exact moment the voice says it — and it is why
   * the timings travel with the audio through every cache layer.
   */
  words?: WordTiming[];
}

// In-memory global cache for synthesized speech audio
const memoryAudioCache = new Map<string, CachedAudioItem>();
const sceneIdAudioCache = new Map<number, CachedAudioItem>();
const urlAudioCache = new Map<string, CachedAudioItem>();
let sharedAudioContext: AudioContext | null = null;

// IndexedDB database setup for persistent voiceover audio across reloads & sessions
const IDB_NAME = "scenering_voiceovers_store_v1";
const IDB_STORE = "scene_audio";

function openVoiceoverDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persistAudioToIDB(
  key: string,
  sceneId: number,
  rawBuffer: ArrayBuffer,
  voiceId: string,
  text: string,
  duration: number,
  words?: WordTiming[],
  mimeType?: string
): Promise<void> {
  try {
    const db = await openVoiceoverDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.objectStore(IDB_STORE).put({
        key,
        sceneId,
        rawBuffer,
        voiceId,
        text,
        duration,
        mimeType: mimeType || "audio/mpeg",
        words: words && words.length > 0 ? words : undefined,
        updatedAt: Date.now(),
      });
    });
  } catch {}
}

async function loadAudioFromIDB(
  key: string
): Promise<{ rawBuffer: ArrayBuffer; duration: number; voiceId: string; text: string; mimeType?: string; words?: WordTiming[] } | null> {
  try {
    const db = await openVoiceoverDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * The word marks stored beside a scene's narration, whatever route its audio
 * took out of the cache.
 *
 * Marks live in the durable `scene_<id>` row, which is written with every
 * narration file and deleted when that narration is replaced. Resolving the
 * audio through `scene.audio_url` (a saved URL, a restored project, another
 * device's copy) used to come back with the sound but WITHOUT its marks — so
 * the karaoke highlight silently fell back to a syllable estimate and the
 * captions drifted off the voice even though the marks existed all along.
 *
 * The text check keeps them honest: a row that was made for a different script
 * is a different line, and its timings do not describe this one.
 */
async function durableNarrationWords(sceneId: number, text: string): Promise<WordTiming[] | undefined> {
  try {
    const stored = await loadAudioFromIDB(`scene_${sceneId}`);
    if (!stored?.words?.length) return undefined;
    const storedText = typeof stored.text === "string" ? stored.text.trim() : "";
    if (storedText && storedText !== (text || "").trim()) return undefined;
    return stored.words;
  } catch {
    return undefined;
  }
}

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export function getAudioCacheKey(sceneId: number, voiceId: string, text: string): string {
  // voiceId is the style, not the Speechify voice behind it, so narration is
  // also filed under the rendition: audio made with an earlier casting or
  // earlier audio settings is never replayed after either changes.
  return `${SPEECHIFY_RENDITION}_${sceneId}_${voiceId}_${text.trim()}`;
}

export function getCachedSceneAudio(sceneId: number, voiceId?: string, text?: string): CachedAudioItem | undefined {
  if (voiceId && typeof text === "string") {
    const key = getAudioCacheKey(sceneId, voiceId, text);
    return memoryAudioCache.get(key);
  }
  return sceneIdAudioCache.get(sceneId);
}

export function getCachedSceneAudioBySceneId(sceneId: number): CachedAudioItem | undefined {
  return sceneIdAudioCache.get(sceneId);
}

export function getCachedSceneAudioByUrl(url: string): CachedAudioItem | undefined {
  return urlAudioCache.get(url);
}

export function hasCachedSceneAudio(sceneId: number, voiceId?: string, text?: string): boolean {
  return Boolean(getCachedSceneAudio(sceneId, voiceId, text));
}

/** Every memory key filed under one scene, whichever narrator made it. */
function sceneAudioKeyPrefix(sceneId: number): string {
  // `getAudioCacheKey` is `${rendition}_${sceneId}_${voiceId}_${text}`, so the
  // trailing underscore keeps scene 12 from matching scene 123's files.
  return `${SPEECHIFY_RENDITION}_${sceneId}_`;
}

/**
 * Remove every in-memory trace of one scene's narration — every narrator and
 * every script it was ever generated for — and hand back what was removed.
 *
 * A scene keeps one file per generation pass, and every pass used to leave
 * the previous one in memory, in the URL index and in IndexedDB for the life
 * of the tab. That is how a piece of an earlier voice could still be found
 * after the project had been re-narrated.
 */
function collectSceneNarration(sceneId: number): CachedAudioItem[] {
  const prefix = sceneAudioKeyPrefix(sceneId);
  const removed: CachedAudioItem[] = [];
  const seen = new Set<CachedAudioItem>();
  const remember = (item: CachedAudioItem) => {
    if (!seen.has(item)) {
      seen.add(item);
      removed.push(item);
    }
  };

  for (const [key, item] of [...memoryAudioCache]) {
    if (key.startsWith(prefix)) {
      memoryAudioCache.delete(key);
      remember(item);
    }
  }
  for (const [url, item] of [...urlAudioCache]) {
    if (item.sceneId === sceneId || seen.has(item)) {
      urlAudioCache.delete(url);
      remember(item);
    }
  }
  const single = sceneIdAudioCache.get(sceneId);
  if (single) {
    sceneIdAudioCache.delete(sceneId);
    remember(single);
  }
  return removed;
}

/** Delete a scene's persisted narration rows from IndexedDB. */
async function deleteSceneNarrationFromIDB(sceneId: number): Promise<void> {
  const db = await openVoiceoverDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = done;
      tx.onerror = done;
      tx.onabort = done;
      const store = tx.objectStore(IDB_STORE);
      // A key cursor, not a value cursor: every row is a whole MP3, and the
      // key alone says which scene it belongs to. Reading the values here
      // would copy megabytes of audio just to throw it away.
      const req = store.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key ?? "");
        if (key === `scene_${sceneId}` || key.startsWith(sceneAudioKeyPrefix(sceneId))) {
          cursor.delete();
        }
        cursor.continue();
      };
      req.onerror = done;
    } catch {
      done();
    }
  });
}

/**
 * Forget a scene's narration completely: memory, the URL index and the
 * durable copy. Used when a scene is detached from its audio.
 */
export async function clearSceneNarration(sceneId: number): Promise<void> {
  collectSceneNarration(sceneId);
  await deleteSceneNarrationFromIDB(sceneId);
}

/**
 * Put a scene's new narration in place of the old one.
 *
 * This is a replacement, not an addition: every copy of the scene's previous
 * narration is removed from memory, from the URL index and from IndexedDB
 * before the new file is stored, and the old object URL is released. Nothing
 * of the previous voice is left for a later step to find.
 */
export async function replaceSceneNarration(
  sceneId: number,
  voiceId: string,
  text: string,
  item: CachedAudioItem
): Promise<void> {
  const previous = collectSceneNarration(sceneId);
  await deleteSceneNarrationFromIDB(sceneId);
  await setCachedSceneAudio(sceneId, voiceId, text, item);
  for (const old of previous) {
    if (old === item || !old.blobUrl || old.blobUrl === item.blobUrl) continue;
    try {
      URL.revokeObjectURL(old.blobUrl);
    } catch {
      /* already released */
    }
  }
}

/**
 * The narration already held for exactly this scene, narrator and script, if
 * any.
 *
 * A replacement re-attaches what is still cached instead of paying to
 * synthesize the same line again — so a voice chosen away from and back
 * before anything was generated for the new one costs nothing, and a
 * generation interrupted after its file was written resumes rather than
 * calling the provider twice.
 */
export async function findCachedNarration(
  sceneId: number,
  voiceId: string,
  text: string,
  audioCtx: AudioContext | null
): Promise<CachedAudioItem | null> {
  const key = getAudioCacheKey(sceneId, voiceId, text);
  const inMemory = memoryAudioCache.get(key);
  if (inMemory) {
    if (!audioCtx || !inMemory.audioBuffer || inMemory.audioBuffer.sampleRate === audioCtx.sampleRate) {
      return inMemory;
    }
    if (inMemory.rawBuffer) {
      try {
        const decoded = await audioCtx.decodeAudioData(inMemory.rawBuffer.slice(0));
        return { ...inMemory, audioBuffer: decoded, duration: decoded.duration };
      } catch {}
    }
    return inMemory;
  }

  try {
    const stored = await loadAudioFromIDB(key);
    if (!stored?.rawBuffer || !audioCtx) return null;
    // A row written by an earlier session and an earlier rendition is not a
    // match for what this narrator sounds like now.
    if (stored.voiceId && stored.voiceId !== voiceId) return null;
    const decoded = await audioCtx.decodeAudioData(stored.rawBuffer.slice(0));
    const mimeType = stored.mimeType || "audio/mpeg";
    const blob = new Blob([stored.rawBuffer], { type: mimeType });
    return {
      audioBuffer: decoded,
      blobUrl: URL.createObjectURL(blob),
      duration: decoded.duration,
      voiceId: stored.voiceId || voiceId,
      text: stored.text || text,
      rawBuffer: stored.rawBuffer,
      blob,
      mimeType,
      sceneId,
      words: stored.words,
    };
  } catch {
    return null;
  }
}

export async function setCachedSceneAudio(
  sceneId: number,
  voiceId: string,
  text: string,
  item: CachedAudioItem
): Promise<void> {
  const key = getAudioCacheKey(sceneId, voiceId, text);
  // Stamped so a replacement can find every copy of this scene's audio,
  // including the ones filed only under their URL. The caller's object is the
  // one stored, so an identity check against what was filed still matches.
  if (item.sceneId !== sceneId) item.sceneId = sceneId;
  memoryAudioCache.set(key, item);
  sceneIdAudioCache.set(sceneId, item);
  if (item.blobUrl) {
    urlAudioCache.set(item.blobUrl, item);
  }
  if (item.rawBuffer) {
    // The in-memory entry is synchronous; wait for the durable writes where a
    // caller (notably Voiceover Next) needs to guarantee the file survives a
    // section change or an immediate reload.
    await Promise.all([
      persistAudioToIDB(key, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration, item.words, item.blob?.type || item.mimeType),
      persistAudioToIDB(`scene_${sceneId}`, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration, item.words, item.blob?.type || item.mimeType),
    ]);
  }
}

/**
 * Resolves an existing decoded AudioBuffer for a scene instantly without re-synthesizing!
 * Checks in-memory cache, IndexedDB persistent cache, and scene.audio_url blob.
 */
export async function resolveSceneAudioBuffer(
  scene: Scene,
  audioCtx: AudioContext
): Promise<{ buffer: AudioBuffer; duration: number; url: string; words?: WordTiming[] } | null> {
  const text = (scene.text || "").trim();
  const voiceId = scene.voice_id || "speechify_male_01";
  const key = getAudioCacheKey(scene.id, voiceId, text);

  // 1. Resolve only the CURRENT selection. The old scene-id fallback ignored
  // voice/text/URL changes and could resurrect a previous narration after the
  // user regenerated or imported a replacement.
  const currentUrlCached = scene.audio_url ? urlAudioCache.get(scene.audio_url) : undefined;
  const exactCached = memoryAudioCache.get(key);
  const candidate = currentUrlCached || (
    exactCached && (!scene.audio_url || exactCached.blobUrl === scene.audio_url)
      ? exactCached
      : undefined
  );
  // A file made for a narrator or a script this scene no longer has is not
  // this scene's narration, whatever pointer led here. Drop it from the
  // in-memory indexes so it cannot be found again, and resolve nothing —
  // the caller either regenerates the current voice or stays silent.
  const cached = candidate && cachedNarrationBelongsToScene(candidate, scene) ? candidate : undefined;
  if (candidate && !cached) {
    for (const [url, item] of [...urlAudioCache]) {
      if (item === candidate) urlAudioCache.delete(url);
    }
    for (const [memoryKey, item] of [...memoryAudioCache]) {
      if (item === candidate) memoryAudioCache.delete(memoryKey);
    }
    if (sceneIdAudioCache.get(scene.id) === candidate) sceneIdAudioCache.delete(scene.id);
  }
  if (cached) {
    /* A cache entry can hold the sound without the marks (it was made before
       they were kept, or it was restored from a copy that only carried the
       audio). The durable row is the authority, so the captions still follow
       the voice instead of silently reverting to the estimate. */
    if (!cached.words?.length) {
      const words = await durableNarrationWords(scene.id, text);
      if (words) cached.words = words;
    }
    // If the buffer was decoded with matching sampleRate or AudioContext
    if (cached.audioBuffer && (!audioCtx || cached.audioBuffer.sampleRate === audioCtx.sampleRate)) {
      return {
        buffer: cached.audioBuffer,
        duration: cached.duration || cached.audioBuffer.duration,
        url: cached.blobUrl,
        words: cached.words,
      };
    }
    // If sample rates differ, decode the rawBuffer locally with zero network latency
    if (cached.rawBuffer && audioCtx) {
      try {
        const decoded = await audioCtx.decodeAudioData(cached.rawBuffer.slice(0));
        return {
          buffer: decoded,
          duration: decoded.duration,
          url: cached.blobUrl,
          words: cached.words,
        };
      } catch {}
    }
  }

  // 2. Check the exact voice+text IndexedDB key when there is no explicit
  // audio URL, or when the saved URL is an object URL from a previous page
  // session. Generated blob URLs cannot survive a reload; user-imported
  // prepared tracks are excluded because they are not Speechify cache entries.
  try {
    const preparedTrack = /^(custom|import):/.test(scene.voice_id || "");
    const staleGeneratedBlob = Boolean(scene.audio_url?.startsWith("blob:") && !preparedTrack);
    const fromIdb = !scene.audio_url || staleGeneratedBlob ? await loadAudioFromIDB(key) : null;
    if (fromIdb && fromIdb.rawBuffer && audioCtx) {
      const decoded = await audioCtx.decodeAudioData(fromIdb.rawBuffer.slice(0));
      const mimeType = fromIdb.mimeType || "audio/mpeg";
      const blob = new Blob([fromIdb.rawBuffer], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const item: CachedAudioItem = {
        audioBuffer: decoded,
        blobUrl,
        duration: decoded.duration,
        voiceId: fromIdb.voiceId || voiceId,
        text: fromIdb.text || text,
        rawBuffer: fromIdb.rawBuffer,
        blob,
        mimeType,
        words: fromIdb.words,
      };
      await setCachedSceneAudio(scene.id, voiceId, text, item);
      // Alias the dead persisted blob URL to the restored cache item. Callers
      // can keep passing the scene metadata without repeatedly rebuilding it.
      if (scene.audio_url) urlAudioCache.set(scene.audio_url, item);
      return { buffer: decoded, duration: decoded.duration, url: blobUrl, words: fromIdb.words };
    }
  } catch {}

  // 3. Check scene.audio_url (local blob or existing URL)
  if (scene.audio_url) {
    try {
      const res = await fetch(scene.audio_url);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        /* The file came through its URL, so the marks have to be re-attached
           from the durable row — this is the path a restored project, a
           synced device and a re-opened tab take, and it used to lose them
           (captions then followed an estimate instead of the voice). */
        const words = isPreparedVoiceoverId(scene.voice_id)
          ? undefined
          : await durableNarrationWords(scene.id, text);
        const item: CachedAudioItem = {
          audioBuffer: decoded,
          blobUrl: scene.audio_url,
          duration: decoded.duration,
          voiceId,
          text,
          rawBuffer: arrayBuf,
          words,
        };
        setCachedSceneAudio(scene.id, voiceId, text, item);
        return { buffer: decoded, duration: decoded.duration, url: scene.audio_url, words };
      }
    } catch (e) {
      console.warn("Failed resolving scene.audio_url for scene:", scene.id, e);
    }
  }

  return null;
}

/** Fetch Speechify narration and its word timings directly from Speechify. */
export async function fetchSceneAudioWithTimeline(
  text: string,
  voice: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ rawBuffer: ArrayBuffer; mimeType: string; words: WordTiming[] } | null> {
  const cleanText = (text || "").trim();
  if (!cleanText) return null;
  const audio = await synthesizeSpeechify(cleanText, voice, opts);
  return { rawBuffer: audio.rawBuffer, mimeType: audio.mimeType, words: audio.words };
}

// Pre-generate and cache TTS audio for all scenes in memory
export async function pregenerateAllScenesAudio(
  scenes: Scene[],
  defaultVoice: string = "speechify_male_01",
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, CachedAudioItem>> {
  const audioCtx = getSharedAudioContext();
  const results = new Map<number, CachedAudioItem>();
  const total = scenes.length;
  let completed = 0;

  for (const scene of scenes) {
    const text = (scene.text || "").trim();
    if (!text && !scene.audio_url) {
      completed++;
      onProgress?.(completed, total);
      continue;
    }

    const voiceId = scene.voice_id || defaultVoice;
    const cacheKey = getAudioCacheKey(scene.id, voiceId, text);

    // Reuse only the currently selected track. A scene-id-only cache entry may
    // belong to the voice or imported file that the user replaced.
    const exact = memoryAudioCache.get(cacheKey);
    const existing = scene.audio_url
      ? urlAudioCache.get(scene.audio_url) || (exact?.blobUrl === scene.audio_url ? exact : undefined)
      : exact;
    if (existing) {
      results.set(scene.id, existing);
      completed++;
      onProgress?.(completed, total);
      continue;
    }

    try {
      // 1. If scene has an imported real audio file
      if (scene.audio_url) {
        const res = await fetch(scene.audio_url);
        if (!res.ok) throw new Error(`Saved audio for scene ${scene.id} could not be loaded.`);
        const arrayBuf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        const item: CachedAudioItem = {
          audioBuffer: decoded,
          blobUrl: scene.audio_url,
          duration: decoded.duration,
          voiceId: "imported",
          text,
          rawBuffer: arrayBuf,
        };
        setCachedSceneAudio(scene.id, voiceId, text, item);
        results.set(scene.id, item);
        completed++;
        onProgress?.(completed, total);
        continue;
      }

      // 2. Synthesize directly with Speechify (including word timings for captions)
      const withTimeline = await fetchSceneAudioWithTimeline(text, voiceId, { timeoutMs: 15000 });
      if (!withTimeline) throw new Error(`Speechify returned no audio for scene ${scene.id}.`);
      const decoded = await audioCtx.decodeAudioData(withTimeline.rawBuffer.slice(0));
      const blob = new Blob([withTimeline.rawBuffer], { type: withTimeline.mimeType });
      const blobUrl = URL.createObjectURL(blob);

      const item: CachedAudioItem = {
        audioBuffer: decoded,
        blobUrl,
        duration: decoded.duration,
        voiceId,
        text,
        rawBuffer: withTimeline.rawBuffer,
        blob,
        words: withTimeline.words,
      };

      setCachedSceneAudio(scene.id, voiceId, text, item);
      results.set(scene.id, item);
    } catch (error) {
      console.warn(`Speechify audio preparation failed for scene ${scene.id}:`, error);
      throw error;
    }

    completed++;
    onProgress?.(completed, total);
  }

  return results;
}
