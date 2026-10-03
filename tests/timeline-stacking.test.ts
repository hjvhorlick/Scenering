/* ------------------------------------------------------------------ *
 * Timeline stacking.
 *
 * The bug this suite pins down: every block was drawn on its lane's centre
 * line, so a full-length music bed painted straight over the stickers and
 * visualisers underneath it. The timeline claimed to hold one effect when it
 * held four, and there was no way to click the hidden ones.
 *
 * The fix packs blocks into sub-rows. What matters, and what is checked here:
 *
 *   1. Nothing overlaps. Any two blocks that would collide on screen end up
 *      on different rows — measured in PIXELS, because a 0.2s effect is still
 *      drawn 26px wide and two such effects can miss each other in time while
 *      sitting on top of each other on screen.
 *   2. It stays compact. Blocks that do not collide keep sharing row 0, so a
 *      sparse timeline is exactly as tall as it was before the change.
 *   3. It never runs away. A busy lane hits a ceiling and thins its rows out
 *      instead of growing the timeline — but rows always physically fit, so a
 *      block is never clipped away to nothing.
 * ------------------------------------------------------------------ */
import {
  IDEAL_ROW_H_COMPACT,
  IDEAL_ROW_H_EXPANDED,
  MAX_LANE_H_COMPACT,
  MAX_LANE_H_EXPANDED,
  MIN_ROW_H,
  ROW_GAP,
  ROW_LABEL_MIN_H,
  laneMetrics,
  packLane,
  type BlockGeometry,
} from "../src/lib/timeline-stacking";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const eq = h.eq;

/* A block as the timeline draws it: id, left edge, drawn width. */
type Box = { id: string; left: number; width: number };
const geo = (b: Box): BlockGeometry => ({ left: b.left, width: b.width });
const box = (id: string, left: number, width: number): Box => ({ id, left, width });

/** px rectangles overlap (touching edges do not count as overlapping). */
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width;

/** Nothing may share a row with something it collides with. */
function assertNoCollisions(boxes: Box[], label: string) {
  const { placement } = packLane(boxes, geo);
  let clashes = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const sameRow = placement.get(boxes[i].id) === placement.get(boxes[j].id);
      if (sameRow && overlaps(boxes[i], boxes[j])) clashes++;
    }
  }
  eq(clashes, 0, `${label}: no two blocks on the same row overlap`);
}

/* ------------------------------------------------------------------ *
 * 1. the original bug: a full-length bed over short effects
 * ------------------------------------------------------------------ */
{
  // 60s video at 12px/s: music runs the whole way, three effects sit under it.
  const music = box("music", 0, 720);
  const sticker = box("sticker", 120, 60);
  const cta = box("cta", 300, 90);
  const logo = box("logo", 0, 720);
  const lane = [music, sticker, cta, logo];

  const { placement, rows } = packLane(lane, geo);
  assertNoCollisions(lane, "bed over short effects");

  ok(rows >= 3, "a bed, a second bed and the effects beneath them need at least three rows");
  ok(
    placement.get("music") !== placement.get("sticker"),
    "a sticker under the music bed is no longer painted over"
  );
  ok(
    placement.get("music") !== placement.get("logo"),
    "two full-length items never share a row"
  );
  ok(
    new Set([...placement.values()]).size === rows,
    "every row the lane reserves is actually used"
  );
}

/* ------------------------------------------------------------------ *
 * 2. compactness: no overlap, no extra height
 * ------------------------------------------------------------------ */
{
  const spread = [box("a", 0, 50), box("b", 60, 50), box("c", 200, 40), box("d", 400, 120)];
  const { rows } = packLane(spread, geo);
  eq(rows, 1, "effects that do not collide all stay on one row");
  eq(
    laneMetrics(rows, 34, IDEAL_ROW_H_COMPACT, MAX_LANE_H_COMPACT).height,
    34,
    "a single-row lane keeps its original compact height"
  );
  eq(
    laneMetrics(1, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED).height,
    40,
    "an expanded single-row lane is unchanged too"
  );
  eq(packLane([], geo).rows, 1, "an empty lane still reports one row, never zero");
}

{
  // Touching, not overlapping — but drawn flush they read as one long block,
  // so the packer leaves a gutter and pushes the second one down.
  const flush = [box("a", 0, 100), box("b", 100, 100)];
  const { rows } = packLane(flush, geo);
  eq(rows, 2, "blocks drawn flush against each other are separated, not merged");

  const clear = [box("a", 0, 100), box("b", 104, 100)];
  eq(packLane(clear, geo).rows, 1, "a few px of daylight is enough to share a row");
}

