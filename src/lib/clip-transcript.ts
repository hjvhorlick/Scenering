/**
 * Timed subtitle words imported for a scene, and how they reach the caption
 * renderer.
 *
 * Narrated scenes normally use the script and speech timing data. A scene with
 * its own footage can instead import an SRT/VTT file. Its per-word timings are
 * kept in source-file seconds and shifted into scene time when drawn, so later
 * clip trims do not desynchronise the imported captions.
 */

import type { Scene } from "../types";
import type { WordTiming } from "./word-sync";

/** Where a scene's caption words came from. */
export type CaptionSource = "transcript" | "manual";

/** The scene fields a transcript writes. */
export interface TranscriptSceneFields {
  text: string;
  caption_words: WordTiming[];
  caption_source: CaptionSource;
  /** Seconds of footage the transcript covers — used to spot a stale one. */
  caption_audio_duration: number;
}

/** Keys that persist with the scene, so a transcript survives a reload. */
export const TRANSCRIPT_KEYS = [
  "caption_words",
  "caption_source",
  "caption_audio_duration",
] as const;

/**
 * The scene's caption word timings, moved into scene time.
 *
 * Returns null when there is nothing to sync to, and every caller then falls
 * back to the estimate it already used — so a scene with no transcript behaves
 * exactly as it did before this existed.
 */
export function sceneCaptionWords(scene: Scene | null | undefined): WordTiming[] | null {
  const words = scene?.caption_words;
  if (!Array.isArray(words) || words.length === 0) return null;
  const trimStart = Math.max(0, Number(scene?.video_trim_start) || 0);
  if (trimStart <= 0) return words;
  // Shifted rather than dropped: a trimmed-in clip still wants every word,
  // and the caption clock starts at the scene, not at the file.
  return words.map((word) => ({
    text: word.text,
    start: Math.max(0, word.start - trimStart),
    end: Math.max(0, word.end - trimStart),
  }));
}

/**
 * Caption text from imported timed words.
 *
 * Sentence-ending punctuation is kept as supplied in the subtitle file; the
 * caption renderer does its own upper-casing and wrapping.
 */
export function transcriptToCaptionText(words: readonly WordTiming[]): string {
  return words
    .map((word) => String(word.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

/** True when this scene's captions came from its own soundtrack. */
export function sceneHasTranscript(scene: Scene | null | undefined): boolean {
  return scene?.caption_source === "transcript" && Array.isArray(scene.caption_words)
    ? scene.caption_words.length > 0
    : false;
}

/**
 * The scene updates that install timed captions imported from a subtitle file.
 */
/**
 * The words a scene should be SPOKEN as narration — which is not the same as
 * the words it shows.
 *
 * Imported caption text is not a narration script. Speaking it back over the
 * same footage could duplicate the dialogue or music, so `caption_source`
 * records the distinction.
 */
export function narratableText(scene: {
  text?: string;
  caption_source?: "transcript" | "manual";
}): string {
  return scene.caption_source === "transcript" ? "" : (scene.text || "").trim();
}

/** Whether any scene in the project has words that will actually be spoken. */
export function projectHasNarration(
  scenes: readonly { text?: string; caption_source?: "transcript" | "manual" }[]
): boolean {
  return scenes.some((scene) => Boolean(narratableText(scene)));
}

export function sceneUpdatesForTranscript(
  words: readonly WordTiming[],
  audioDurationSeconds: number
): TranscriptSceneFields {
  const clean = words
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end))
    .map((word) => ({
      text: String(word.text ?? "").trim(),
      start: Math.max(0, word.start),
      end: Math.max(word.start, word.end),
    }))
    .filter((word) => word.text.length > 0);
  return {
    text: transcriptToCaptionText(clean),
    caption_words: clean,
    caption_source: "transcript",
    caption_audio_duration: Math.max(0, Math.round(audioDurationSeconds * 10) / 10),
  };
}

/**
 * Whether imported timed captions still fit the footage on the scene.
 *
 * Swapping the video can leave stale timings, so the UI warns instead of
 * silently treating the old timings as a match.
 */
export function transcriptMatchesClip(
  scene: Scene | null | undefined,
  toleranceSeconds = 1.5
): boolean {
  if (!sceneHasTranscript(scene)) return false;
  const clip = Number(scene?.video_duration) || 0;
  const covered = Number(scene?.caption_audio_duration) || 0;
  if (clip <= 0 || covered <= 0) return true; // nothing to compare against yet
  return Math.abs(clip - covered) <= toleranceSeconds;
}
