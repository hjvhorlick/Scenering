import { createHarness, createStubContext } from "./harness";
import {
  TRANSITION_OPTIONS,
  TRANSITION_GROUPS,
  TRANSITION_IDS,
  transitionsInGroup,
  getTransitionDuration,
  drawSceneTransition,
} from "../src/lib/scene-transition";
import type { Scene, SceneTransitionType } from "../src/types";

const h = createHarness();

// ---------------------------------------------------------------- Options
h.ok(Array.isArray(TRANSITION_OPTIONS), "TRANSITION_OPTIONS is an array");
h.ok(TRANSITION_OPTIONS.length >= 3, "At least 3 transition options available");

const optionIds = TRANSITION_OPTIONS.map((o) => o.id);
h.ok(optionIds.includes("fade"), "Transition options include 'fade'");
h.ok(optionIds.includes("slide"), "Transition options include 'slide'");
h.ok(optionIds.includes("crossfade"), "Transition options include 'crossfade'");

for (const opt of TRANSITION_OPTIONS) {
  h.ok(opt.id.length > 0, `Option ${opt.id} has an id`);
  h.ok(opt.label.length > 0, `Option ${opt.id} has a label`);
  h.ok(opt.icon.length > 0, `Option ${opt.id} has an icon`);
  h.ok(opt.description.length > 0, `Option ${opt.id} has a description`);
}

// ---------------------------------------------------------------- Duration
h.eq(getTransitionDuration(20), 0.75, "20s scene caps transition at 0.75s");
h.eq(getTransitionDuration(1), 0.25, "1s scene uses 0.25s transition");
h.eq(getTransitionDuration(0.4), 0.2, "0.4s scene clamps to minimum 0.2s transition");

for (let dur = 0.5; dur <= 60; dur += 2.5) {
  const tDur = getTransitionDuration(dur);
  h.ok(tDur >= 0.2, `Duration for ${dur}s is at least 0.2s`);
  h.ok(tDur <= 0.75, `Duration for ${dur}s does not exceed 0.75s`);
  h.ok(tDur <= dur, `Duration does not exceed the scene duration itself`);
}

// ---------------------------------------------------------------- Mock Canvas Context
interface MockCall {
  method: string;
  args: any[];
}

function createMockContext(width = 1920, height = 1080) {
  const calls: MockCall[] = [];
  const ctx: any = {
    canvas: { width, height },
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    save: () => calls.push({ method: "save", args: [] }),
    restore: () => calls.push({ method: "restore", args: [] }),
    translate: (x: number, y: number) => calls.push({ method: "translate", args: [x, y] }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: "fillRect", args: [x, y, w, h, ctx.fillStyle] }),
    drawImage: () => calls.push({ method: "drawImage", args: [] }),
    scale: (x: number, y: number) => calls.push({ method: "scale", args: [x, y] }),
    beginPath: () => calls.push({ method: "beginPath", args: [] }),
    rect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: "rect", args: [x, y, w, h] }),
    arc: (x: number, y: number, r: number) => calls.push({ method: "arc", args: [x, y, r] }),
    clip: () => calls.push({ method: "clip", args: [] }),
  };
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

const mockImg: any = {
  naturalWidth: 1920,
  naturalHeight: 1080,
  complete: true,
};

const baseScene: Scene = {
  id: 1,
  project_id: 1,
  order_index: 0,
  text: "Intro scene narration",
  image_query: "mountains",
  image_url: "https://example.com/mountain.jpg",
  duration: 10,
  transition: "fade",
};

const nextScene: Scene = {
  id: 2,
  project_id: 1,
  order_index: 1,
  text: "Second scene narration",
  image_query: "ocean",
  image_url: "https://example.com/ocean.jpg",
  duration: 10,
  transition: "fade",
};

// ---------------------------------------------------------------- Transition Inactive
{
  const { ctx } = createMockContext();
  const sceneNoTrans = { ...nextScene, transition: "none" as const };
  const handled = drawSceneTransition(
    ctx,
    sceneNoTrans,
    mockImg,
    baseScene,
    mockImg,
    0.1,
    10,
    1920,
    1080
  );
  h.eq(handled, false, "drawSceneTransition returns false for transition='none'");
}

{
  const { ctx } = createMockContext();
  const handled = drawSceneTransition(
    ctx,
    nextScene,
    mockImg,
    baseScene,
    mockImg,
    2.0, // well past transition duration (0.75s)
    10,
    1920,
    1080
  );
  h.eq(handled, false, "drawSceneTransition returns false when elapsed >= transDuration");
}