/* ------------------------------------------------------------------ *
 * 3. pixels, not seconds
 * ------------------------------------------------------------------ */
{
  // Two 0.2s effects 1s apart at 2px/s: 2px apart in time, both drawn 26px
  // wide. Packing on time would stack them on top of each other.
  const tinyA = box("tiny-a", 0, 26);
  const tinyB = box("tiny-b", 2, 26);
  eq(packLane([tinyA, tinyB], geo).rows, 2, "minimum-width blocks are separated on their drawn size");
  assertNoCollisions([tinyA, tinyB], "sub-second effects");

  // Zooming in spreads them apart, and the stack collapses on its own.
  const zoomedA = box("tiny-a", 0, 26);
  const zoomedB = box("tiny-b", 200, 26);
  eq(packLane([zoomedA, zoomedB], geo).rows, 1, "zooming in lets the same two effects share a row again");
}

/* ------------------------------------------------------------------ *
 * 4. ordering is stable and left-to-right
 * ------------------------------------------------------------------ */
{
  const shuffled = [box("c", 400, 100), box("a", 0, 100), box("b", 200, 100)];
  const forward = packLane(shuffled, geo);
  const reversed = packLane([...shuffled].reverse(), geo);
  for (const b of shuffled) {
    eq(
      forward.placement.get(b.id),
      reversed.placement.get(b.id),
      `${b.id} lands on the same row whatever order the inserts arrive in`
    );
  }

  // The wider of two blocks starting together takes the upper row, so long
  // beds settle at the top and short effects read beneath them.
  const tie = [box("short", 0, 40), box("bed", 0, 600)];
  const { placement } = packLane(tie, geo);
  ok(
    (placement.get("bed") ?? 0) < (placement.get("short") ?? 0),
    "when two blocks start together the longer one takes the higher row"
  );
}

/* ------------------------------------------------------------------ *
 * 5. lane heights: grow a little, then thin out
 * ------------------------------------------------------------------ */
{
  const two = laneMetrics(2, 34, IDEAL_ROW_H_COMPACT, MAX_LANE_H_COMPACT);
  ok(two.height > 34, "a second row grows the lane");
  ok(two.height <= MAX_LANE_H_COMPACT, "two rows stay under the compact ceiling");
  ok(two.rowH >= ROW_LABEL_MIN_H, "two rows are still tall enough to show their titles");

  for (const rows of [1, 2, 3, 4, 6, 8, 12, 20]) {
    const compact = laneMetrics(rows, 34, IDEAL_ROW_H_COMPACT, MAX_LANE_H_COMPACT);
    const expanded = laneMetrics(rows, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED);
    for (const [name, m, base] of [
      ["compact", compact, 34],
      ["expanded", expanded, 40],
    ] as const) {
      ok(m.rowH >= MIN_ROW_H, `${name} ${rows} rows: a row never thins past the ${MIN_ROW_H}px floor`);
      if (rows === 1) {
        // One row is the old centred block: it owns the whole lane.
        eq(m.rowH, m.height, `${name}: a lone block still owns the full lane height`);
      } else {
        ok(
          rows * m.rowH + ROW_GAP * 2 <= m.height + 0.001,
          `${name} ${rows} rows: every row physically fits inside the lane`
        );
      }
      ok(m.height >= base, `${name} ${rows} rows: the lane never shrinks below its base height`);
    }
  }
}

{
  // The ceiling is what keeps the timeline from turning into a wall: six
  // overlapping effects — a bed, a visualiser, a logo and three stickers —
  // cost no more height than the ceiling allows.
  const busy = laneMetrics(6, 34, IDEAL_ROW_H_COMPACT, MAX_LANE_H_COMPACT);
  eq(busy.height, MAX_LANE_H_COMPACT, "six stacked effects stop exactly at the compact ceiling");
  ok(busy.rowH < ROW_LABEL_MIN_H, "past the ceiling rows drop their labels and become colour chips");
  ok(busy.rowH >= MIN_ROW_H, "...but stay thick enough to see and click");
  eq(
    laneMetrics(9, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED).height,
    MAX_LANE_H_EXPANDED,
    "nine stacked effects still fit the expanded ceiling"
  );

  // Only an absurd pile-up pushes past the ceiling, and then by the minimum
  // needed — hiding a block is never the answer.
  const absurd = laneMetrics(12, 34, IDEAL_ROW_H_COMPACT, MAX_LANE_H_COMPACT);
  eq(
    absurd.height,
    12 * MIN_ROW_H + ROW_GAP * 2,
    "beyond the ceiling the lane grows by the bare minimum rather than hiding anything"
  );

  const mild = laneMetrics(3, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED);
  ok(mild.rowH >= ROW_LABEL_MIN_H, "three expanded rows still carry their labels");

  // Heights grow monotonically, never jump backwards as rows pile up.
  let previous = 0;
  for (let rows = 1; rows <= 24; rows++) {
    const m = laneMetrics(rows, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED);
    ok(m.height >= previous, `${rows} rows: lane height never jumps backwards`);
    previous = m.height;
  }
}

