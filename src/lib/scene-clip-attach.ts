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
 *
 * A ONE-SCENE project is the exception, and it has to be, because there the
 * footage is not decoration behind a narration — it is the whole video. Trimming
 * it to the narration window is exactly what cut an uploaded video short, so
 * the whole file is used, it plays once rather than looping, and its own sound
 * is kept the way an inserted scene's is.
 */

import type { Scene } from "../types";
import { addCustomVideo, CustomVideoError, CUSTOM_VIDEO_PREFIX } from "./custom-video";

/** The scene fields to write for a newly uploaded clip. */
export async function sceneUpdatesForVideoFile(
  file: File,
  scene: Pick<Scene, "is_inserted" | "video_volume" | "video_url">,
  narrationDuration: number,
  /** A one-scene project: the clip is the video, so nothing trims or loops it. */
  options: { singleScene?: boolean } = {}
): Promise<Partial<Scene>> {
  const replaceId = scene.video_url?.startsWith(CUSTOM_VIDEO_PREFIX)
    ? scene.video_url.slice(CUSTOM_VIDEO_PREFIX.length)
    : null;
  const clip = await addCustomVideo(file, {
    replaceIds: replaceId ? [replaceId] : [],
  });
  const full = clip.duration > 0 ? clip.duration : narrationDuration;
  const isInserted = Boolean(scene.is_inserted);
  const singleScene = Boolean(options.singleScene);
  return {
    video_url: `custom-video:${clip.id}`,
    video_name: clip.name,
    video_duration: full,
    video_trim_start: 0,
    video_trim_end: singleScene ? full : Math.min(full, narrationDuration),
    video_mute: singleScene ? false : !isInserted,
    video_volume: scene.video_volume ?? 0.8,
    video_fit_mode: !singleScene && full < narrationDuration ? "loop" : "trim",
  };
}

/** A sentence about a failed upload that is fit to show on screen. */
export function videoUploadMessage(err: unknown): string {
  if (err instanceof CustomVideoError) return err.message;
  const message = (err as { message?: string })?.message;
  return message || "That video could not be added.";
}
