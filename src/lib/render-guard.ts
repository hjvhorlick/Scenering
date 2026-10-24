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
 * The republished text deliberately does NOT touch the progress heartbeat the
 * stall watchdog watches — otherwise the heartbeat would keep a stuck stage
 * looking alive for ever.
 */
export async function withProgressTicker<T>(
  label: string,
  task: () => Promise<T>,
  publish: (text: string) => void,
  options?: { tickMs?: number; now?: () => number; setInterval?: typeof setInterval; clearInterval?: typeof clearInterval },
): Promise<T> {
  const interval = Math.max(200, options?.tickMs ?? 1000);
  const now = options?.now ?? (() => Date.now());
  const start = now();
  const set = options?.setInterval ?? setInterval;
  const clear = options?.clearInterval ?? clearInterval;
  const timer = set(() => {
    try {
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
