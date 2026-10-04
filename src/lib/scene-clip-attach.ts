/**
 * Attaching an uploaded video file to a scene — one implementation, two
 * callers (the scene editor's Upload Video button and the clip panel).
 *
 * THE BUG THIS REPLACES: the clip panel stored `URL.createObjectURL(file)`
 * straight into `scene.video_url`. That address is only valid for the page
 * that minted it, so a project saved with an uploaded clip opened the next
 * day to a scene that could not play — with no clue as to why. Uploads go
 * through `custom-video.ts` instead, which keeps the file in IndexedDB and
 * hands back the stable `custom-video:<id>` address.
 *
 * The trim defaults are the panel's long-standing rules, kept here so both
 * entry points produce identical scenes:
 *  - the clip is trimmed to the narration window immediately, so a scene is
 *    never longer than what is being said over it;
 *  - a normal script scene mutes the clip (the narration must not be fought
 *    with), while an INSERTED scene keeps its own audio, because there the
 *    clip IS the content;
 *  - a clip shorter than the narration loops instead of leaving dead frames.
 */

import type { Scene } from "../types";
import { addCustomVideo, CustomVideoError } from "./custom-video";

/** The scene fields to write for a newly uploaded clip. */
export async function sceneUpdatesForVideoFile(
  file: File,
  scene: Pick<Scene, "is_inserted" | "video_volume">,
  narrationDuration: number
): Promise<Partial<Scene>> {
  const clip = await addCustomVideo(file);
  const full = clip.duration > 0 ? clip.duration : narrationDuration;
  const isInserted = Boolean(scene.is_inserted);
  return {
    video_url: `custom-video:${clip.id}`,
    video_name: clip.name,
    video_duration: full,
    video_trim_start: 0,
    video_trim_end: Math.min(full, narrationDuration),
    video_mute: !isInserted,
    video_volume: scene.video_volume ?? 0.8,
    video_fit_mode: full < narrationDuration ? "loop" : "trim",
  };
}

/** A sentence about a failed upload that is fit to show on screen. */
export function videoUploadMessage(err: unknown): string {
  if (err instanceof CustomVideoError) return err.message;
  const message = (err as { message?: string })?.message;
  return message || "That video could not be added.";
}
