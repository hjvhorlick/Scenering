import type { Scene } from "../types";

/**
 * Playback plumbing for short video clips attached to scenes.
 *
 * Clips are drawn through the very same framing engine as stills
 * (`drawSceneImage`), so a clip is cropped, letterboxed and blur-filled with
 * identical rules and is never stretched out of its aspect ratio. A
 * `<video>` element exposes its size as videoWidth/videoHeight rather than
 * naturalWidth/naturalHeight, so it is wrapped in a thin adapter.
 */

/** Framing code reads naturalWidth/naturalHeight; videos do not have them. */
export interface DrawableClip {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly element: HTMLVideoElement;
}

/** Wrap a video element so the framing engine can measure and draw it. */
export function asDrawableClip(video: HTMLVideoElement): DrawableClip & CanvasImageSource {
  return new Proxy(video, {
    get(target, prop, receiver) {
      if (prop === "naturalWidth") return target.videoWidth;
      if (prop === "naturalHeight") return target.videoHeight;
      if (prop === "element") return target;
      if (prop === "complete") return target.readyState >= 2;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as DrawableClip & CanvasImageSource;
}

/** True when this scene should show a clip rather than a still image. */
export function sceneHasClip(scene: Scene | null | undefined): boolean {
  return Boolean(scene?.video_url);
}

export interface ClipTiming {
  start: number;
  end: number;
  /** Length of the trimmed selection. */
  length: number;
}

/** Resolve the trim window, falling back to the whole clip. */
export function clipTiming(scene: Scene): ClipTiming {
  const full = scene.video_duration ?? 0;
  const start = Math.max(0, scene.video_trim_start ?? 0);
  const rawEnd = scene.video_trim_end ?? (full || start);
  const end = Math.max(start + 0.05, rawEnd);
  return { start, end, length: end - start };
}

/**
 * Whether the clip's own soundtrack should be silenced.
 *
 * Script scenes mute by default so the narration is heard. An INSERTED scene
 * is content the user deliberately dropped in, so it keeps its own audio
 * unless they tick the box.
 */
export function clipIsMuted(scene: Scene): boolean {
  if (typeof scene.video_mute === "boolean") return scene.video_mute;
  return !scene.is_inserted;
}

/**
 * Map a scene's playback progress onto a time inside the source clip,
 * honouring the trim window and the chosen behaviour when the clip is shorter
 * than the scene.
 */
export function clipTimeForProgress(scene: Scene, sceneProgress: number, sceneDuration: number): number {
  const { start, length } = clipTiming(scene);
  const p = Math.max(0, Math.min(1, sceneProgress));
  const mode = scene.video_fit_mode || "trim";
  const wanted = p * Math.max(0.05, sceneDuration);

  if (length <= 0) return start;

  switch (mode) {
    case "loop":
      return start + (wanted % length);
    case "slow":
      // Stretch the selection evenly across the scene.
      return start + p * length;
    case "trim":
    default:
      // Play at natural speed, then hold the last frame.
      return start + Math.min(wanted, length);
  }
}

/**
 * A pool of hidden <video> elements, one per scene, kept ready for drawing.
 * Elements are reused across frames so seeking stays smooth.
 */
export class ClipPool {
  private elements = new Map<number, HTMLVideoElement>();

  /** Get (or create) the element for a scene, returning null without a clip. */
  get(scene: Scene): HTMLVideoElement | null {
    if (!scene.video_url) return null;

    let el = this.elements.get(scene.id);
    if (!el) {
      el = document.createElement("video");
      el.preload = "auto";
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.loop = (scene.video_fit_mode || "trim") === "loop";
      this.elements.set(scene.id, el);
    }
    if (el.getAttribute("data-src") !== scene.video_url) {
      el.src = scene.video_url;
      el.setAttribute("data-src", scene.video_url);
      el.load();
    }
    el.muted = clipIsMuted(scene);
    el.volume = clipIsMuted(scene) ? 0 : Math.max(0, Math.min(1, scene.video_volume ?? 0.8));
    return el;
  }

  /** True once the element has enough data to be painted onto a canvas. */
  isReady(scene: Scene): boolean {
    const el = this.elements.get(scene.id);
    return Boolean(el && el.readyState >= 2 && el.videoWidth > 0);
  }

  /** Park the clip at the frame matching this point in the scene. */
  seekToProgress(scene: Scene, sceneProgress: number, sceneDuration: number): void {
    const el = this.get(scene);
    if (!el || el.readyState < 1) return;
    const t = clipTimeForProgress(scene, sceneProgress, sceneDuration);
    if (Math.abs(el.currentTime - t) > 0.08) {
      try {
        el.currentTime = t;
      } catch {
        /* seeking before metadata is ready throws in some browsers */
      }
    }
  }

  /** Start live playback of a scene's clip from the given progress point. */
  async play(scene: Scene, sceneProgress: number, sceneDuration: number): Promise<void> {
    const el = this.get(scene);
    if (!el) return;
    this.seekToProgress(scene, sceneProgress, sceneDuration);
    try {
      await el.play();
    } catch {
      /* autoplay restrictions — the canvas still draws seeked frames */
    }
  }

  /** Pause everything; used when the preview stops. */
  pauseAll(): void {
    for (const el of this.elements.values()) {
      try {
        el.pause();
      } catch {}
    }
  }

  /** Release every element and its decoder. */
  dispose(): void {
    for (const el of this.elements.values()) {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {}
    }
    this.elements.clear();
  }
}
