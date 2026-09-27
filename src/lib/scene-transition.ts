import type { Scene, SceneTransitionType } from "../types";
import { drawSceneImage } from "./scene-framing";

export interface TransitionOption {
  id: "fade" | "slide" | "crossfade" | "none";
  label: string;
  icon: string;
  description: string;
}

export const TRANSITION_OPTIONS: TransitionOption[] = [
  {
    id: "fade",
    label: "Fade",
    icon: "🌘",
    description: "Dip to black transition between scenes",
  },
  {
    id: "slide",
    label: "Slide",
    icon: "➡️",
    description: "Slide in from the right edge between scenes",
  },
  {
    id: "crossfade",
    label: "Crossfade",
    icon: "✨",
    description: "Smooth dissolve blend between scenes",
  },
  {
    id: "none",
    label: "None",
    icon: "✂️",
    description: "Direct cut without transition effect",
  },
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

/**
 * Renders transition between outgoing previous scene and incoming current scene.
 * Returns true if a transition effect was rendered, or false if normal scene draw should proceed.
 */
export function drawSceneTransition(
  ctx: CanvasRenderingContext2D,
  currentScene: Scene,
  currentImg: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null,
  prevScene: Scene | null,
  prevImg: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null,
  elapsedInScene: number,
  sceneDuration: number,
  canvasW: number,
  canvasH: number,
  currentOpts?: TransitionFrameOptions,
  prevOpts?: TransitionFrameOptions
): boolean {
  const transitionType = currentScene.transition || "crossfade";
  if (transitionType === "none") {
    return false;
  }

  // The FIRST scene of the video has nothing to transition from. Running a
  // transition there meant fading the opening image up from black — a black
  // slide before the video "starts". The first image is shown immediately
  // instead, at full strength.
  if (!prevScene || !prevImg || prevImg.naturalWidth <= 0) {
    return false;
  }

  const transDuration = getTransitionDuration(sceneDuration);
  if (elapsedInScene >= transDuration) {
    return false;
  }

  const rawT = Math.max(0, Math.min(1, elapsedInScene / transDuration));
  // Smooth hermite ease for organic cinematic dissolve without linear midpoint dip
  const t = rawT * rawT * (3 - 2 * rawT);

  if (transitionType === "fade" || transitionType === "fade_black") {
    if (prevScene && prevImg && prevImg.naturalWidth > 0) {
      if (t < 0.5) {
        // First half: fade out previous scene into black
        drawSceneImage(ctx, prevImg, prevScene, canvasW, canvasH, prevOpts);
        const alpha = Math.min(1, t * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else {
        // Second half: fade in current scene from black
        if (currentImg && currentImg.naturalWidth > 0) {
          drawSceneImage(ctx, currentImg, currentScene, canvasW, canvasH, currentOpts);
        }
        const alpha = Math.max(0, (1 - t) * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
    } else {
      // No previous scene: fade in current scene from black
      if (currentImg && currentImg.naturalWidth > 0) {
        drawSceneImage(ctx, currentImg, currentScene, canvasW, canvasH, currentOpts);
      }
      const alpha = Math.max(0, 1 - t);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
    return true;
  }

  if (transitionType === "crossfade") {
    if (prevScene && prevImg && prevImg.naturalWidth > 0) {
      // Draw previous scene base
      drawSceneImage(ctx, prevImg, prevScene, canvasW, canvasH, prevOpts);
      // Crossfade current scene over it
      if (currentImg && currentImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = t;
        drawSceneImage(ctx, currentImg, currentScene, canvasW, canvasH, currentOpts);
        ctx.restore();
      }
    } else if (currentImg && currentImg.naturalWidth > 0) {
      // Fade in current scene if no previous scene
      ctx.save();
      ctx.globalAlpha = t;
      drawSceneImage(ctx, currentImg, currentScene, canvasW, canvasH, currentOpts);
      ctx.restore();
    }
    return true;
  }

  if (transitionType === "slide") {
    // Smooth ease: cubic ease-in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (prevScene && prevImg && prevImg.naturalWidth > 0) {
      // Slide previous scene out to left
      ctx.save();
      ctx.translate(-canvasW * ease, 0);
      drawSceneImage(ctx, prevImg, prevScene, canvasW, canvasH, prevOpts);
      ctx.restore();
    }

    if (currentImg && currentImg.naturalWidth > 0) {
      // Slide current scene in from right
      ctx.save();
      ctx.translate(canvasW * (1 - ease), 0);
      drawSceneImage(ctx, currentImg, currentScene, canvasW, canvasH, currentOpts);
      ctx.restore();
    }
    return true;
  }

  return false;
}
