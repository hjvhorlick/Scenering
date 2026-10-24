/**
 * Render guard suite — the deadlines that stop a finished-but-unpackaged
 * render from hanging for ever (src/lib/render-guard.ts).
 *
 * The reported failure: a second render run immediately after a first one
 * encoded every frame, then sat on "Package" at 95–99% with no error, no
 * working Cancel and no Vault file. Every wait in that stretch was unbounded.
 * These checks pin the behaviour that replaces them.
 */
import { createHarness } from "./harness";
import {
  DEFAULT_ENCODER_STALL_MS,
  RenderCancelledError,
  RenderTimeoutError,
  drainEncoderQueue,
  formatGuardTime,
  withProgressTicker,
  withTimeout,
} from "../src/lib/render-guard";
import {
  QueuedRandomAccessStore,
  type RandomAccessWriter,
} from "../src/lib/render-output-store";

const t = createHarness();

/* A promise that never settles — a wedged browser operation. */
const never = <T,>() => new Promise<T>(() => {});
const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ---------------- withTimeout ---------------- */

{
  const value = await withTimeout(Promise.resolve(42), 1000, "a fast operation");
  t.eq(value, 42, "a fast wait passes its value straight through");
}

{
  let caught: unknown = null;
  try {
    await withTimeout(Promise.reject(new Error("disk said no")), 1000, "a failing operation");
  } catch (error) {
    caught = error;
  }
  t.eq((caught as Error)?.message, "disk said no", "a real failure keeps its own error, not a timeout");
}

{
  let caught: unknown = null;
  const started = Date.now();
  try {
    await withTimeout(never<void>(), 40, "the video encoder finished the last of its frames");
  } catch (error) {
    caught = error;
  }
  const elapsed = Date.now() - started;
  t.ok(caught instanceof RenderTimeoutError, "a wedged wait fails with RenderTimeoutError");
  t.eq((caught as RenderTimeoutError)?.name, "RenderTimeoutError", "the error is identifiable by name");
  t.eq(
    (caught as RenderTimeoutError)?.operation,
    "the video encoder finished the last of its frames",
    "the timeout names the operation that stalled",
  );
  t.ok(/video encoder/.test((caught as Error).message), "the message says what stopped responding");
  t.ok(/stopped responding/i.test((caught as Error).message), "the message is a sentence, not an error code");
  t.ok(elapsed >= 35 && elapsed < 1000, "the deadline fires promptly instead of waiting for ever");
}

{
  // A wait that times out and LATER rejects must not surface as an unhandled
  // rejection: Node would terminate the process on one.
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);
  const late = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("too late")), 60);
  });
  await withTimeout(late, 20, "a late failure").catch(() => {});
  await tick(120);
  process.off("unhandledRejection", onUnhandled);
  t.eq(unhandled, 0, "a late rejection after the deadline is swallowed, never unhandled");
}

/* ---------------- encoder queue draining ---------------- */

{
  const depths = [9, 8, 7, 6, 5];
  let index = 0;
  const turns = await drainEncoderQueue({
    queueSize: () => depths[Math.min(index, depths.length - 1)],
    limit: 6,
    operation: "the video encoder accepted the frames it was given",
    yieldTo: async () => {
      index += 1;
    },
  });
  t.ok(turns > 0, "a queue above the limit yields until it drains");
  t.eq(depths[Math.min(index, depths.length - 1)] <= 6, true, "the drain returns only once the queue is safe");
}

{
  let caught: unknown = null;
  try {
    await drainEncoderQueue({
      queueSize: () => 99,
      limit: 6,
      operation: "the video encoder accepted the frames it was given",
      isCancelled: () => true,
      yieldTo: async () => {},
    });
  } catch (error) {
    caught = error;
  }
  t.ok(caught instanceof RenderCancelledError, "Cancel stops a queue wait immediately");
  t.eq((caught as Error)?.message, "Render cancelled", "cancellation keeps the message the render screen understands");
}

