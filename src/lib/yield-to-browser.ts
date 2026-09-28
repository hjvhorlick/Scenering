/**
 * Giving the browser a turn, without being throttled for it.
 *
 * A long render is a long loop, and a long loop has to hand control back
 * periodically or the tab stops painting and the window stops responding.
 * The obvious way to do that is `await new Promise(r => setTimeout(r, 0))`.
 *
 * That is a trap for anything that runs for minutes. Browsers clamp timers in
 * a background tab: once the tab is hidden, `setTimeout(…, 0)` is held to at
 * least one second, and Chrome's budget-based throttling can stretch it much
 * further than that. A nine-minute video is 16,200 frames; yielding with a
 * timer every fourth frame is 4,050 yields, which in a hidden tab is over an
 * hour of waiting on the clock alone. That is exactly the "it slows right
 * down if I move away from the page" symptom, and no amount of making the
 * render itself faster will fix it.
 *
 * A message posted through a `MessageChannel` is a task, not a timer. Tasks
 * are not clamped, so the loop keeps its pace whether or not the tab is in
 * front. This is the same trick React's scheduler uses, for the same reason.
 */

/** Ports are reused: making a MessageChannel per yield is its own slow leak. */
let channel: MessageChannel | null = null;
let queue: Array<() => void> = [];

function ensureChannel(): MessageChannel | null {
  if (typeof MessageChannel !== "function") return null;
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => {
      // Take the whole queue first: a resumed task may queue another yield,
      // and we do not want to run that one in this same drain.
      const due = queue;
      queue = [];
      for (const resume of due) resume();
    };
  }
  return channel;
}

/**
 * Hand control back to the browser for one task, then carry on.
 *
 * Not throttled when the tab is hidden, unlike a zero-delay timer.
 */
export function yieldToBrowser(): Promise<void> {
  const chan = ensureChannel();
  if (!chan) {
    // No MessageChannel (older worker scopes, some test environments). A
    // timer is the only option left; it is correct, just slower in the
    // background.
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return new Promise<void>((resolve) => {
    queue.push(resolve);
    chan.port2.postMessage(0);
  });
}

/**
 * A yield that only actually yields once the current run has had the thread
 * for long enough.
 *
 * Yielding on a fixed count — every fourth frame, every chunk — is the wrong
 * unit, because the work behind each step varies enormously: a 4K frame with
 * six overlays is not a 720p frame with none. Yielding on elapsed time keeps
 * the window responsive at a predictable cost, and stops short renders paying
 * for thousands of pointless round trips.
 *
 * Usage:
 *
 *   const budget = createFrameBudget();
 *   for (…) { …work…; await budget.maybeYield(); }
 */
export function createFrameBudget(sliceMs = 12) {
  let last = now();

  return {
    /** Yield only if this run has held the thread for longer than `sliceMs`. */
    async maybeYield(): Promise<void> {
      if (now() - last < sliceMs) return;
      await yieldToBrowser();
      last = now();
    },
    /** Yield no matter what — for stage boundaries. */
    async yieldNow(): Promise<void> {
      await yieldToBrowser();
      last = now();
    },
  };
}

function now(): number {
  return typeof performance === "object" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
