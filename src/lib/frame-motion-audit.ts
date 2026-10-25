/**
 * Watches the frames a render actually paints and reports whether the picture
 * is really moving.
 *
 * The renderer draws each frame from the timeline and hands it straight to the
 * encoder, so the only place a "jagged" export can come from is the pixels
 * themselves. A camera that is supposed to glide but paints an identical frame
 * three times in a row, then jumps, is not a playback problem — it is a
 * picture problem, and nothing else in the pipeline can see it.
 *
 * Each sampled frame is reduced to a 32×18 copy of the canvas and compared
 * with the sample before it. A picture that is genuinely moving never repeats
 * byte-for-byte, even at a slow Ken Burns, because the resampled pixels drift
 * by fractions. An identical signature therefore means the same picture was
 * painted twice, and a run of them is a freeze.
 *
 * The cost is one small `drawImage` and a 2 KB read per sampled frame — a few
 * tenths of a millisecond, sampled a handful of times a second — so it can run
 * during a fifteen-minute render without being the reason it is slow.
 */

const SIGNATURE_WIDTH = 32;
const SIGNATURE_HEIGHT = 18;

export interface MotionAuditReport {
  /** Whether the audit could run at all (it needs a canvas). */
  available: boolean;
  /** Frames between samples. */
  sampleEvery: number;
  /** How many frames were compared. */
  sampled: number;
  /** Samples identical to the one before them — a held picture. */
  repeated: number;
  /** Longest run of identical samples, in frames (and seconds at the render's rate). */
  longestRunFrames: number;
  longestRunSec: number;
  /** Average per-pixel change between samples, 0–255. Small but non-zero means slow motion. */
  averageChange: number;
  /** Smallest change seen between two samples, 0–255. */
  smallestChange: number;
  /** One line for the render report. */
  summary: string;
}

export class FrameMotionAudit {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private previous: Uint8ClampedArray | null = null;
  private sampled = 0;
  private repeated = 0;
  private run = 0;
  private longestRun = 0;
  private changeSum = 0;
  private smallestChange = Infinity;
  private readonly sampleEvery: number;

  constructor(private readonly fps: number) {
    this.sampleEvery = Math.max(1, Math.round(fps / 6)); // six samples a second
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        this.canvas = new OffscreenCanvas(SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
      } else if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = SIGNATURE_WIDTH;
        canvas.height = SIGNATURE_HEIGHT;
        this.canvas = canvas;
      }
      if (this.canvas) {
        this.context = this.canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      }
    } catch {
      this.canvas = null;
      this.context = null;
    }
  }

  /** Sample a painted frame. Call with every frame index; it throttles itself. */
  sample(frameIndex: number, source: HTMLCanvasElement | OffscreenCanvas): void {
    if (!this.context || !this.canvas) return;
    if (frameIndex % this.sampleEvery !== 0) return;
    try {
      this.context.imageSmoothingEnabled = true;
      this.context.imageSmoothingQuality = "low";
      this.context.drawImage(source as CanvasImageSource, 0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
      const pixels = this.context.getImageData(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT).data;
      if (this.previous) {
        let sum = 0;
        let changed = false;
        for (let i = 0; i < pixels.length; i += 4) {
          const delta =
            Math.abs(pixels[i] - this.previous[i]) +
            Math.abs(pixels[i + 1] - this.previous[i + 1]) +
            Math.abs(pixels[i + 2] - this.previous[i + 2]);
          if (delta !== 0) changed = true;
          sum += delta / 3;
        }
        const change = sum / (pixels.length / 4);
        this.changeSum += change;
        if (change < this.smallestChange) this.smallestChange = change;
        if (!changed) {
          this.repeated += 1;
          this.run += 1;
          if (this.run > this.longestRun) this.longestRun = this.run;
        } else {
          this.run = 0;
        }
      }
      this.previous = new Uint8ClampedArray(pixels);
      this.sampled += 1;
    } catch {
      // A tainted or detached canvas stops the audit, never the render.
      this.canvas = null;
      this.context = null;
    }
  }

  get report(): MotionAuditReport {
    const available = Boolean(this.context);
    const compared = Math.max(0, this.sampled - 1);
    const longestRunFrames = this.longestRun * this.sampleEvery;
    const longestRunSec = this.fps > 0 ? longestRunFrames / this.fps : 0;
    const averageChange = compared > 0 ? Math.round((this.changeSum / compared) * 100) / 100 : 0;
    const smallestChange = Number.isFinite(this.smallestChange)
      ? Math.round(this.smallestChange * 100) / 100
      : 0;
    const summary = !available
      ? "Motion check unavailable in this browser"
      : compared === 0
      ? "Motion check: not enough frames to compare"
      : this.repeated === 0
      ? `Motion check: every sampled frame moved (${compared} compared)`
      : `Motion check: ${this.repeated} of ${compared} sampled frames held the previous picture (longest ${longestRunSec.toFixed(2)}s)`;
    return {
      available,
      sampleEvery: this.sampleEvery,
      sampled: this.sampled,
      repeated: this.repeated,
      longestRunFrames,
      longestRunSec,
      averageChange,
      smallestChange,
      summary,
    };
  }

  /**
   * The report as a sentence for a person deciding whether the file is
   * actually smooth: a held picture for more than a fifth of a second is
   * visible as a stutter, whatever the container says.
   */
  get verdict(): { ok: boolean; detail: string } {
    const report = this.report;
    if (!report.available || report.sampled < 3) {
      return { ok: true, detail: report.summary };
    }
    const frozenFraction = report.repeated / Math.max(1, report.sampled - 1);
    if (report.longestRunSec >= 0.2 || frozenFraction >= 0.25) {
      return {
        ok: false,
        detail: `${report.summary} — a held picture this long is what reads as stop-and-go motion.`,
      };
    }
    return { ok: true, detail: report.summary };
  }
}
