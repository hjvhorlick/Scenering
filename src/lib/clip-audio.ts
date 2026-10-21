/**
 * The soundtrack of a clip attached to a scene.
 *
 * THE BUG THIS REPLACES: an uploaded video played with its own sound in the
 * preview — the `<video>` element is unmuted there — and then the exported file
 * had no soundtrack at all. The renderer draws clips frame by frame by SEEKING
 * a hidden `<video>` element, and a seeked element makes no noise, so nothing
 * ever carried the clip's audio into either audio graph. "Keep the original
 * sound" was a switch with nothing behind it.
 *
 * The fix is to treat the clip's audio like every other track in the project:
 * decode it once, then schedule it on the timeline to the sample. That works
 * identically in both renderers — the frame-exact one (an
 * `OfflineAudioContext`, where nothing plays in real time at all) and the
 * compatibility one (a live `AudioContext` recorded by MediaRecorder) — and it
 * lands on the music bus, so narration ducks it automatically when a project
 * has both.
 *
 * Nothing here knows about uploading. It resolves the scene's stored address
 * through `resolveVideoUrl`, so a clip kept in IndexedDB, a `blob:` URL and a
 * remote http clip all work the same way.
 */

import { resolveVideoUrl } from "./custom-video";
import { clipIsMuted, clipTiming } from "./scene-clip";
import type { Scene } from "../types";

/** Where a clip's soundtrack sits on the project timeline. */
export interface ClipAudioPlan {
  /** Seconds from the start of the finished video. */
  whenSeconds: number;
  /** Where to start reading inside the source track (the trim window). */
  offsetSeconds: number;
  /** How much of the track to play, in seconds. */
  durationSeconds: number;
  /** 0..1, from the scene's own volume control. */
  volume: number;
}

/** Raw bytes per resolved address, so a file is only ever read off disk once. */
const sourceCache = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * Reads the clip's bytes.
 *
 * Cached as bytes rather than as a decoded `AudioBuffer`: `decodeAudioData`
 * detaches the buffer it is given, and each render builds its own audio
 * context, so the decode happens per context from a copy of these bytes.
 */
function sourceBytes(url: string): Promise<ArrayBuffer | null> {
  const existing = sourceCache.get(url);
  if (existing) return existing;
  const task = fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  sourceCache.set(url, task);
  return task;
}

/**
 * Decodes the soundtrack of a clip.
 *
 * Returns null when the file has no audio track the browser can decode — a
 * silent screen recording, or a codec this browser cannot read. Callers say so
 * out loud rather than rendering a silently empty track.
 */
export async function loadClipAudio(
  videoUrl: string | null | undefined,
  ctx: BaseAudioContext
): Promise<AudioBuffer | null> {
  const resolved = resolveVideoUrl(videoUrl);
  if (!resolved) return null;
  const bytes = await sourceBytes(resolved);
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    // Copied: decoding detaches the buffer, and the cache has to survive it.
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch (error) {
    console.warn("The clip's soundtrack could not be decoded:", error);
    return null;
  }
}

/**
 * Where this scene's clip soundtrack plays, or null when it must not be heard.
 *
 * A muted clip produces no plan at all rather than a plan at zero volume: the
 * point of "remove the original sound" is that the track is not in the file.
 */
export function clipAudioPlanFor(
  scene: Scene,
  sceneStartSeconds: number,
  sceneDurationSeconds: number
): ClipAudioPlan | null {
  if (!scene?.video_url) return null;
  if (clipIsMuted(scene)) return null;
  const { start, length } = clipTiming(scene);
  const volume = Math.max(0, Math.min(1, scene.video_volume ?? 0.8));
  if (volume <= 0) return null;
  const play = Math.max(0, Math.min(length, sceneDurationSeconds));
  if (play <= 0) return null;
  return {
    whenSeconds: Math.max(0, sceneStartSeconds),
    offsetSeconds: Math.max(0, start),
    durationSeconds: play,
    volume,
  };
}

/**
 * Places a decoded soundtrack on the timeline.
 *
 * Works on an `OfflineAudioContext` (the frame-exact renderer) and on a live
 * `AudioContext` (the compatibility renderer) alike, because both schedule
 * against their own clock. Returns the source so a live render can stop it when
 * the export is cancelled.
 */
export function scheduleClipAudio(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  plan: ClipAudioPlan,
  destination: AudioNode,
  /** Seconds on this context's own clock; 0 for an offline render. */
  whenOnContextClock = 0
): AudioBufferSourceNode | null {
  const startAt = Math.max(0, whenOnContextClock + plan.whenSeconds);
  // A trim that runs past the end of the track must not throw — it plays what
  // is left, which is exactly what the picture does too.
  const offset = Math.max(0, Math.min(plan.offsetSeconds, Math.max(0, buffer.duration - 0.01)));
  const wanted = Math.min(plan.durationSeconds, Math.max(0, buffer.duration - offset));
  if (wanted <= 0) return null;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = plan.volume;
    source.connect(gain);
    gain.connect(destination);
    source.start(startAt, offset, wanted);
    return source;
  } catch (error) {
    console.warn("The clip's soundtrack could not be scheduled:", error);
    return null;
  }
}
