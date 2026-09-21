import { EDGE_FUNCTION_BASE } from "./supabase";
import type { Scene } from "../types";

export interface CachedAudioItem {
  audioBuffer: AudioBuffer;
  blobUrl: string;
  duration: number;
  voiceId: string;
  text: string;
}

// In-memory global cache for synthesized speech audio
const memoryAudioCache = new Map<string, CachedAudioItem>();
const sceneIdAudioCache = new Map<number, CachedAudioItem>();
let sharedAudioContext: AudioContext | null = null;

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

export function getCachedSceneAudio(sceneId: number, voiceId: string, text: string): CachedAudioItem | undefined {
  const key = getAudioCacheKey(sceneId, voiceId, text);
  return memoryAudioCache.get(key) || sceneIdAudioCache.get(sceneId);
}

export function getCachedSceneAudioBySceneId(sceneId: number): CachedAudioItem | undefined {
  return sceneIdAudioCache.get(sceneId);
}

export function setCachedSceneAudio(sceneId: number, voiceId: string, text: string, item: CachedAudioItem): void {
  const key = getAudioCacheKey(sceneId, voiceId, text);
  memoryAudioCache.set(key, item);
  sceneIdAudioCache.set(sceneId, item);
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
    const existing = memoryAudioCache.get(cacheKey);
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
          };
          memoryAudioCache.set(cacheKey, item);
          results.set(scene.id, item);
          completed++;
          onProgress?.(completed, total);
          continue;
        }
      }

      // 2. Synthesize via /api/tts or Edge Function
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceId }),
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
        };

        memoryAudioCache.set(cacheKey, item);
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
