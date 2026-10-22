import type { Scene } from "../types";
import { resolveVideoUrl } from "./custom-video";

/**
 * Playback plumbing for short video clips attached to scenes.
 *
 * Clips are drawn through the very same framing engine as stills
 * (`drawSceneImage`), so a clip is cropped, letterboxed and blur-filled with
 * identical rules and is never stretched out of its aspect ratio. A
 * `<video>` element exposes its size as videoWidth/videoHeight rather than
 * naturalWidth/naturalHeight, so the framing engine handles both natively.
 */

/**
 * Return the real platform element. Canvas drawImage performs a Web-IDL brand
 * check that can reject Proxies or look-alike wrappers. The framing engine now
 * reads videoWidth/videoHeight directly, so no mutation or adapter is needed.
 */
export function asDrawableClip(video: HTMLVideoElement): HTMLVideoElement {
  return video;
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
  private missingReported = new Set<number>();

  constructor(
    private readonly onStatus?: (
      sceneId: number,
      status: "frame" | "error",
      message?: string
    ) => void
  ) {}

  /** Get (or create) the element for a scene, returning null without a clip. */
  get(scene: Scene): HTMLVideoElement | null {
    if (!scene.video_url) return null;
    // An uploaded clip is stored as `custom-video:<id>`; the live object URL
    // only exists for this page load, so it is resolved here rather than
    // being written into the saved scene.
    const src = resolveVideoUrl(scene.video_url);
    if (!src) {
      if (!this.missingReported.has(scene.id)) {
        this.missingReported.add(scene.id);
        this.onStatus?.(
          scene.id,
          "error",
          "The uploaded video is no longer available in this browser's storage. Re-upload it in this scene."
        );
      }
      return null;
    }
    this.missingReported.delete(scene.id);

    let el = this.elements.get(scene.id);
    if (!el) {
      el = document.createElement("video");
      el.preload = "auto";
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.loop = (scene.video_fit_mode || "trim") === "loop";
      // Safari and some mobile media pipelines do not reliably decode or
      // advance a detached media element. Keep the real element mounted one
      // pixel off-screen; canvas still receives that exact platform object.
      el.style.position = "fixed";
      el.style.left = "-10000px";
      el.style.top = "0";
      el.style.width = "1px";
      el.style.height = "1px";
      el.style.pointerEvents = "none";
      document.body?.appendChild(el);
      this.elements.set(scene.id, el);
      const notifyFrame = () => {
        // Ignore a late event from an element already released by retain/dispose.
        if (this.elements.get(scene.id) === el) this.onStatus?.(scene.id, "frame");
      };
      const notifyError = () => {
        if (this.elements.get(scene.id) !== el) return;
        const mediaError = el?.error;
        this.onStatus?.(
          scene.id,
          "error",
          mediaError?.message || `The browser could not decode this video (media error ${mediaError?.code || "unknown"}).`
        );
      };
      const primeFirstFrame = () => {
        if (this.elements.get(scene.id) !== el || !el || el.readyState >= 2) return;
        // A few engines stop at metadata for a detached/paused element and do
        // not decode frame zero until the first seek. A tiny seek is invisible
        // but guarantees loadeddata/seeked and therefore a canvas repaint.
        const wanted = clipTiming(scene).start;
        const last = Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.001) : wanted;
        const target = Math.min(last, wanted > 0 ? wanted : 0.001);
        try { el.currentTime = target; } catch {}
      };
      // loadeddata repaints the initial paused frame; seeked repaints after a
      // timeline scrub. Without these, a black canvas remained forever until
      // the user pressed Play because no React dependency changed on decode.
      el.addEventListener("loadedmetadata", primeFirstFrame);
      el.addEventListener("loadeddata", notifyFrame);
      el.addEventListener("seeked", notifyFrame);
      el.addEventListener("error", notifyError);
    }
    if (el.getAttribute("data-src") !== src) {
      // Local upload Blob URLs are same-origin and need no CORS mode. In
      // particular, avoiding a crossorigin fetch here sidesteps WebKit Blob
      // decoding failures while preserving anonymous CORS for remote clips.
      if (/^https?:/i.test(src)) el.crossOrigin = "anonymous";
      else el.removeAttribute("crossorigin");
      el.src = src;
      el.setAttribute("data-src", src);
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

  /** Seek to the exact source frame needed by offline export. */
  async seekExact(scene: Scene, sceneProgress: number, sceneDuration: number): Promise<void> {
    const el = this.get(scene);
    if (!el) return;
    if (el.readyState < 1) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        el.addEventListener("loadedmetadata", done, { once: true });
        el.addEventListener("error", done, { once: true });
        setTimeout(done, 200);
      });
    }
    const target = clipTimeForProgress(scene, sceneProgress, sceneDuration);
    if (Math.abs(el.currentTime - target) < 0.001 && el.readyState >= 2) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener("seeked", done);
        resolve();
      };
      el.addEventListener("seeked", done, { once: true });
      try { el.currentTime = target; } catch { done(); }
      setTimeout(done, 200);
    });
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

  /**
   * Keep only the clips around the active scene. Long projects can contain
   * dozens of source videos; retaining every decoder for the whole export is
   * an avoidable way to exhaust the browser's media/GPU process.
   */
  retain(sceneIds: Iterable<number>): void {
    const keep = new Set(sceneIds);
    for (const [id, el] of this.elements) {
      if (keep.has(id)) continue;
      // Delete first so late loadeddata/seeked events cannot repaint a scene
      // whose decoder has already been released.
      this.elements.delete(id);
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
        el.remove();
      } catch {}
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
    const elements = [...this.elements.values()];
    this.elements.clear();
    this.missingReported.clear();
    for (const el of elements) {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
        el.remove();
      } catch {}
    }
  }
}