/* ------------------------------------------------------------------ *
 * 6. a realistic busy lane survives intact
 * ------------------------------------------------------------------ */
{
  const lane: Box[] = [
    box("bed", 0, 1200),
    box("visualiser", 0, 1200),
    box("logo", 0, 1200),
    box("intro-sticker", 20, 70),
    box("cta", 300, 150),
    box("caption-card", 320, 90),
    box("whoosh", 600, 26),
    box("whoosh-2", 610, 26),
    box("outro-sticker", 1100, 80),
  ];
  assertNoCollisions(lane, "a full project lane");

  const { placement, rows } = packLane(lane, geo);
  eq(placement.size, lane.length, "every insert is placed exactly once");
  const metrics = laneMetrics(rows, 40, IDEAL_ROW_H_EXPANDED, MAX_LANE_H_EXPANDED);
  ok(metrics.height <= MAX_LANE_H_EXPANDED, "even a full lane respects the expanded ceiling");
  ok(
    rows * metrics.rowH + ROW_GAP * 2 <= metrics.height + 0.001,
    "every block in a full lane is drawn inside the lane"
  );
}

/* ------------------------------------------------------------------ *
 * 7. editing happens at the timeline, not in the catalogue
 *
 * The flow the app now promises: the catalogue only ADDS a feature, adding
 * selects it, and the selected block's Edit button is the prominent control
 * under the timeline. These read the source — the same zero-dependency
 * approach as the other UI suites.
 * ------------------------------------------------------------------ */
{
  const read = (relative: string) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", relative), "utf8");

  const timeline = read("src/components/Timeline.tsx");
  const studio = read("src/components/VideoStudio.tsx");
  const app = read("src/App.tsx");

  // the catalogue cards lost their Edit button
  ok(!studio.includes("handleConfigure"), "Video Studio cards no longer open an editor before placing");
  ok(!studio.includes("onConfigureItem"), "the catalogue's configure hook is gone, not just unused");
  ok(!/Icon glyph="\u2699" \/> Edit/.test(studio), "no Edit button is left on a Video Studio card");
  ok(studio.includes("w-full px-3 py-2"), "Add is now the card's single full-width action");
  ok(!app.includes("onConfigureItem={openInsertEditor}\n                    customerLogo"), "App stops passing the removed prop to VideoStudio");

  // adding still selects, so the Edit button appears immediately
  ok(
    /const handleAddInsert[\s\S]{0,1200}setSelectedInsert\(insert\);\n  \};/.test(app),
    "adding an insert selects it, so its Edit button shows up under the timeline"
  );

  // the timeline's Edit button is the loud one now
  const selectionBar = timeline.slice(timeline.indexOf("Selected: {selectedInsert.title}"));
  ok(
    selectionBar.includes("Edit this effect"),
    "the timeline's Edit button says what it edits"
  );
  ok(
    !selectionBar.slice(0, selectionBar.indexOf("Edit this effect")).includes("t-card-cta-ghost"),
    "the timeline's Edit button is no longer a ghost button"
  );
  ok(
    /t-card-cta[^"]*bg-yellow-400[^"]*font-extrabold/.test(selectionBar),
    "the timeline's Edit button is a solid, bold primary CTA"
  );
  ok(
    /ring-2 ring-yellow-400\/40/.test(selectionBar) && /shadow-lg shadow-yellow-500\/30/.test(selectionBar),
    "the timeline's Edit button carries a ring and shadow so it reads as the main action"
  );

  // blocks are drawn on their packed row, not all on the centre line
  ok(timeline.includes('from "../lib/timeline-stacking"'), "Timeline draws from the shared stacking logic");
  ok(timeline.includes("packLane(overlayInserts"), "the compact overlay lane is packed");
  ok(timeline.includes("packLane(visualInserts") && timeline.includes("packLane(soundInserts"), "both expanded lanes are packed");
  ok(
    !/top-1\/2 -translate-y-1\/2 \$\{compact \? "h-6" : "h-7"\}/.test(timeline),
    "effect blocks no longer pile onto a single fixed centre line"
  );
  ok(
    timeline.includes("height: overlayLane.height") &&
      timeline.includes("height: visualLane.height") &&
      timeline.includes("height: soundLane.height"),
    "each lane sizes itself from the rows it actually needs"
  );
  ok(timeline.includes("showLabel"), "thin rows fall back to an icon-only chip");
}

h.done("timeline-stacking");
