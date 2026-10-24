/**
 * Bounded waits for the last, invisible minutes of a render.
 *
 * THE FAILURE THIS EXISTS FOR: a render that has finished every frame can
 * still stop dead while the file is being finished, and nothing in the old
 * code put a limit on any of those waits:
 *
 *   - `VideoEncoder.flush()` / `AudioEncoder.flush()` — the browser's encoder
 *     is handed the last frames and asked to hand back the last chunks;
 *   - the OPFS disk drain (`RenderOutputStore.flush()`) — queued writes have
 *     to land before the container can be closed;
 *   - `RenderOutputStore.toBlob()` — the staging file is truncated, closed and
 *     turned into a File;
 *   - the Vault commit — the finished Blob is written into IndexedDB.
 *
 * Each of those is a browser-internal operation. When one of them wedges —
 * a hardware H.264 encoder that never comes back after the *previous* render,
 * a GPU-process reset, a disk that is full enough to stop acknowledging
 * writes, an IndexedDB transaction that never completes — the promise simply
 * never settles. The render screen then sits on "Package" at 95–99% for ever,
 * Cancel does nothing (the flag is only read between frames, and the frames
 * are all done), and closing the tab loses the whole encode. That is exactly
 * the reported symptom, and it is unacceptable for a paid product.
 *
 * So every one of those waits now has a deadline, a cancellation signal and a
 * named operation. A stall becomes a `RenderTimeoutError` with a sentence the
 * creator can act on, the job ends, and the screen is usable again.
 */

/** A wait that ran out of time. `operation` names what was being waited for. */
export class RenderTimeoutError extends Error {
  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(
      `The render stopped responding while ${operation} ` +
        `(nothing moved for ${formatGuardTime(timeoutMs)}). ` +
        `Every frame was encoded, but the browser never confirmed the finished file.`,
    );
    this.name = "RenderTimeoutError";
  }
}

/** The creator pressed Cancel (or the job was abandoned). */
export class RenderCancelledError extends Error {
  constructor(message = "Render cancelled") {
    super(message);
    this.name = "RenderCancelledError";
  }
}

/* ------------------------------------------------------------------ */
/* Budgets for the long videos this engine is built for (15 minutes)   */
/*                                                                     */
/* These are DEADLINES FOR STALLS, not performance targets. They are   */
/* deliberately several times longer than the work takes on a slow     */
/* machine, because the cost of the two mistakes is not symmetrical:   */
/* abandoning a healthy fifteen-minute render loses a paid customer's  */
/* work, while waiting a few extra minutes for a wedged one costs      */
/* nothing but patience.                                               */
/* ------------------------------------------------------------------ */

/** Fifteen minutes — the longest video the engine is required to finish. */
export const LONGFORM_SECONDS = 15 * 60;

/**
 * How long a render may go without any real progress before the watchdog
 * ends it.
 *
 * Every long phase reports where it has reached, or is bounded by its own
 * deadline (see the rule on `withProgressTicker`), so this only ever catches
 * work that has genuinely stopped: a photo decode that never returns, a clip
 * seek with no `seeked` event, a narration request that hangs. It is
 * deliberately several times longer than the longest legitimate pause in a
 * fifteen-minute render.
 */
export const RENDER_STALL_LIMIT_MS = 6 * 60 * 1000;

/** Reading the finished file back to verify it. */
export const EXPORT_VALIDATION_TIMEOUT_MS = 60_000;

/**
 * How long the offline audio mix (the whole soundtrack, appraised frame by
 * frame for visualiser telemetry) may take.
 *
 * A nine- to fifteen-minute soundtrack has to be rendered through the full
 * mastering chain, with a suspend/resume round trip every third frame for the
 * audio-reactive visuals. That is minutes of real work on a slow machine, so
 * the budget is half of realtime plus a minute, floored at three minutes. It
 * is a stall detector — nothing healthy should ever reach it.
 */
export function audioMixTimeoutMs(durationSec: number): number {
  const seconds = Math.max(0, Number(durationSec) || 0);
  return Math.round(Math.max(180_000, 60_000 + seconds * 500));
}

/**
 * How long the finished file may take to be committed to the Vault, given its
 * size. Mirrors `vaultRequestTimeoutMs()` in render-vault.ts (which is the
 * inner deadline) with a margin, so the inner timeout reports first.
 */
export function vaultCommitTimeoutMs(bytes: number): number {
  const size = Math.max(0, Number(bytes) || 0);
  const writeMs = (size / (8 * 1024 * 1024)) * 1000;
  return Math.round(Math.min(25 * 60 * 1000, 120_000 + writeMs));
}

