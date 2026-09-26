/**
 * Frame pacing for the video export.
 *
 * The renderer records the canvas in real time (`canvas.captureStream(fps)`),
 * so the *smoothness of the exported video* is exactly the smoothness of the
 * paint schedule. The previous loop armed a `setTimeout(1000/fps)` next to
 * every `requestAnimationFrame` and let whichever fired first win — at 60fps
 * that is a 16ms timer racing a 16.7ms vsync, so the effective paint interval
 * wobbled between ~16ms and ~40ms. captureStream sampled that jitter straight
 * into the file: the Ken Burns motion read as choppy, jumping instead of
 * gliding, and on some machines was close to invisible.
 *
 * This ticker fixes the pacing with three layers:
 *
 *   1. VISIBLE TAB — `requestAnimationFrame` only, i.e. exactly the display's
 *      vsync cadence. No timer ever pre-empts it.
 *   2. HIDDEN TAB — rAF stops firing entirely, and chained page timers get
 *      clamped to ~1Hz by the browser. A tiny inline Web Worker (whose timers
 *      are not visibility-throttled) ticks at the true frame interval instead,
 *      so a backgrounded render stays smooth.
 *   3. WATCHDOG — if neither fires for a few frames (broken rAF, blocked
 *      worker), a slow safety timer keeps frames flowing. Anything beats a
 *      frozen recording.
 *
 * Duplicate fires within 70% of a frame interval are dropped, so the
 * visible→hidden handover can never double-paint.
 */

export interface FrameTicker {
  /** Start (or restart) ticking at `fps`. */
  start(fps: number): void;
  /** Stop completely and release the worker. */
  stop(): void;
  /** True while the ticker is running. */
  readonly running: boolean;
}

const WORKER_SOURCE = `
let timer = null;
self.onmessage = (e) => {
  if (timer) { clearInterval(timer); timer = null; }
  const interval = e.data && e.data.interval;
  if (typeof interval === "number" && interval > 0) {
    timer = setInterval(() => self.postMessage(0), interval);
  }
};
`;

export function createFrameTicker(onFrame: () => void): FrameTicker {
  let running = false;
  let interval = 1000 / 60;
  let rafId = 0;
  let watchdogId: ReturnType<typeof setTimeout> | null = null;
  let worker: Worker | null = null;
  let workerUrl: string | null = null;
  let lastFrameAt = 0;
  let onVisibilityChange: (() => void) | null = null;

  const now = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  /** Drop re-entrant fires that arrive sooner than 70% of a frame. */
  const fire = () => {
    const t = now();
    const hold = Math.max(4, interval * 0.7);
    if (t - lastFrameAt < hold) return;
    lastFrameAt = t;
    try {
      onFrame();
    } catch (err) {
      // A render error must not kill the ticker — the caller's own frame
      // handler already catches its drawing errors.
      console.warn("frame ticker callback error:", err);
    }
  };

  const killWorker = () => {
    if (worker) {
      try {
        worker.terminate();
      } catch {}
      worker = null;
    }
    if (workerUrl) {
      try {
        URL.revokeObjectURL(workerUrl);
      } catch {}
      workerUrl = null;
    }
  };

  const ensureWorker = (): boolean => {
    if (worker) return true;
    if (typeof Worker === "undefined" || typeof URL?.createObjectURL !== "function") return false;
    try {
      const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      worker.onmessage = () => fire();
      worker.onerror = () => killWorker();
      worker.postMessage({ interval });
      return true;
    } catch {
      killWorker();
      return false;
    }
  };

  const clearWatchdog = () => {
    if (watchdogId !== null) {
      clearTimeout(watchdogId);
      watchdogId = null;
    }
  };

  const pump = () => {
    if (!running) return;
    clearWatchdog();

    const hidden =
      typeof document !== "undefined" && document.visibilityState === "hidden";

    if (hidden) {
      // rAF will not fire while hidden — drive from the worker ticker.
      if (rafId && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (ensureWorker()) return;
      // Worker unavailable: a plain timer is throttled by the browser in
      // background tabs, but a stalled render is still worse than a slow one.
      watchdogId = setTimeout(() => {
        if (!running) return;
        fire();
        pump();
      }, interval);
      return;
    }

    killWorker();

    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!running) return;
        fire();
        pump();
      });
      // Watchdog: rAF starved while nominally visible → keep frames coming.
      watchdogId = setTimeout(() => {
        if (!running) return;
        if (now() - lastFrameAt >= interval) {
          if (rafId && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
          fire();
          pump();
        } else {
          clearWatchdog();
          watchdogId = null;
          pump();
        }
      }, Math.max(80, interval * 3));
      return;
    }

    // No rAF at all (headless / test environment): steady timer chain.
    watchdogId = setTimeout(() => {
      if (!running) return;
      fire();
      pump();
    }, interval);
  };

  const api = {
    start(fps: number) {
      const next = Math.max(5, 1000 / Math.max(1, fps || 60));
      if (running) {
        // Already running — just retune the interval in place.
        if (Math.abs(next - interval) > 0.01) {
          interval = next;
          if (worker) worker.postMessage({ interval });
        }
        return;
      }
      interval = next;
      running = true;
      lastFrameAt = 0;
      if (typeof document !== "undefined" && !onVisibilityChange) {
        onVisibilityChange = () => pump();
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      pump();
    },
    stop() {
      running = false;
      if (rafId && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      clearWatchdog();
      killWorker();
      if (onVisibilityChange && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        onVisibilityChange = null;
      }
    },
    get running() {
      return running;
    },
  };

  return api;
}
