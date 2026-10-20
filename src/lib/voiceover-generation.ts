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
