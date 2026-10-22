import type { Scene, TimelineInsert } from "../types";

/** The inputs that were used for the audio currently attached to one scene. */
export interface VoiceoverAudioSnapshotEntry {
  input: string;
  music: string;
}

/** Saved per project so navigating away from Voiceover does not lose its baseline. */
export type VoiceoverAudioSnapshot = Record<string, VoiceoverAudioSnapshotEntry>;

export interface VoiceoverGenerationTarget {
  scene: Scene;
  voiceId: string;
}

export function isVoiceoverAudioSnapshot(value: unknown): value is VoiceoverAudioSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    return typeof row.input === "string" && typeof row.music === "string";
  });
}

/** A prepared file is an explicit per-scene voice choice, not Speechify TTS. */
export function isPreparedVoiceoverId(voiceId: string | null | undefined): boolean {
  return typeof voiceId === "string" && /^(custom|import):/.test(voiceId);
}

/** Which voice a scene should use when the optional A/B rotation is enabled. */
export function expectedVoiceForSceneIndex(
  index: number,
  primaryVoice: string,
  rotateVoices: boolean,
  secondVoice: string
): string {
  if (!rotateVoices || !secondVoice) return primaryVoice;
  return index % 2 === 0 ? primaryVoice : secondVoice;
}

/** The exact speech inputs; music is tracked separately because it is mixed on its own bus. */
export function voiceoverInputFingerprint(scene: Pick<Scene, "id" | "text">, voiceId: string): string {
  return JSON.stringify({
    sceneId: scene.id,
    text: (scene.text || "").trim(),
    voiceId,
  });
}

/**
 * Only the selected full-video music bed affects this fingerprint. Other
 * timeline inserts and their visual settings cannot stale narration audio.
 */
export function backgroundMusicFingerprint(inserts: readonly TimelineInsert[]): string {
  const music = inserts
    .filter((insert) => insert.category === "background_music")
    .map((insert) => ({
      type: insert.type,
      title: insert.title,
      // Background beds are automatically stretched to the current video
      // duration, which changes after TTS is fitted to the spoken audio. That
      // derived timing must not make unchanged music invalidate narration.
      audioSettings: {
        soundUrl: insert.audioSettings?.soundUrl ?? null,
        volume: insert.audioSettings?.volume ?? null,
        muted: insert.audioSettings?.muted ?? null,
        loop: insert.audioSettings?.loop ?? insert.audioSettings?.loopAudio ?? null,
        delay: insert.audioSettings?.delay ?? null,
      },
    }));
  return JSON.stringify(music);
}

/**
 * A scene is generated only when its saved audio or the inputs that created it
 * are stale. Old projects without a snapshot adopt matching attached audio as
 * their baseline instead of synthesizing it again on their first visit.
 */
export function sceneNeedsVoiceoverGeneration(
  scene: Scene,
  expectedVoice: string,
  musicFingerprint: string,
  previous?: VoiceoverAudioSnapshotEntry
): boolean {
  if (!(scene.text || "").trim()) return false;
  if (!scene.audio_url) return true;

  // A user-provided prepared track stays attached as an explicit scene
  // override. It cannot be re-synthesized by Speechify when music changes.
  if (isPreparedVoiceoverId(scene.voice_id)) return false;
  if (scene.voice_id !== expectedVoice) return true;
  if (!previous) return false;

  return (
    previous.input !== voiceoverInputFingerprint(scene, expectedVoice) ||
    previous.music !== musicFingerprint
  );
}

export function planVoiceoverGeneration(
  scenes: readonly Scene[],
  options: {
    primaryVoice: string;
    rotateVoices: boolean;
    secondVoice: string;
    musicFingerprint: string;
    snapshot: VoiceoverAudioSnapshot;
  }
): VoiceoverGenerationTarget[] {
  const targets: VoiceoverGenerationTarget[] = [];
  scenes.forEach((scene, index) => {
    const voiceId = expectedVoiceForSceneIndex(
      index,
      options.primaryVoice,
      options.rotateVoices,
      options.secondVoice
    );
    if (
      sceneNeedsVoiceoverGeneration(
        scene,
        voiceId,
        options.musicFingerprint,
        options.snapshot[String(scene.id)]
      )
    ) {
      targets.push({ scene, voiceId });
    }
  });
  return targets;
}

/** Record only audio that is already current; failed/stale scenes keep their old fingerprint. */
export function recordCurrentVoiceoverAudio(
  snapshot: VoiceoverAudioSnapshot,
  scenes: readonly Scene[],
  options: {
    primaryVoice: string;
    rotateVoices: boolean;
    secondVoice: string;
    musicFingerprint: string;
    excludeSceneIds?: ReadonlySet<number>;
  }
): VoiceoverAudioSnapshot {
  const currentIds = new Set(scenes.map((scene) => String(scene.id)));
  const next: VoiceoverAudioSnapshot = Object.fromEntries(
    Object.entries(snapshot).filter(([sceneId]) => currentIds.has(sceneId))
  );

  scenes.forEach((scene, index) => {
    if (options.excludeSceneIds?.has(scene.id)) return;
    if (!(scene.text || "").trim() || !scene.audio_url) return;
    const voiceId = expectedVoiceForSceneIndex(
      index,
      options.primaryVoice,
      options.rotateVoices,
      options.secondVoice
    );
    const sceneKey = String(scene.id);
    if (isPreparedVoiceoverId(scene.voice_id)) {
      // Prepared files are not re-synthesized, so their current music bed can
      // be adopted immediately without changing the attached audio.
      next[sceneKey] = {
        input: voiceoverInputFingerprint(scene, voiceId),
        music: options.musicFingerprint,
      };
      return;
    }
    if (scene.voice_id !== voiceId || snapshot[sceneKey]) return;
    // Only seed missing entries for legacy projects. A previous fingerprint
    // that disagrees is evidence that the existing audio needs regeneration.
    next[sceneKey] = {
      input: voiceoverInputFingerprint(scene, voiceId),
      music: options.musicFingerprint,
    };
  });

  return next;
}