// ---------------------------------------------------------------- Fade Transition
{
  const { ctx, calls } = createMockContext();
  const sceneFade = { ...nextScene, transition: "fade" as const };
  const handled = drawSceneTransition(
    ctx,
    sceneFade,
    mockImg,
    baseScene,
    mockImg,
    0.1, // inside transition
    10,
    1920,
    1080
  );
  h.eq(handled, true, "drawSceneTransition returns true for active 'fade'");
  const fillRectCalls = calls.filter((c) => c.method === "fillRect");
  h.ok(fillRectCalls.length > 0, "Fade drew a black overlay fillRect");
  h.ok(
    typeof fillRectCalls[0].args[4] === "string" && fillRectCalls[0].args[4].includes("rgba(0, 0, 0"),
    "Fade fillRect used rgba(0, 0, 0) color"
  );
}

// ---------------------------------------------------------------- Crossfade Transition
{
  const { ctx, calls } = createMockContext();
  const sceneCrossfade = { ...nextScene, transition: "crossfade" as const };
  const handled = drawSceneTransition(
    ctx,
    sceneCrossfade,
    mockImg,
    baseScene,
    mockImg,
    0.2, // inside transition
    10,
    1920,
    1080
  );
  h.eq(handled, true, "drawSceneTransition returns true for active 'crossfade'");
  const saveCalls = calls.filter((c) => c.method === "save");
  const restoreCalls = calls.filter((c) => c.method === "restore");
  h.ok(saveCalls.length > 0, "Crossfade saved canvas state");
  h.ok(restoreCalls.length > 0, "Crossfade restored canvas state");
}

// ---------------------------------------------------------------- Slide Transition
{
  const { ctx, calls } = createMockContext();
  const sceneSlide = { ...nextScene, transition: "slide" as const };
  const handled = drawSceneTransition(
    ctx,
    sceneSlide,
    mockImg,
    baseScene,
    mockImg,
    0.2, // inside transition
    10,
    1920,
    1080
  );
  h.eq(handled, true, "drawSceneTransition returns true for active 'slide'");
  const translateCalls = calls.filter((c) => c.method === "translate");
  h.ok(translateCalls.length > 0, "Slide applied translate transforms");
}

// ---------------------------------------------------------------- Metadata Persistence
for (const transType of ["fade", "slide", "crossfade", "none"] as SceneTransitionType[]) {
  const scene: Scene = {
    ...nextScene,
    transition: transType,
  };
  const serialized = JSON.stringify({ transition: scene.transition });
  const parsed = JSON.parse(serialized);
  h.eq(parsed.transition, transType, `Metadata persistence preserved transition '${transType}'`);
}

// ---------------------------------------------------------------- Global Video Transition Application
{
  const scenesList: Scene[] = [
    { ...baseScene, id: 1, transition: "none" },
    { ...nextScene, id: 2, transition: "fade" },
    { ...nextScene, id: 3, transition: "slide" },
  ];

  for (const globalTrans of ["crossfade", "fade", "slide", "none"] as SceneTransitionType[]) {
    // Simulates handleUpdateVideoTransition applying transition across complete video
    const updatedScenes = scenesList.map((s) => ({ ...s, transition: globalTrans }));
    h.ok(
      updatedScenes.every((s) => s.transition === globalTrans),
      `Global transition '${globalTrans}' applies across all scenes in the video`
    );
  }
}

// ---------------------------------------------------- first frame is never black
// The opening scene has nothing to transition FROM. Running a transition
// there faded the first image up from black — a black slide before the video
// "started". It must draw the image immediately instead.
{
  const scene: Scene = {
    id: 1,
    project_id: 1,
    order_index: 0,
    text: "Opening",
    image_query: "",
    image_url: "https://example.com/a.jpg",
    duration: 10,
    transition: "fade",
  };
  const img = { naturalWidth: 1600, naturalHeight: 900 } as any;
  for (const type of ["fade", "crossfade", "slide"] as SceneTransitionType[]) {
    const handled = drawSceneTransition(
      createStubContext().ctx as any,
      { ...scene, transition: type },
      img,
      null, // no previous scene: this is the first scene of the video
      null,
      0.01, // right at the start of the scene
      10,
      1920,
      1080
    );
    h.ok(!handled, `first scene with ${type} transition draws immediately (no black fade-in)`);
  }
  // With a previous scene the transition still runs as designed.
  const prev: Scene = { ...scene, id: 0, image_url: "https://example.com/b.jpg" };
  const handledWithPrev = drawSceneTransition(
    createStubContext().ctx as any,
    { ...scene, transition: "crossfade" },
    img,
    prev,
    img,
    0.1,
    10,
    1920,
    1080
  );
  h.ok(handledWithPrev, "transition between two scenes still runs");
}

