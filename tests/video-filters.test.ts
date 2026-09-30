import { createHarness, createStubContext } from "./harness";
import {
  VIDEO_FILTERS,
  getPreset,
  resolveSettings,
  makeFilterConfig,
  BASE_SETTINGS,
} from "../src/data/video-filters";
import { paintVideoFilter } from "../src/lib/video-filter-render";

/**
 * THE STANDING RULE: no filter may paint black bars into the video unless
 * the user explicitly raises the Cinema Bars slider. The bars are drawn
 * onto the canvas frames themselves — the same code runs for the studio
 * preview AND the export — so a letterbox that sneaks in here is baked
 * into the rendered file, not a cosmetic UI problem.
 */
const h = createHarness();

const W = 1920;
const H = 1080;
const BAR = H * 0.1; // the anamorphic preset's letterbox ratio

/** Paints one frame of a filter and returns every fillRect with its args. */
function paintedRects(filterId: string, settings?: Record<string, number>) {
  const { ctx, opsWithArgs } = createStubContext(W, H);
  const config = makeFilterConfig(filterId);
  if (!config) throw new Error(`no such filter: ${filterId}`);
  if (settings) config.settings = { ...config.settings, ...settings } as typeof config.settings;
  paintVideoFilter(ctx, config, W, H, 1.0);
  return opsWithArgs.filter((op) => op.startsWith("fillRect("));
}

/** True when a fillRect is a letterbox bar: full width, part height, pinned
 *  to the very top or very bottom edge of the frame. */
function isBarRect(op: string): boolean {
  const m = /^fillRect\(([^)]*)\)$/.exec(op);
  if (!m) return false;
  const [x, y, w, rectH] = m[1].split(",").map(Number);
  if (x !== 0 || w !== W) return false;
  // Real letterbox bars are a meaningful slice of the frame. Hairline
  // full-width rects (VHS tracking lines, scanlines) are effects, not bars.
  if (rectH < H * 0.02 || rectH >= H * 0.45) return false;
  const atTop = y === 0;
  const atBottom = Math.abs(y + rectH - H) < 0.5;
  return atTop || atBottom;
}

// ---- 1. Every filter, at its own defaults, keeps the full frame ---------
for (const preset of VIDEO_FILTERS) {
  const bars = paintedRects(preset.id).filter(isBarRect);
  h.ok(
    bars.length === 0,
    `${preset.id} paints no letterbox bars by default (found: ${bars.join(" ") || "none"})`
  );
}

// ---- 2. The base default keeps bars off, and legacy settings resolve off -
h.eq(BASE_SETTINGS.letterbox, 0, "cinema bars are opt-in at the base level");
const anamorphic = getPreset("anamorphic");
h.ok(!!anamorphic, "the anamorphic preset exists");
if (anamorphic) {
  // A project saved BEFORE the letterbox control existed has no letterbox
  // key stored — it must resolve to 0, healing old projects automatically.
  const legacy = resolveSettings(anamorphic, { strength: 1.2, glow: 0.6 } as never);
  h.eq(legacy.letterbox, 0, "legacy anamorphic settings resolve to bars OFF");
  h.ok(
    anamorphic.controls.includes("letterbox"),
    "the anamorphic preset exposes the Cinema Bars slider"
  );
}

// ---- 3. The slider still works when raised deliberately ------------------
const withBars = paintedRects("anamorphic", { letterbox: 1 }).filter(isBarRect);
h.eq(withBars.length, 2, "Cinema Bars at 1 paints exactly a top and a bottom bar");
for (const op of withBars) {
  const [, , , rectH] = /fillRect\(([^)]*)\)/.exec(op)![1].split(",").map(Number);
  h.ok(Math.abs(rectH - BAR) < 0.5, `a full-strength bar is 10% of the frame (${op})`);
}
const halfBars = paintedRects("anamorphic", { letterbox: 0.5 }).filter(isBarRect);
h.eq(halfBars.length, 2, "Cinema Bars at 0.5 still paints both bars");
for (const op of halfBars) {
  const [, , , rectH] = /fillRect\(([^)]*)\)/.exec(op)![1].split(",").map(Number);
  h.ok(Math.abs(rectH - BAR / 2) < 0.5, `a half-strength bar is half height (${op})`);
}

// ---- 4. Bars never fade in via Look Strength alone ------------------------
const strongLook = paintedRects("anamorphic", { strength: 1.6 }).filter(isBarRect);
h.ok(strongLook.length === 0, "raising Look Strength does not smuggle the bars back in");

h.done("video-filters");
