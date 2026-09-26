import { EDGE_FUNCTION_BASE } from "./supabase";
import type { Scene } from "../types";
import { sanitizeTextForSpeech } from "./speech-sanitizer";

export interface CachedAudioItem {
  audioBuffer: AudioBuffer;
  blobUrl: string;
  duration: number;
  voiceId: string;
  text: string;
  rawBuffer?: ArrayBuffer;
  blob?: Blob;
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

async function persistAudioToIDB(key: string, sceneId: number, rawBuffer: ArrayBuffer, voiceId: string, text: string, duration: number) {
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
      updatedAt: Date.now(),
    });
  } catch {}
}

async function loadAudioFromIDB(key: string): Promise<{ rawBuffer: ArrayBuffer; duration: number; voiceId: string; text: string } | null> {
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
    const item = memoryAudioCache.get(key);
    if (item) return item;
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
    persistAudioToIDB(key, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration);
    persistAudioToIDB(`scene_${sceneId}`, sceneId, item.rawBuffer.slice(0), voiceId, text, item.duration);
  }
}

/**
 * Resolves an existing decoded AudioBuffer for a scene instantly without re-synthesizing!
 * Checks in-memory cache, IndexedDB persistent cache, and scene.audio_url blob.
 */
export async function resolveSceneAudioBuffer(
  scene: Scene,
  audioCtx: AudioContext
): Promise<{ buffer: AudioBuffer; duration: number; url: string } | null> {
  const text = (scene.text || "").trim();
  const voiceId = scene.voice_id || "guy";
  const key = getAudioCacheKey(scene.id, voiceId, text);

  // 1. Check in-memory item
  const cached = memoryAudioCache.get(key) || sceneIdAudioCache.get(scene.id) || (scene.audio_url ? urlAudioCache.get(scene.audio_url) : undefined);
  if (cached) {
    // If the buffer was decoded with matching sampleRate or AudioContext
    if (cached.audioBuffer && (!audioCtx || cached.audioBuffer.sampleRate === audioCtx.sampleRate)) {
      return {
        buffer: cached.audioBuffer,
        duration: cached.duration || cached.audioBuffer.duration,
        url: cached.blobUrl,
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
        };
      } catch {}
    }
  }

  // 2. Check IndexedDB storage
  try {
    const fromIdb = (await loadAudioFromIDB(key)) || (await loadAudioFromIDB(`scene_${scene.id}`));
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
      };
      setCachedSceneAudio(scene.id, voiceId, text, item);
      return { buffer: decoded, duration: decoded.duration, url: blobUrl };
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

// Pre-generate and cache TTS audio for all scenes in memory
export async function pregenerateAllScenesAudio(
  scenes: Scene[],
  defaultVoice: string = "guy",
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

    // Check if already in memory
    const existing = memoryAudioCache.get(cacheKey) || sceneIdAudioCache.get(scene.id);
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
        if (res.ok) {
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
      }

      // 2. Synthesize via /api/tts
      const cleanText = sanitizeTextForSpeech(text);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, voice: voiceId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
        const blobUrl = URL.createObjectURL(blob);

        const item: CachedAudioItem = {
          audioBuffer: decoded,
          blobUrl,
          duration: decoded.duration,
          voiceId,
          text,
          rawBuffer: arrayBuf,
          blob,
        };

        setCachedSceneAudio(scene.id, voiceId, text, item);
        results.set(scene.id, item);
      }
    } catch (err) {
      console.warn(`Background audio cache failed for scene ${scene.id}:`, err);
    }

    completed++;
    onProgress?.(completed, total);
  }

  return results;
}