{
  // The queue never moves: this is the wedged hardware encoder. It must fail
  // after the stall window, not loop for ever.
  let clock = 0;
  let caught: unknown = null;
  try {
    await drainEncoderQueue({
      queueSize: () => 10,
      limit: 6,
      operation: "the video encoder accepted the frames it was given",
      stallMs: 1000,
      now: () => clock,
      yieldTo: async () => {
        clock += 400;
      },
    });
  } catch (error) {
    caught = error;
  }
  t.ok(caught instanceof RenderTimeoutError, "a queue that never drains is declared wedged");
  t.ok(/video encoder/.test((caught as Error).message), "the stall is attributed to the encoder");
}

{
  // A queue that keeps moving — slowly — is NOT a stall: long renders must
  // never be killed for being long.
  let clock = 0;
  let depth = 40;
  let caught: unknown = null;
  try {
    await drainEncoderQueue({
      queueSize: () => depth,
      limit: 6,
      operation: "the video encoder accepted the frames it was given",
      stallMs: 1000,
      now: () => clock,
      yieldTo: async () => {
        clock += 700;
        depth -= 1;
      },
    });
  } catch (error) {
    caught = error;
  }
  t.eq(caught, null, "a slowly draining encoder is never mistaken for a stalled one");
}

{
  let surfaced = false;
  let caught: unknown = null;
  try {
    await drainEncoderQueue({
      queueSize: () => 10,
      limit: 6,
      operation: "the video encoder accepted the frames it was given",
      throwIfFailed: () => {
        surfaced = true;
        throw new Error("encoder reported an error");
      },
      yieldTo: async () => {},
    });
  } catch (error) {
    caught = error;
  }
  t.ok(surfaced, "an encoder-reported error is checked on every turn");
  t.eq((caught as Error)?.message, "encoder reported an error", "the encoder's own error is the one reported");
}

t.eq(DEFAULT_ENCODER_STALL_MS, 60_000, "the encoder stall window is a minute, not a frame or two");

/* ---------------- stage ticker ---------------- */

{
  const published: string[] = [];
  let clock = 0;
  let timers = 0;
  let cleared = 0;
  const result = await withProgressTicker(
    "4/4: Finalising the container…",
    async () => "done",
    (text) => published.push(text),
    {
      tickMs: 200,
      now: () => clock,
      setInterval: ((fn: () => void) => {
        timers += 1;
        clock += 5000;
        fn();
        clock += 65000;
        fn();
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
      clearInterval: (() => {
        cleared += 1;
      }) as unknown as typeof clearInterval,
    },
  );
  t.eq(result, "done", "the ticker returns the task's own result");
  t.eq(timers, 1, "one interval drives the ticker");
  t.eq(cleared, 1, "the interval is always cleared, even on the happy path");
  t.ok(published.length === 2, "the stage text is republished while the task runs");
  t.ok(/elapsed/.test(published[0]), "the republished text counts the time spent");
  t.ok(/1m 10s/.test(published[1]), "the counter shows minutes once the wait is long");
}

/* ---------------- formatGuardTime ---------------- */

t.eq(formatGuardTime(0), "0s", "zero formats as seconds");
t.eq(formatGuardTime(45_000), "45s", "seconds stay seconds");
t.eq(formatGuardTime(65_000), "1m 05s", "minutes are padded");
t.eq(formatGuardTime(120_000), "2m 00s", "exact minutes read cleanly");

/* ---------------- the failure this all exists for ---------------- */

{
  // An OPFS writer whose close() never resolves: the exact "finished file
  // never handed over" state. The store alone would wait for ever; the guard
  // is what turns it into a reportable failure.
  const stuck: RandomAccessWriter = {
    write: async () => {},
    truncate: async () => {},
    close: () => never<void>(),
  };
  const store = new QueuedRandomAccessStore(
    stuck,
    () => never<Blob>(),
    async () => {},
  );
  store.write(new Uint8Array([1, 2, 3]), 0);

  let caught: unknown = null;
  try {
    await withTimeout(store.toBlob("video/mp4"), 40, "the finished file was handed back to the renderer");
  } catch (error) {
    caught = error;
  }
  t.ok(caught instanceof RenderTimeoutError, "a store that never closes can no longer hang the render");
  t.ok(/handed back/.test((caught as Error).message), "the report names the hand-over step");
}

t.done("render-guard");
