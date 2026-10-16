import type { Scene } from "../types";
import { migrateLegacyVoiceId } from "../data/voice-presets";

/**
 * Rebuilding the scene list from the Setup script.
 *
 * The owner's rule (2026-10-16): the user can go back and forth between the
 * sections as they want, and the application remembers the last choice made
 * in any of them. Setup's script is the one place a section can rewrite
 * another's work, so two rules keep it from losing anything:
 *
 *  1. Setup only rebuilds the scenes when the script, the scene length or the
 *     one-scene choice really changed (`setupNeedsRebuild`). Going back to
 *     Setup and moving on again with nothing changed leaves every scene — and
 *     everything set on it — exactly as it was, including text edited in the
 *     Scenes section.
 *  2. When it does rebuild, each script scene keeps every setting it had
 *     (image, framing, transition, captions, voice, clip...), matched by
 *     position among the script scenes. Only the text comes from the script,
 *     and only a scene whose text changed gets a new length and search term.
 *     Scenes added in the Scenes section (`is_inserted`) are not part of the
 *     script: they keep their place and are never overwritten.
 *
 * Pure functions, no React and no storage, so the rules can be pinned by tests.
 */

/** The values Setup builds scenes from. */
export interface SetupInputs {
  script: string;
  /** Target scene length in seconds. */
  duration: number;
  oneScene: boolean;
}

const normalizeScript = (text: string) => text.replace(/\r\n?/g, "\n").trim();

/** True when Setup's inputs differ from the ones the scenes were last built from. */
export function setupNeedsRebuild(submitted: SetupInputs, built: SetupInputs): boolean {
  return (
    normalizeScript(submitted.script) !== normalizeScript(built.script) ||
    submitted.duration !== built.duration ||
    submitted.oneScene !== built.oneScene
  );
}

/** One scene's worth of the split script. */
export interface ScriptPart {
  text: string;
  imageQuery?: string;
}

export interface RebuildOptions {
  projectId: number;
  /** Length in seconds for a scene with this text: the app's own timing rule. */
  durationFor: (text: string, existing: Scene | undefined) => number;
  /** Re-time every scene, because the target length or one-scene mode changed. */
  retimeAll: boolean;
  /** Clock for new scene ids and dates; injectable for tests. */
  now?: () => number;
}

export interface RebuildResult {
  scenes: Scene[];
  /** Script scenes the new script no longer has. */
  removed: Scene[];
}

export function rebuildScenesFromScript(
  prev: readonly Scene[],
  parts: readonly ScriptPart[],
  options: RebuildOptions
): RebuildResult {
  const now = options.now ? options.now() : Date.now();
  // New scenes get clock-based ids, the same scheme as the storage layer and
  // "Add Scene": per-scene settings are stored under the id for every project
  // alike, so a small id like 3 could pick up another project's scene.
  let nextId = Math.max(now, ...prev.map((scene) => (typeof scene.id === "number" ? scene.id : 0)).map((id) => id + 1));

  const fromPart = (part: ScriptPart, existing: Scene | undefined): Scene => {
    const text = part.text.trim();
    if (existing) {
      // Everything on the scene stays as it is; only what the script decides
      // is touched, and only when its words actually changed.
      const textChanged = (existing.text || "").trim() !== text;
      return {
        ...existing,
        text,
        image_query:
          existing.image_query_locked && existing.image_query
            ? existing.image_query
            : textChanged
              ? part.imageQuery || existing.image_query || "abstract background"
              : existing.image_query || part.imageQuery || "abstract background",
        duration:
          options.retimeAll || textChanged || !existing.duration
            ? options.durationFor(text, existing)
            : existing.duration,
        ...(existing.voice_id ? { voice_id: migrateLegacyVoiceId(existing.voice_id) } : {}),
      };
    }
    return {
      id: nextId++,
      project_id: options.projectId,
      order_index: 0,
      text,
      image_url: null,
      image_query: part.imageQuery || "abstract background",
      duration: options.durationFor(text, undefined),
      created_at: new Date(now).toISOString(),
      motion_effect: "slow_zoom",
      audio_url: null,
      audio_name: null,
      video_url: null,
      video_name: null,
    } as Scene;
  };

  const merged: Scene[] = [];
  let partIndex = 0;
  let afterLastScriptScene = 0;
  for (const existing of prev) {
    if (existing.is_inserted) {
      merged.push(existing);
      continue;
    }
    if (partIndex >= parts.length) continue; // the script no longer has this scene
    merged.push(fromPart(parts[partIndex++], existing));
    afterLastScriptScene = merged.length;
  }
  // Paragraphs beyond the old script continue it, so they follow the last
  // script scene; scenes inserted after that keep their place behind them.
  const added = parts.slice(partIndex).map((part) => fromPart(part, undefined));
  merged.splice(afterLastScriptScene, 0, ...added);

  const scenes = merged.map((scene, index) => ({ ...scene, order_index: index }));
  const kept = new Set(scenes.map((scene) => scene.id));
  return { scenes, removed: prev.filter((scene) => !kept.has(scene.id)) };
}
