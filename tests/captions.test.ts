import { createHarness, createStubContext } from "./harness";
import {
  parseEdgeWordBoundaries,
  alignWordTimings,
  activeWordIndexAt,
  alignedWordTimingsCached,
} from "../src/lib/word-sync";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../src/lib/render-captions";

/**
 * Word-level caption ↔ voice sync.
 *
 * The karaoke highlight used to be driven by a syllable-weight estimate of
 * when each word is spoken, which ran ahead of and lagged behind the real
 * voice. It is now driven by the TTS engine's own word boundaries, aligned
 * onto the caption words. These checks pin the alignment maths down.
 */
const h = createHarness();

// ------------------------------------------------- Edge metadata parsing
const FRAME = (words: [string, number, number][]) =>
  JSON.stringify({
    Metadata: words.map(([text, offset, duration]) => ({
      Type: "WordBoundary",
      Data: {
        Offset: Math.round(offset * 1e7),
        Duration: Math.round(duration * 1e7),
        text: { Text: text, Length: text.length, BoundaryType: "WordBoundary" },
      },
    })),
  });

const parsed = parseEdgeWordBoundaries([
  FRAME([
    ["The", 0.05, 0.12],
    ["sunrise", 0.18, 0.34],
  ]),
  // A session-end frame must be ignored, not crash the parser.
  JSON.stringify({ Metadata: [{ Type: "SessionEnd", Data: {} }] }),
  // Neither must a truncated frame.
  "{not json",
]);
h.eq(parsed.length, 2, "two word boundaries parsed");
h.near(parsed[0].start, 0.05, 1e-6, "offset converted from 100ns ticks to seconds");
h.near(parsed[0].end, 0.17, 1e-6, "end = start + duration");
h.near(parsed[1].start, 0.18, 1e-6, "second word start");
h.eq(parseEdgeWordBoundaries([]).length, 0, "no frames → no words");

// Legacy string form of the text field.
const legacy = parseEdgeWordBoundaries([
  JSON.stringify({
    Metadata: [{ Type: "WordBoundary", Data: { Offset: 1e7, Duration: 5e6, text: "hello" } }],
  }),
]);
h.eq(legacy.length, 1, "legacy text-as-string shape parsed");
h.near(legacy[0].start, 1.0, 1e-6, "legacy offset in seconds");

// ------------------------------------------------- alignment: exact words
const words = "THE SUNRISE PAINTED THE MOUNTAINS".split(" ");
const timings = [
  { text: "The", start: 0.05, end: 0.17 },
  { text: "sunrise", start: 0.18, end: 0.52 },
  { text: "painted", start: 0.53, end: 0.91 },
  { text: "the", start: 0.92, end: 1.0 },
  { text: "mountains", start: 1.01, end: 1.62 },
];
const aligned = alignWordTimings(words, timings);
h.eq(aligned.length, words.length, "one slot per caption word");
for (let i = 0; i < aligned.length; i++) {
  h.ok(aligned[i] !== null, `word ${i} aligned`);
  h.ok((aligned[i] as any).start <= (aligned[i] as any).end + 1e-9, `word ${i} not backwards`);
  if (i > 0) {
    h.ok(
      (aligned[i] as any).start >= (aligned[i - 1] as any)!.start - 1e-9,
      `word ${i} starts no earlier than word ${i - 1}`
    );
  }
}
h.near((aligned[1] as any).start, 0.18, 1e-6, "SUNRISE lights up when spoken");
h.near((aligned[4] as any).start, 1.01, 1e-6, "MOUNTAINS lights up when spoken");

// ------------------------------------------- alignment: sanitizer drift
// "3:16" is spoken as "chapter three verse sixteen"; the caption word must
// span all four spoken words.
const citation = alignWordTimings(["READ", "3:16", "TODAY"], [
  { text: "Read", start: 0.0, end: 0.3 },
  { text: "chapter", start: 0.32, end: 0.6 },
  { text: "three", start: 0.61, end: 0.8 },
  { text: "verse", start: 0.81, end: 1.0 },
  { text: "sixteen", start: 1.01, end: 1.4 },
  { text: "today", start: 1.5, end: 1.8 },
]);
h.near((citation[1] as any).start, 0.32, 1e-6, "citation starts when its expansion starts");
h.near((citation[1] as any).end, 1.4, 1e-6, "citation stays lit through the whole expansion");
h.near((citation[2] as any).start, 1.5, 1e-6, "word after the citation is still exact");

// Contraction: "don't" spoken as "do not".
const contraction = alignWordTimings(["DON'T", "PANIC"], [
  { text: "do", start: 0.1, end: 0.25 },
  { text: "not", start: 0.26, end: 0.45 },
  { text: "panic", start: 0.5, end: 0.9 },
]);
h.near((contraction[0] as any).start, 0.1, 1e-6, "contraction spans its expansion");
h.near((contraction[0] as any).end, 0.45, 1e-6, "contraction ends when its expansion ends");

