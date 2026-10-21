/**
 * A transcript of the audio INSIDE an uploaded video, and how it becomes
 * captions.
 *
 * Scenering's captions are drawn from a scene's text with a karaoke highlight
 * driven by per-word timings (`src/lib/render-captions.ts` + `word-sync.ts`).
 * Narration gets those timings from the TTS engine; footage has no TTS, so it
 * gets them from a transcription of its own soundtrack instead. Once they are
 * on the scene, everything downstream is unchanged: the Captions Studio styles
 * them, the scene text editor corrects them, the SRT export writes them and
 * the renderer burns them in — the same code path a narrated scene uses.
 *
 * Two conventions matter:
 *
 * 1. Timings are stored in SOURCE-FILE seconds, exactly as the transcriber
 *    reported them. A scene can be re-trimmed later, and re-deriving the
 *    offset at draw time (`sceneCaptionWords`) keeps the highlight locked to
 *    the picture instead of drifting by the trim.
 * 2. The transcript text lives in `scene.text`, because that is the field the
 *    caption renderer reads. `caption_source` records that the words came from
 *    the footage rather than from the creator, so the UI can say so — and so
 *    re-transcribing never has to guess whether it is about to overwrite
 *    somebody's script.
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
 * Caption text from transcribed words.
 *
 * Sentence-ending punctuation is kept as typed by the transcriber; the caption
 * renderer does its own upper-casing and wrapping. A trailing space is trimmed
 * so the word count the studio shows is the word count that gets drawn.
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
 * The scene updates that install a transcript.
 *
 * Kept as one function because three places install one (Setup, the Captions
 * step and the clip panel) and they must all produce the same scene.
 */
/**
 * The words a scene should be SPOKEN as narration — which is not the same as
 * the words it shows.
 *
 * A transcript writes the words it heard into `scene.text`, because that is the
 * field the caption renderer reads. Those words came OUT of the video's own
 * soundtrack, so reading them back would put a synthesised voice over the song
 * they were transcribed from. `caption_source` records where the words came
 * from, and text that came from the picture is captions, never a script.
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
 * Whether a stored transcript still describes the footage on the scene.
 *
 * Swapping the video under a transcript leaves captions that no longer match
 * anything. Rather than delete the words silently, the callers ask this and
 * offer to transcribe again.
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