/** Record a scene whose fresh synthesis has just completed. */
export function recordGeneratedVoiceover(
  snapshot: VoiceoverAudioSnapshot,
  scene: Scene,
  voiceId: string,
  musicFingerprint: string
): VoiceoverAudioSnapshot {
  return {
    ...snapshot,
    [String(scene.id)]: {
      input: voiceoverInputFingerprint(scene, voiceId),
      music: musicFingerprint,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Replacing a narrator, rather than layering a second one
 *
 * Changing the voice used to leave the previous file attached to every scene
 * and rely on the next visit to the Voiceover step to overwrite it. Anything
 * that reached the picture before that overwrite — the render page opened
 * directly, a scene whose synthesis failed, a project whose saved settings
 * arrived from another device — still found the old file attached and played
 * it. The result was a video narrated mostly in the new voice with a piece of
 * the old one left at the end.
 *
 * The two rules below make that impossible:
 *
 *  • A file belongs to the scene only while it was made for the scene's
 *    CURRENT narrator and CURRENT words (`cachedNarrationBelongsToScene`).
 *    Anything else is stale, whatever its pointer says.
 *  • Choosing a different narrator retires the files made with the old one
 *    (`planNarrationRetirement`), so nothing can replay them while the new
 *    narration is being made.
 *
 * A prepared file (the creator's own recording, `custom:`/`import:`) is not
 * Speechify narration: it is an explicit per-scene choice, so neither rule
 * touches it.
 * ------------------------------------------------------------------ */

/** A cached narration file, reduced to the facts that identify it. */
export interface CachedNarrationIdentity {
  voiceId?: string | null;
  text?: string | null;
}

/**
 * Was this cached file made for this scene as it is NOW?
 *
 * The cache key already includes the scene, the voice and the script, so a
 * lookup by key is correct by construction. The pointer on the scene — its
 * `audio_url` — is not: a scene can be re-cast, re-scripted or restored from
 * another device while an older file is still attached to it. Before playing
 * or rendering anything that came through a pointer, this check decides.
 */
export function cachedNarrationBelongsToScene(
  item: CachedNarrationIdentity | null | undefined,
  scene: Pick<Scene, "voice_id" | "text">
): boolean {
  if (!item) return false;
  // A prepared track is addressed by its own URL and is never re-synthesised
  // (the script may well have been edited after the recording was imported).
  if (isPreparedVoiceoverId(scene.voice_id)) return true;
  const itemVoice = typeof item.voiceId === "string" ? item.voiceId : "";
  const sceneVoice = typeof scene.voice_id === "string" ? scene.voice_id : "";
  // `imported` is what the shared cache records for a file it did not make
  // itself; it says nothing about the narrator, so only the words can be checked.
  if (itemVoice && sceneVoice && itemVoice !== "imported" && itemVoice !== sceneVoice) return false;
  if (typeof item.text === "string" && item.text.trim() !== (scene.text || "").trim()) return false;
  return true;
}

/** One scene whose attached narration belongs to a narrator no longer selected. */
export interface NarrationRetirement {
  scene: Scene;
  /** The narrator the attached file was made with (being retired). */
  fromVoiceId: string;
  /** The narrator this scene should now be spoken in. */
  voiceId: string;
}

/**
 * The scenes whose attached narration was made with a narrator the project no
 * longer uses.
 *
 * Applying one detaches the file from the scene (`audio_url` cleared) and
 * stamps the scene with the narrator it should now use, so every later step —
 * the per-scene player, the preview, the renderer — either regenerates that
 * line or leaves it silent until it is regenerated. It can never reach back to
 * the old voice and play it.
 *
 * The file itself is not deleted here: it stays in the voiceover cache under
 * the old narrator until new narration is generated for that scene. Switching
 * back before then re-attaches it for free rather than synthesising it again.
 */
export function planNarrationRetirement(
  scenes: readonly Scene[],
  options: {
    primaryVoice: string;
    rotateVoices: boolean;
    secondVoice: string;
  }
): NarrationRetirement[] {
  const plan: NarrationRetirement[] = [];
  scenes.forEach((scene, index) => {
    if (!scene.audio_url) return;
    if (isPreparedVoiceoverId(scene.voice_id)) return;
    // A project saved before scenes recorded their narrator has audio whose
    // voice cannot be identified. It is left alone: there is no evidence that
    // it belongs to a different narrator, and detaching it would force a
    // regeneration the creator never asked for.
    if (!scene.voice_id) return;
    const voiceId = expectedVoiceForSceneIndex(
      index,
      options.primaryVoice,
      options.rotateVoices,
      options.secondVoice
    );
    const fromVoiceId: string = scene.voice_id;
    if (fromVoiceId === voiceId) return;
    plan.push({ scene, fromVoiceId, voiceId });
  });
  return plan;
}
