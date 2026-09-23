import { useEffect, useRef } from "react";
import type { SectionConfig } from "../data/intro-outro";
import { renderSection } from "../lib/render-section";
import { startPreviewLoop } from "../lib/preview-loop";

interface Props {
  config: SectionConfig;
  width?: number;
  height?: number;
  className?: string;
  /** loop the section timeline continuously (default) */
  playing?: boolean;
  /** freeze at this progress instead of animating */
  staticProgress?: number;
  /** reset the loop to 0 whenever this value changes */
  restartKey?: string | number;
  onProgress?: (p: number) => void;
}

export default function SectionPreviewCanvas({
  config,
  width = 640,
  height = 360,
  className = "",
  playing = true,
  staticProgress,
  restartKey,
  onProgress,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startRef = useRef<number>(performance.now());
  const stateRef = useRef({ config, playing, staticProgress, onProgress });
  stateRef.current = { config, playing, staticProgress, onProgress };

  useEffect(() => {
    startRef.current = performance.now();
  }, [restartKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (now: number) => {
      const { config: cfg, playing: isPlaying, staticProgress: sp, onProgress: cb } = stateRef.current;
      const dur = Math.max(0.5, cfg.duration || 4);

      let t: number;
      let p: number;
      if (sp !== undefined) {
        p = Math.max(0, Math.min(1, sp));
        t = p * dur;
      } else if (isPlaying) {
        // hold on the finished frame for a beat, then loop
        const cycle = dur + 1.1;
        const elapsed = ((now - startRef.current) / 1000) % cycle;
        t = Math.min(elapsed, dur);
        p = t / dur;
      } else {
        p = 1;
        t = dur;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        renderSection(ctx, cfg, canvas.width, canvas.height, t, p);
      } catch {
        /* never let a bad frame kill the loop */
      }
      cb?.(p);
    };

    // ~30fps is plenty for a preview; also stops painting while off-screen
    return startPreviewLoop(canvas, draw, { fps: 30 });
  }, [width, height]);

  return <canvas ref={canvasRef} className={className} />;
}