// ------------------------------------------------- alignment: degenerate
h.eq(alignWordTimings([], timings).length, 0, "no caption words → empty");
const noTimings = alignWordTimings(words, []);
h.ok(noTimings.every((a) => a === null), "no timings → all null (caller falls back)");

// More caption words than spoken ones: the tail spreads forward in order.
const tail = alignWordTimings(["A", "B", "C", "D"], [
  { text: "a", start: 0.0, end: 0.2 },
  { text: "b", start: 0.2, end: 0.4 },
]);
h.ok(tail[2] !== null && tail[3] !== null, "trailing words still get a slot");
h.ok(
  (tail[2] as any).start <= (tail[3] as any).start,
  "trailing words light up in order, never together"
);

// ------------------------------------------------- active word selection
const slots = [
  { start: 0.1, end: 0.3 },
  { start: 0.4, end: 0.8 },
  { start: 0.9, end: 1.2 },
];
h.eq(activeWordIndexAt(slots, 0), 0, "before the first word → first word active");
h.eq(activeWordIndexAt(slots, 0.15), 0, "inside word 0");
h.eq(activeWordIndexAt(slots, 0.35), 0, "in the gap after word 0 → stays lit");
h.eq(activeWordIndexAt(slots, 0.5), 1, "inside word 1");
h.eq(activeWordIndexAt(slots, 1.0), 2, "inside word 2");
h.eq(activeWordIndexAt(slots, 5), 2, "after the speech → last word");
h.eq(activeWordIndexAt(slots, NaN), 0, "NaN time does not throw");
h.eq(activeWordIndexAt([], 1), 0, "no slots → 0");

// The cache returns the same slots for the same timings.
const cached1 = alignedWordTimingsCached(words, timings);
const cached2 = alignedWordTimingsCached(words, timings);
h.eq(cached1.length, aligned.length, "cached alignment has the same length");
h.eq(cached1[1], cached2[1], "cached alignment returns the identical slot object");

// ------------------------------------------- renderCanvasCaptions + sync
// With real timings the highlight follows the audio clock; without them the
// estimate is used. Both paths must draw without throwing (the stub context
// throws on any non-finite argument).
const drawWith = (sync?: any) => {
  const { ctx } = createStubContext();
  renderCanvasCaptions(
    ctx,
    "The sunrise painted the mountains in gold",
    0.5,
    { ...DEFAULT_CAPTIONS_CONFIG, enabled: true, mode: "karaoke" },
    1920,
    1080,
    sync
  );
  return ctx;
};

let threw = false;
try {
  drawWith({ wordTimings: timings, audioTimeSec: 0.6 });
  drawWith({ wordTimings: [], audioTimeSec: 0.6 });
  drawWith(undefined);
  drawWith({ wordTimings: timings }); // missing audioTimeSec → estimate
} catch (err) {
  threw = true;
  console.log("  render threw:", err);
}
h.ok(!threw, "captions render with and without sync data");

// The voice-locked path must actually land on the spoken word: at t=1.2 the
// word "mountains" is being spoken, so the highlight colour must have been
// painted after the base colour (i.e. the active word is the second one).
const karaokeFillsAt = (t: number) => {
  const { ctx, opsWithArgs } = createStubContext(1920, 1080);
  renderCanvasCaptions(
    ctx,
    "Sunrise mountains",
    0.99,
    {
      ...DEFAULT_CAPTIONS_CONFIG,
      enabled: true,
      mode: "karaoke",
      highlightColor: "#7DD3FC",
      textColor: "#FFFFFF",
    },
    1920,
    1080,
    {
      wordTimings: [
        { text: "Sunrise", start: 0.0, end: 0.5 },
        { text: "mountains", start: 1.0, end: 1.6 },
      ],
      audioTimeSec: t,
    }
  );
  return opsWithArgs.filter((o) => o.startsWith("set:fillStyle="));
};

// Early: the first word is active → the highlight is drawn exactly once
// (the active word) while the rest use the base/preview colours.
const earlyFills = karaokeFillsAt(0.2);
h.eq(earlyFills.filter((f) => f === "set:fillStyle=#7DD3FC").length, 1, "early: exactly one highlighted word (the first)");

// Late: the second word is active → still exactly one highlight.
const lateFills = karaokeFillsAt(1.2);
h.eq(lateFills.filter((f) => f === "set:fillStyle=#7DD3FC").length, 1, "late: exactly one highlighted word (the second)");

h.done("captions word-sync");
