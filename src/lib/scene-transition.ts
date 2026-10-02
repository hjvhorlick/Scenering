import type { Scene, SceneTransitionType } from "../types";
import { drawSceneImage } from "./scene-framing";

/**
 * Scene-to-scene transitions.
 *
 * Every transition is a pure function of one number: `t`, how far through the
 * transition the current frame is. Nothing here keeps state, so the preview
 * and the exporter — which drive the same code at different frame rates and
 * from different clocks — always agree on what frame 0.3s into a scene looks
 * like.
 *
 * Families:
 *  - dissolves (fade to black/white, crossfade, blur dissolve)
 *  - pushes    both images travel together, like a filmstrip advancing
 *  - covers    the new image slides in over a stationary old one
 *  - wipes     the new image is revealed by an edge sweeping across
 *  - shapes    the new image is revealed through a growing hole (iris, blinds)
 *  - dynamics  zoom and whip pan, which also blur or scale
 */

/** The family a transition belongs to, used to group the picker UI. */
export type TransitionGroup =
  | "Dissolve"
  | "Push"
  | "Cover"
  | "Wipe"
  | "Reveal"
  | "Dynamic"
  | "Cut";

export interface TransitionOption {
  id: SceneTransitionType;
  label: string;
  icon: string;
  group: TransitionGroup;
  description: string;
}

export const TRANSITION_OPTIONS: TransitionOption[] = [
  // ---------------------------------------------------------- Dissolve
  {
    id: "crossfade",
    label: "Crossfade",
    icon: "✨",
    group: "Dissolve",
    description: "Smooth dissolve blend between scenes",
  },
  {
    id: "fade",
    label: "Fade",
    icon: "🌘",
    group: "Dissolve",
    description: "Dip to black transition between scenes",
  },
  {
    id: "fade_white",
    label: "Fade White",
    icon: "🌕",
    group: "Dissolve",
    description: "Dip through a white flash between scenes",
  },
  {
    id: "dissolve_blur",
    label: "Blur Dissolve",
    icon: "🌫️",
    group: "Dissolve",
    description: "Soften both scenes and dissolve between them",
  },
  // ---------------------------------------------------------- Push
  {
    id: "slide",
    label: "Slide",
    icon: "⬅️",
    group: "Push",
    description: "Slide in from the right edge between scenes, both scenes travelling left",
  },
  {
    id: "push_right",
    label: "Push Right",
    icon: "➡️",
    group: "Push",
    description: "Both scenes travel right together, the new one leading",
  },
  {
    id: "push_up",
    label: "Push Up",
    icon: "⬆️",
    group: "Push",
    description: "Both scenes travel upward, the new one following the old",
  },
  {
    id: "push_down",
    label: "Push Down",
    icon: "⬇️",
    group: "Push",
    description: "Both scenes travel downward, the new one following the old",
  },
  // ---------------------------------------------------------- Cover
  {
    id: "cover_left",
    label: "Cover Left",
    icon: "◀️",
    group: "Cover",
    description: "New scene slides in from the right over the old one",
  },
  {
    id: "cover_right",
    label: "Cover Right",
    icon: "▶️",
    group: "Cover",
    description: "New scene slides in from the left over the old one",
  },
  {
    id: "cover_up",
    label: "Cover Up",
    icon: "🔼",
    group: "Cover",
    description: "New scene slides up from the bottom over the old one",
  },
  {
    id: "cover_down",
    label: "Cover Down",
    icon: "🔽",
    group: "Cover",
    description: "New scene slides down from the top over the old one",
  },
  // ---------------------------------------------------------- Wipe
  {
    id: "wipe_left",
    label: "Wipe Left",
    icon: "⬅",
    group: "Wipe",
    description: "A hard edge sweeps leftward, revealing the new scene",
  },
  {
    id: "wipe_right",
    label: "Wipe Right",
    icon: "➡",
    group: "Wipe",
    description: "A hard edge sweeps rightward, revealing the new scene",
  },
  {
    id: "wipe_up",
    label: "Wipe Up",
    icon: "⬆",
    group: "Wipe",
    description: "A hard edge sweeps upward, revealing the new scene",
  },
  {
    id: "wipe_down",
    label: "Wipe Down",
    icon: "⬇",
    group: "Wipe",
    description: "A hard edge sweeps downward, revealing the new scene",
  },
  // ---------------------------------------------------------- Reveal
  {
    id: "iris",
    label: "Iris",
    icon: "⭕",
    group: "Reveal",
    description: "The new scene opens out from the centre of the frame",
  },
  {
    id: "blinds",
    label: "Blinds",
    icon: "🪟",
    group: "Reveal",
    description: "Horizontal slats open to reveal the new scene",
  },
  // ---------------------------------------------------------- Dynamic
  {
    id: "zoom",
    label: "Zoom In",
    icon: "🔍",
    group: "Dynamic",
    description: "The new scene rushes forward into the frame",
  },
  {
    id: "zoom_out",
    label: "Zoom Out",
    icon: "🔎",
    group: "Dynamic",
    description: "The old scene pulls away to reveal the new one",
  },
  {
    id: "whip_pan",
    label: "Whip Pan",
    icon: "💨",
    group: "Dynamic",
    description: "A fast blurred swing from one scene to the next",
  },
  // ---------------------------------------------------------- Cut
  {
    id: "none",
    label: "None",
    icon: "✂️",
    group: "Cut",
    description: "Direct cut without transition effect",
  },
];

