import { formatMs, RenderTimer } from "../src/lib/render-timing";

/* ------------------------------------------------------------------ *
 * The render's own stopwatch.
 *
 * It exists to answer two questions that cannot be answered from a fast
 * machine: what share of a long render the per-frame audio suspensions
 * actually cost, and whether a render still runs at full speed once the tab
 * is in the background.
 *
 * The clock and the visibility probe are both injectable, so the awkward
 * cases — a tab hidden before the render started, hidden across a stage
 * boundary, still hidden at the end — can be pinned down without waiting
 * around for real time to pass.
 * ------------------------------------------------------------------ */

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const close = (actual: number, expected: number, label: string) => {
  checks++;
  if (Math.abs(actual - expected) > 1e-6) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};

/** A clock the test drives by hand. */
const clock = () => {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

/* ---- stages are measured, and add up to the total ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });

  timer.stage("encoder setup");
  c.advance(500);
  timer.stage("audio render + telemetry");
  c.advance(90_000);
  timer.stage("video frames");
  c.advance(300_000);
  timer.stage("finalise container");
  c.advance(9_500);
  timer.stop();

  const s = timer.summary();
  close(s.totalMs, 400_000, "total is wall clock from construction to stop");
  equal(s.stages.length, 4, "four stages recorded");
  equal(s.stages[0].name, "encoder setup", "stages keep the order they ran in");
  close(s.stages[1].ms, 90_000, "audio stage duration");
  close(s.stages[2].ms, 300_000, "frame stage duration");

  const summed = s.stages.reduce((n, st) => n + st.ms, 0);
  close(summed, s.totalMs, "stages account for the whole render, with nothing unattributed");

  close(s.stages[2].pct, 75, "the frame loop is three quarters of this render");
}

/* ---- the question the timer exists to answer ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("audio render + telemetry");
  c.advance(240_000);
  timer.stage("video frames");
  c.advance(360_000);
  timer.stop();

  const audio = timer.summary().stages.find((s) => s.name === "audio render + telemetry");
  checks++;
  if (!audio) throw new Error("audio stage missing");
  close(audio.pct, 40, "a stage taking 40% of the render is reported as 40%");
}

/* ---- re-entering a stage accumulates rather than overwrites ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("video frames");
  c.advance(100);
  timer.stage("audio encode");
  c.advance(50);
  timer.stage("video frames");
  c.advance(25);
  timer.stop();

  const s = timer.summary();
  equal(s.stages.length, 2, "a revisited stage is not listed twice");
  close(s.stages[0].ms, 125, "time in a revisited stage is added up");
}

/* ---- background time: the claim that hidden tabs no longer crawl ---- */
{
  const c = clock();
  let hidden = false;
  const timer = new RenderTimer({ now: c.now, isHidden: () => hidden });

  timer.stage("video frames");
  c.advance(10_000);
  hidden = true;
  // No document in Node, so the listener never fires; stop() still has to
  // account for the stretch that was hidden when the clock stopped.
  c.advance(30_000);
  timer.stop();

  const s = timer.summary();
  close(s.totalMs, 40_000, "total covers both stretches");
  equal(s.hiddenMs, 0, "without a document there is no visibility event to observe");
}

/* ---- hidden from the very start is noticed, not missed ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => true });
  timer.stage("video frames");
  c.advance(60_000);
  timer.stop();

  close(timer.summary().hiddenMs, 60_000, "a render begun in a background tab is fully counted");
}

/* ---- notes ride along with the timings ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("video frames");
  c.advance(1000);
  timer.note("video", "540s at 30fps (16200 frames), 1920x1080");
  timer.note("file", "612 MB MP4");
  timer.stop();

  const s = timer.summary();
  equal(s.notes.file, "612 MB MP4", "notes survive into the summary");
  checks++;
  if (!timer.format().includes("612 MB MP4")) throw new Error("notes missing from the report");
}

/* ---- stop() is idempotent, so a retry path cannot skew the total ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("video frames");
  c.advance(5000);
  timer.stop();
  c.advance(60_000);
  timer.stop();

  close(timer.summary().totalMs, 5000, "a second stop() does not extend the render");
}

/* ---- summary() before stop() reports the render so far ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("video frames");
  c.advance(7000);
  close(timer.summary().totalMs, 7000, "a running timer can be read mid-render");
}

/* ---- the report is readable at the sizes that actually occur ---- */
{
  equal(formatMs(420), "420ms", "sub-second");
  equal(formatMs(9_500), "9.5s", "seconds");
  equal(formatMs(90_000), "1m 30s", "minutes and seconds");
  equal(formatMs(3_600_000), "60m 0s", "an hour, which is what a hidden tab used to cost");
  equal(formatMs(119_999), "2m 0s", "rounding up seconds does not print 1m 60s");
  equal(formatMs(-1), "—", "nonsense is not formatted as a duration");
}

/* ---- the whole block holds together ---- */
{
  const c = clock();
  const timer = new RenderTimer({ now: c.now, isHidden: () => false });
  timer.stage("audio render + telemetry");
  c.advance(120_000);
  timer.stage("video frames");
  c.advance(280_000);
  timer.stop();
  const text = timer.format();

  checks++;
  if (!text.startsWith("Render timing")) throw new Error("report has no heading");
  checks++;
  if (!text.includes("TOTAL")) throw new Error("report has no total");
  checks++;
  if (!/audio render \+ telemetry\s+2m 0s\s+30\.0%/.test(text)) {
    throw new Error(`stage row not formatted as expected:\n${text}`);
  }
}

console.log(`PASS render-timing: ${checks} checks, 0 failed`);
