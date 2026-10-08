import type { Scene } from "../types";
import { synthesizeSpeechify } from "./speechify-client";
import type { WordTiming } from "./word-sync";

export interface CachedAudioItem {
  audioBuffer: AudioBuffer;
  blobUrl: string;
  duration: number;
  voiceId: string;
  text: string;
  rawBuffer?: ArrayBuffer;
  blob?: Blob;
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
  words?: WordTiming[]
) {
  try {
    const db = await openVoiceoverDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put({
      key,
      sceneId,
      rawBuffer,
      voiceId,
      text,
      duration,
      words: words && words.length > 0 ? words : undefined,
      updatedAt: Date.now(),
    });
  } catch {}
}

async function loadAudioFromIDB(
  key: string
): Promise<{ rawBuffer: ArrayBuffer; duration: number; voiceId: string; text: string; words?: WordTiming[] } | null> {
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
  return `${sceneId}_${voiceId}_${text.trim()}`;
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

export function setCachedSceneAudio(sceneId: number, voiceId: string, text: string, item: CachedAudioItem): void {
  const key = getAudioCacheKey(sceneId, voiceId, text);
  memoryAudioCache.set(key, item);
  sceneIdAudioCache.set(sceneId, item);
  if (item.blobUrl) {
    urlAudioCache.set(item.blobUrl, item);
  }
  if (item.rawBuffer) {
    persistAudioToIDB(key, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration, item.words);
    persistAudioToIDB(`scene_${sceneId}`, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration, item.words);
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
  const cached = currentUrlCached || (
    exactCached && (!scene.audio_url || exactCached.blobUrl === scene.audio_url)
      ? exactCached
      : undefined
  );
  if (cached) {
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

  // 2. Check the exact voice+text IndexedDB key only when there is no newer
  // explicit scene URL. Never fall back to the legacy scene-only key: it may
  // contain the narration that was just replaced.
  try {
    const fromIdb = !scene.audio_url ? await loadAudioFromIDB(key) : null;
    if (fromIdb && fromIdb.rawBuffer && audioCtx) {
      const decoded = await audioCtx.decodeAudioData(fromIdb.rawBuffer.slice(0));
      const blob = new Blob([fromIdb.rawBuffer], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      const item: CachedAudioItem = {
        audioBuffer: decoded,
        blobUrl,
        duration: decoded.duration,
        voiceId: fromIdb.voiceId || voiceId,
        text: fromIdb.text || text,
        rawBuffer: fromIdb.rawBuffer,
        blob,
        words: fromIdb.words,
      };
      setCachedSceneAudio(scene.id, voiceId, text, item);
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
        const item: CachedAudioItem = {
          audioBuffer: decoded,
          blobUrl: scene.audio_url,
          duration: decoded.duration,
          voiceId,
          text,
          rawBuffer: arrayBuf,
        };
        setCachedSceneAudio(scene.id, voiceId, text, item);
        return { buffer: decoded, duration: decoded.duration, url: scene.audio_url };
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