/** Every transition id the renderer knows how to draw. */
export const TRANSITION_IDS: SceneTransitionType[] = TRANSITION_OPTIONS.map((o) => o.id);

/** The options of one family, in picker order. */
export function transitionsInGroup(group: TransitionGroup): TransitionOption[] {
  return TRANSITION_OPTIONS.filter((o) => o.group === group);
}

/** Family labels in the order the picker shows them. */
export const TRANSITION_GROUPS: TransitionGroup[] = [
  "Dissolve",
  "Push",
  "Cover",
  "Wipe",
  "Reveal",
  "Dynamic",
  "Cut",
];

/**
 * Calculates transition duration in seconds based on total scene duration.
 * Keeps transition snappy (typically 0.5s - 0.75s) and avoids taking up too much of short scenes.
 */
export function getTransitionDuration(sceneDuration: number = 20): number {
  return Math.max(0.2, Math.min(0.75, sceneDuration * 0.25));
}

export interface TransitionFrameOptions {
  motionScale?: number;
  motionDx?: number;
  motionDy?: number;
  filter?: string;
}

type Img = (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null;

/** Smooth hermite ease — no linear midpoint dip on a dissolve. */
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Cubic ease-in-out, for anything that physically moves. */
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const usable = (img: Img): boolean => Boolean(img && img.naturalWidth > 0);

/** The scene's own colour grade with an extra blur stacked on top. */
function withBlur(opts: TransitionFrameOptions | undefined, px: number): TransitionFrameOptions {
  const base = opts || {};
  if (!(px > 0.25)) return base;
  const grade = base.filter && base.filter !== "none" ? base.filter : "";
  return { ...base, filter: `${grade} blur(${px.toFixed(1)}px)`.trim() };
}

/**
 * Renders transition between outgoing previous scene and incoming current scene.
 * Returns true if a transition effect was rendered, or false if normal scene draw should proceed.
 */
export function drawSceneTransition(
  ctx: CanvasRenderingContext2D,
  currentScene: Scene,
  currentImg: Img,
  prevScene: Scene | null,
  prevImg: Img,
  elapsedInScene: number,
  sceneDuration: number,
  canvasW: number,
  canvasH: number,
  currentOpts?: TransitionFrameOptions,
  prevOpts?: TransitionFrameOptions
): boolean {
  const transitionType: SceneTransitionType = currentScene.transition || "crossfade";
  if (transitionType === "none") return false;

  // The FIRST scene of the video has nothing to transition from. Running a
  // transition there meant fading the opening image up from black — a black
  // slide before the video "starts". The first image is shown immediately
  // instead, at full strength.
  if (!prevScene || !usable(prevImg)) return false;

  const transDuration = getTransitionDuration(sceneDuration);
  if (elapsedInScene >= transDuration) return false;

  const rawT = Math.max(0, Math.min(1, elapsedInScene / transDuration));
  const t = smooth(rawT);
  const ease = easeInOut(rawT);

  // Local draw helpers: `prev` and `cur` always paint a full frame, so each
  // transition below is only about *where* and *how much* of each is drawn.
  const prev = (opts: TransitionFrameOptions | undefined = prevOpts) => {
    if (usable(prevImg)) drawSceneImage(ctx, prevImg!, prevScene, canvasW, canvasH, opts);
  };
  const cur = (opts: TransitionFrameOptions | undefined = currentOpts) => {
    if (usable(currentImg)) drawSceneImage(ctx, currentImg!, currentScene, canvasW, canvasH, opts);
  };

  const translated = (dx: number, dy: number, draw: () => void) => {
    ctx.save();
    ctx.translate(dx, dy);
    draw();
    ctx.restore();
  };

  const clipped = (x: number, y: number, w: number, h: number, draw: () => void) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    draw();
    ctx.restore();
  };

  const faded = (alpha: number, draw: () => void) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    draw();
    ctx.restore();
  };

  const veil = (colour: string, alpha: number) => {
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(${colour}, ${Math.min(1, alpha)})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  };

  switch (transitionType) {
    // ------------------------------------------------------------ Dissolve
    case "fade":
    case "fade_black":
    case "fade_white": {
      // Two halves: the old image sinks into the colour, the new one rises
      // back out of it. Drawing both at once would show a ghost of each.
      const colour = transitionType === "fade_white" ? "255, 255, 255" : "0, 0, 0";
      if (t < 0.5) {
        prev();
        veil(colour, t * 2);
      } else {
        cur();
        veil(colour, (1 - t) * 2);
      }
      return true;
    }

    case "crossfade": {
      prev();
      faded(t, () => cur());
      return true;
    }

    case "dissolve_blur": {
      // Both sides soften towards the midpoint, so the cut lands while the
      // frame is least legible — the join is invisible.
      const MAX_BLUR = 18;
      prev(withBlur(prevOpts, MAX_BLUR * t));
      faded(t, () => cur(withBlur(currentOpts, MAX_BLUR * (1 - t))));
      return true;
    }

    // ---------------------------------------------------------------- Push
    case "slide": // Push Left — kept under its original id so saved projects still work.
    case "push_right":
    case "push_up":
    case "push_down": {
      const dx =
        transitionType === "slide" ? -canvasW : transitionType === "push_right" ? canvasW : 0;
      const dy =
        transitionType === "push_up" ? -canvasH : transitionType === "push_down" ? canvasH : 0;
      translated(dx * ease, dy * ease, () => prev());
      // The incoming frame sits exactly one frame-width/height behind the
      // outgoing one, so no gap can ever open between them.
      translated(dx * (ease - 1), dy * (ease - 1), () => cur());
      return true;
    }

    // --------------------------------------------------------------- Cover
    case "cover_left":
    case "cover_right":
    case "cover_up":
    case "cover_down": {
      prev();
      const fromX =
        transitionType === "cover_left" ? canvasW : transitionType === "cover_right" ? -canvasW : 0;
      const fromY =
        transitionType === "cover_up" ? canvasH : transitionType === "cover_down" ? -canvasH : 0;
      translated(fromX * (1 - ease), fromY * (1 - ease), () => cur());
      return true;
    }

    // ---------------------------------------------------------------- Wipe
    case "wipe_left":
    case "wipe_right":
    case "wipe_up":
    case "wipe_down": {
      prev();
      const horizontal = transitionType === "wipe_left" || transitionType === "wipe_right";
      const revealW = horizontal ? canvasW * ease : canvasW;
      const revealH = horizontal ? canvasH : canvasH * ease;
      const x = transitionType === "wipe_left" ? canvasW - revealW : 0;
      const y = transitionType === "wipe_up" ? canvasH - revealH : 0;
      clipped(x, y, revealW, revealH, () => cur());
      return true;
    }

    // -------------------------------------------------------------- Reveal
    case "iris": {
      prev();
      // Corner-to-centre distance: the circle must clear the corners by the
      // end or the last few frames would still show a ring of the old scene.
      const maxR = Math.hypot(canvasW, canvasH) / 2;
      const r = Math.max(0, maxR * ease);
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, r, 0, Math.PI * 2);
      ctx.clip();
      cur();
      ctx.restore();
      return true;
    }

    case "blinds": {
      prev();
      const SLATS = 8;
      const slatH = canvasH / SLATS;
      for (let i = 0; i < SLATS; i++) {
        clipped(0, i * slatH, canvasW, slatH * ease, () => cur());
      }
      return true;
    }

    // ------------------------------------------------------------- Dynamic
    case "zoom": {
      // The new scene rushes in: it starts larger than the frame and settles.
      prev();
      const scale = 1 + 0.35 * (1 - ease);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-canvasW / 2, -canvasH / 2);
      cur();
      ctx.restore();
      return true;
    }

    case "zoom_out": {
      // The mirror image: the old scene pulls away and thins out over the new.
      cur();
      const scale = 1 + 0.5 * ease;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-canvasW / 2, -canvasH / 2);
      prev();
      ctx.restore();
      return true;
    }

    case "whip_pan": {
      // Motion blur peaks mid-swing and is gone at both ends, so the frames
      // either side of the transition stay perfectly sharp.
      const blur = 26 * Math.sin(Math.PI * rawT);
      translated(-canvasW * ease, 0, () => prev(withBlur(prevOpts, blur)));
      translated(canvasW * (1 - ease), 0, () => cur(withBlur(currentOpts, blur)));
      return true;
    }

    default:
      // An unknown id (an older project, a hand-edited save) cuts cleanly
      // rather than dropping the frame entirely.
      return false;
  }
}