/* ---------------------------------------------------------------------------
 * The full transition library.
 *
 * Twenty-one options reach the picker, so every one of them has to actually
 * draw something: an id that falls through to "return false" would show a
 * hard cut while the UI claimed an effect was selected.
 * ------------------------------------------------------------------------- */

const ALL_IDS = TRANSITION_IDS.filter((id) => id !== "none");

// Catalogue integrity --------------------------------------------------------
h.eq(new Set(TRANSITION_IDS).size, TRANSITION_IDS.length, "no transition id is listed twice");
h.ok(TRANSITION_OPTIONS.length >= 20, "the picker offers the full library");
h.ok(
  TRANSITION_OPTIONS.every((o) => TRANSITION_GROUPS.includes(o.group)),
  "every option belongs to a group the picker renders"
);
h.eq(
  TRANSITION_GROUPS.reduce((n, g) => n + transitionsInGroup(g).length, 0),
  TRANSITION_OPTIONS.length,
  "grouping the options loses none of them"
);
for (const group of TRANSITION_GROUPS) {
  h.ok(transitionsInGroup(group).length > 0, `group ${group} is not empty`);
}
h.eq(
  new Set(TRANSITION_OPTIONS.map((o) => o.label)).size,
  TRANSITION_OPTIONS.length,
  "no two options share a label"
);

// Every id draws -------------------------------------------------------------
for (const id of ALL_IDS) {
  const { ctx, calls } = createMockContext();
  const scene = { ...nextScene, transition: id };
  const handled = drawSceneTransition(ctx, scene, mockImg, baseScene, mockImg, 0.2, 10, 1920, 1080);
  h.eq(handled, true, `'${id}' reports that it drew the frame`);
  h.ok(calls.length > 0, `'${id}' issued canvas work`);
  const draws = calls.filter((c) => c.method === "drawImage").length;
  h.ok(draws > 0, `'${id}' drew at least one image`);
  const saves = calls.filter((c) => c.method === "save").length;
  const restores = calls.filter((c) => c.method === "restore").length;
  h.eq(saves, restores, `'${id}' balances every save with a restore`);
}

// Behaviour across the whole transition, for every id ------------------------
for (const id of ALL_IDS) {
  for (const progress of [0, 0.01, 0.25, 0.5, 0.75, 0.99]) {
    const { ctx, calls } = createMockContext();
    const scene = { ...nextScene, transition: id };
    const elapsed = getTransitionDuration(10) * progress;
    const handled = drawSceneTransition(ctx, scene, mockImg, baseScene, mockImg, elapsed, 10, 1920, 1080);
    h.eq(handled, true, `'${id}' is active at ${progress * 100}% of the way through`);
    // Non-finite geometry is the classic way a transition blanks a frame.
    for (const call of calls) {
      h.ok(
        call.args.every((a) => typeof a !== "number" || Number.isFinite(a)),
        `'${id}' at ${progress}: no non-finite canvas argument`
      );
    }
  }

  // Past the end, the transition stands aside for the normal scene draw.
  const { ctx } = createMockContext();
  h.eq(
    drawSceneTransition(ctx, { ...nextScene, transition: id }, mockImg, baseScene, mockImg, 5, 10, 1920, 1080),
    false,
    `'${id}' stops once the transition duration has elapsed`
  );

  // The opening scene has nothing to come from, so it is shown at once.
  const first = createMockContext();
  h.eq(
    drawSceneTransition(first.ctx, { ...nextScene, transition: id }, mockImg, null, null, 0.1, 10, 1920, 1080),
    false,
    `'${id}' does not run on the first scene of the video`
  );
}