/** "45s", "2m 05s" — used in stage text and timeout messages. */
export function formatGuardTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Resolve exactly like `promise`, but give up after `timeoutMs`.
 *
 * The original promise keeps its handlers attached after the deadline, so a
 * late rejection can never surface as an unhandled rejection — the failure has
 * already been reported to the caller, which is what closes the job.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  const limit = Math.max(1, timeoutMs);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new RenderTimeoutError(operation, limit));
    }, limit);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface EncoderDrainOptions {
  /** Current encoder queue depth (`VideoEncoder.encodeQueueSize`). */
  queueSize: () => number;
  /** Depth that is safe to keep encoding at. */
  limit: number;
  /** What the encoder is being asked to do, phrased for a sentence. */
  operation: string;
  /** How long the queue may sit completely still before it is called wedged. */
  stallMs?: number;
  /** Hand the browser a turn. */
  yieldTo: () => Promise<void>;
  /** Surface an error the encoder reported through its `error` callback. */
  throwIfFailed?: () => void;
  /** True once the creator has cancelled. */
  isCancelled?: () => boolean;
  /** Injectable clock (tests). */
  now?: () => number;
}

/** How long an encoder queue may be stuck at the same depth before we give up. */
export const DEFAULT_ENCODER_STALL_MS = 60_000;

/**
 * Wait for an encoder's queue to fall below `limit`.
 *
 * The old loop was `while (queueSize > limit) { throwIfFailed(); await
 * yieldToBrowser(); }`. It waited for ever if the encoder stopped draining
 * without reporting an error — a real state for a hardware encoder whose GPU
 * process has gone away. This version watches the queue depth: while it is
 * falling the encoder is working and we keep waiting; if it has not moved at
 * all for `stallMs`, the encoder is declared wedged and the render fails with
 * a message that names it.
 *
 * Returns the number of turns yielded (useful in tests).
 */
export async function drainEncoderQueue(options: EncoderDrainOptions): Promise<number> {
  const stallMs = Math.max(1, options.stallMs ?? DEFAULT_ENCODER_STALL_MS);
  const now = options.now ?? (() => (typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now()));

  let depth = options.queueSize();
  let lastDepth = depth;
  let lastChange = now();
  let turns = 0;

  while (depth > options.limit) {
    if (options.isCancelled?.()) throw new RenderCancelledError();
    options.throwIfFailed?.();

    depth = options.queueSize();
    if (depth !== lastDepth) {
      lastDepth = depth;
      lastChange = now();
    } else if (now() - lastChange >= stallMs) {
      throw new RenderTimeoutError(options.operation, stallMs);
    }

    await options.yieldTo();
    turns += 1;
  }

  return turns;
}

/**
 * Runs `task` while republishing `label` every second with the time elapsed.
 *
 * A frozen bar with no words is indistinguishable from a crash. If the
 * browser is genuinely slow rather than stuck, the creator can see it is still
 * counting; if it is stuck, the deadline in the caller turns it into an error.
 *
 * THE ONE RULE: the republished text only keeps the stall watchdog quiet when
 * the caller passes `heartbeat` — and a caller may only do that when the same
 * wait also has its own explicit deadline. A phase that can hang must never be
 * able to look alive for ever; one that is bounded (and merely slow on a long
 * video) must never be killed by the watchdog for being slow.
 */
export async function withProgressTicker<T>(
  label: string,
  task: () => Promise<T>,
  publish: (text: string) => void,
  options?: {
    tickMs?: number;
    now?: () => number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    /**
     * Called on every tick, for a phase that is bounded by its own deadline
     * (see the rule above). Omit it for anything that could genuinely hang.
     */
    heartbeat?: () => void;
  },
): Promise<T> {
  const interval = Math.max(200, options?.tickMs ?? 1000);
  const now = options?.now ?? (() => Date.now());
  const start = now();
  const set = options?.setInterval ?? setInterval;
  const clear = options?.clearInterval ?? clearInterval;
  const timer = set(() => {
    try {
      // The wait is bounded elsewhere, so it is safe to say it is alive.
      options?.heartbeat?.();
      publish(`${label} (${formatGuardTime(now() - start)} elapsed…)`);
    } catch {
      /* a ticker must never break the render */
    }
  }, interval);
  try {
    return await task();
  } finally {
    try {
      clear(timer);
    } catch {}
  }
}
