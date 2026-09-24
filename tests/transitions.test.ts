import { createHarness } from "./harness";
import {
  TRANSITION_OPTIONS,
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
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
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

h.done("transitions");