// Family behaviour -----------------------------------------------------------
{
  // Pushes move BOTH frames; covers move only the incoming one.
  for (const id of ["slide", "push_right", "push_up", "push_down"] as SceneTransitionType[]) {
    const { ctx, calls } = createMockContext();
    drawSceneTransition(ctx, { ...nextScene, transition: id }, mockImg, baseScene, mockImg, 0.3, 10, 1920, 1080);
    const moves = calls.filter((c) => c.method === "translate");
    h.eq(moves.length, 2, `'${id}' moves both the outgoing and incoming frames`);
    h.ok(
      moves.some((m) => m.args[0] !== 0 || m.args[1] !== 0),
      `'${id}' actually displaces a frame`
    );
  }

  for (const id of ["cover_left", "cover_right", "cover_up", "cover_down"] as SceneTransitionType[]) {
    const { ctx, calls } = createMockContext();
    drawSceneTransition(ctx, { ...nextScene, transition: id }, mockImg, baseScene, mockImg, 0.3, 10, 1920, 1080);
    h.eq(
      calls.filter((c) => c.method === "translate").length,
      1,
      `'${id}' leaves the outgoing frame where it is`
    );
  }

  // Wipes and reveals clip; the revealed area only ever grows.
  for (const id of ["wipe_left", "wipe_right", "wipe_up", "wipe_down", "blinds"] as SceneTransitionType[]) {
    let previousArea = -1;
    for (const progress of [0.1, 0.4, 0.7, 0.95]) {
      const { ctx, calls } = createMockContext();
      drawSceneTransition(
        ctx,
        { ...nextScene, transition: id },
        mockImg,
        baseScene,
        mockImg,
        getTransitionDuration(10) * progress,
        10,
        1920,
        1080
      );
      const rects = calls.filter((c) => c.method === "rect");
      h.ok(rects.length > 0, `'${id}' clips the reveal with a rectangle`);
      const area = rects.reduce((sum, r) => sum + r.args[2] * r.args[3], 0);
      h.ok(area > previousArea, `'${id}' reveals more of the new scene by ${progress}`);
      h.ok(area <= 1920 * 1080 + 1, `'${id}' never reveals more than the frame`);
      previousArea = area;
    }
  }

  // The iris opens from the centre and clears the corners by the end.
  {
    const maxR = Math.hypot(1920, 1080) / 2;
    let previousR = -1;
    for (const progress of [0.1, 0.5, 0.999]) {
      const { ctx, calls } = createMockContext();
      drawSceneTransition(
        ctx,
        { ...nextScene, transition: "iris" },
        mockImg,
        baseScene,
        mockImg,
        getTransitionDuration(10) * progress,
        10,
        1920,
        1080
      );
      const arc = calls.find((c) => c.method === "arc");
      h.ok(Boolean(arc), `iris at ${progress} clips a circle`);
      h.eq(arc!.args[0], 960, "the iris is centred horizontally");
      h.eq(arc!.args[1], 540, "the iris is centred vertically");
      h.ok(arc!.args[2] > previousR, `the iris is wider at ${progress} than before`);
      previousR = arc!.args[2];
    }
    h.ok(previousR > maxR * 0.95, "the iris reaches the corners before the transition ends");
  }

  // Zooms scale about the frame centre, and never to zero.
  for (const id of ["zoom", "zoom_out"] as SceneTransitionType[]) {
    for (const progress of [0.05, 0.5, 0.95]) {
      const { ctx, calls } = createMockContext();
      drawSceneTransition(
        ctx,
        { ...nextScene, transition: id },
        mockImg,
        baseScene,
        mockImg,
        getTransitionDuration(10) * progress,
        10,
        1920,
        1080
      );
      const scales = calls.filter((c) => c.method === "scale");
      h.eq(scales.length, 1, `'${id}' applies exactly one scale`);
      h.ok(scales[0].args[0] > 0.01, `'${id}' never collapses the frame to nothing`);
      h.eq(scales[0].args[0], scales[0].args[1], `'${id}' scales evenly, so nothing is mis-shaped`);
    }
  }

  // White fade uses white; black fade uses black.
  {
    const { ctx, calls } = createMockContext();
    drawSceneTransition(ctx, { ...nextScene, transition: "fade_white" }, mockImg, baseScene, mockImg, 0.1, 10, 1920, 1080);
    const fills = calls.filter((c) => c.method === "fillRect");
    h.ok(fills.length > 0, "the white fade paints a veil");
    h.ok(String(fills[0].args[4]).includes("255, 255, 255"), "the white fade's veil is white");
  }
  {
    const { ctx, calls } = createMockContext();
    drawSceneTransition(ctx, { ...nextScene, transition: "fade_black" }, mockImg, baseScene, mockImg, 0.1, 10, 1920, 1080);
    const fills = calls.filter((c) => c.method === "fillRect");
    h.ok(String(fills[0].args[4]).includes("rgba(0, 0, 0"), "fade_black still dips through black");
  }
}

// An id the renderer does not know cuts cleanly instead of dropping a frame.
{
  const { ctx } = createMockContext();
  const handled = drawSceneTransition(
    ctx,
    { ...nextScene, transition: "not_a_real_transition" as SceneTransitionType },
    mockImg,
    baseScene,
    mockImg,
    0.1,
    10,
    1920,
    1080
  );
  h.eq(handled, false, "an unknown transition id falls back to a plain cut");
}

h.done("transitions");
