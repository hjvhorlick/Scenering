import { createHarness, createStubContext } from "./harness";
import { CATALOG_ITEMS } from "../src/lib/video-studio-catalog";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getCtaBadgeLayout,
  getCtaPreviewCrop,
  paintCtaWithFloatShadow,
  renderCallToAction,
} from "../src/lib/render-effects";
import { CtaShape } from "../src/data/cta-library";
import type { TimelineInsert } from "../src/types";

/**
 * Call-to-action badges: the studio cards and the editor's live preview both
 * draw with renderCallToAction(), so these checks cover what the user actually
 * sees in the Call to Action tab and in the properties modal.
 *
 * Two regressions are locked down here:
 *   1. the preview used to come up empty — the entrance animation starts at
 *      zero scale, and the still preview was drawn at elapsed 0;
 *   2. badges used to arrive slightly slanted — the default "float" motion adds
 *      its own in-plane tilt on top of the rotation slider.
 */
const h = createHarness();

const CTA_ITEMS = (CATALOG_ITEMS as unknown as { call_to_action: any[] }).call_to_action;

h.ok(CTA_ITEMS.length >= 30, `expected a full CTA platform list, got ${CTA_ITEMS.length}`);

function makeInsert(source: any, overrides: Record<string, unknown> = {}): TimelineInsert {
  return {
    id: `test-${source.type}`,
    category: "call_to_action",
    type: source.type,
    title: source.name,
    startTime: 0,
    duration: 8,
    position: { x: 0.5, y: 0.85 },
    presetPosition: "bottom",
    size: source.defaultSize ?? 1,
    opacity: 1,
    content: { ...(source.defaultContent || {}) },
    visualOptions: { ...(source.defaultVisualOptions || {}) },
    ...overrides,
  } as unknown as TimelineInsert;
}

/** Wraps the stub context and records the rotation/scale it is asked to apply. */
function traced() {
  const { ctx, ops } = createStubContext(1280, 720);
  const rotations: number[] = [];
  const scales: number[][] = [];
  const proxy = new Proxy(ctx as any, {
    get(target, prop: string) {
      const value = Reflect.get(target, prop);
      if (prop === "rotate") {
        return (angle: number) => {
          rotations.push(angle);
          return (value as any)(angle);
        };
      }
      if (prop === "scale") {
        return (x: number, y: number) => {
          scales.push([x, y]);
          return (value as any)(x, y);
        };
      }
      return value;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx: proxy, ops, rotations, scales };
}

for (const source of CTA_ITEMS) {
  const insert = makeInsert(source);

  // ---- defaults are straight -------------------------------------------------
  h.eq(
    (source.defaultVisualOptions as any)?.rotation ?? 0,
    0,
    `${source.type} ships with no default rotation`
  );

  // ---- the live (settled) preview always paints something --------------------
  {
    const t = traced();
    renderCallToAction(t.ctx, insert, 640, 612, 1, 0, { settled: true });
    h.ok(t.ops.length > 40, `${source.type} settled preview drew (${t.ops.length} ops)`);
    h.eq(t.rotations.length, 0, `${source.type} settled preview is not rotated`);
    h.ok(
      t.scales.every(([x, y]) => x > 0 && y > 0),
      `${source.type} settled preview is not scaled away`
    );
  }

  // ---- a badge in motion still never tilts on its own ------------------------
  {
    const t = traced();
    // 1.2s in: past the entrance, mid-float, the moment that used to look slanted
    renderCallToAction(t.ctx, insert, 640, 612, 1, 1.2);
    h.eq(t.rotations.length, 0, `${source.type} stays level while it floats`);
    h.ok(t.ops.length > 40, `${source.type} rendered in motion (${t.ops.length} ops)`);
  }

  // ---- the rotation slider is still the one source of tilt -------------------
  {
    const tilted = makeInsert(source, {
      visualOptions: { ...(source.defaultVisualOptions || {}), rotation: -12 },
    });
    const t = traced();
    renderCallToAction(t.ctx, tilted, 640, 612, 1, 1.2);
    h.eq(t.rotations.length, 1, `${source.type} applies the slider rotation once`);
    h.near(t.rotations[0] ?? 0, (-12 * Math.PI) / 180, 1e-9, `${source.type} uses the slider angle`);
  }

  // ---- card geometry: the badge and its crop are sane at every aspect ratio ---
  {
    const t = traced();
    const layout = getCtaBadgeLayout(insert, t.ctx);
    h.finite(layout.width, `${source.type} layout width is finite`);
    h.finite(layout.height, `${source.type} layout height is finite`);
    h.ok(layout.width > 0 && layout.height > 0, `${source.type} layout has area`);

    for (const [w, hgt] of [
      [1280, 720],
      [720, 1280],
      [1080, 1080],
      [960, 720],
    ]) {
      const crop = getCtaPreviewCrop(insert, w, hgt, t.ctx);
      h.ok(crop.cropW > 0 && crop.cropH > 0, `${source.type} crop has area at ${w}x${hgt}`);
      h.ok(crop.cropW <= w && crop.cropH <= hgt, `${source.type} crop fits at ${w}x${hgt}`);
      h.ok(crop.ox >= 0 && crop.oy >= 0, `${source.type} crop origin is inside the frame`);
      h.ok(crop.ox + crop.cropW <= w, `${source.type} crop stays inside the frame (x)`);
      h.ok(crop.oy + crop.cropH <= hgt, `${source.type} crop stays inside the frame (y)`);
      h.ok(crop.width > 0 && crop.height > 0, `${source.type} badge has area at ${w}x${hgt}`);
    }
  }
}

// ---- the studio card fill ratio produces a readable badge ----------------------
for (const source of CTA_ITEMS) {
  const t = traced();
  const insert = makeInsert(source);
  const layout = getCtaBadgeLayout(insert, t.ctx);
  const cardW = 512;
  const cardH = 176;
  const fit = Math.min((cardW * 0.82) / layout.width, (cardH * 0.5) / layout.height);
  h.ok(fit > 0.5, `${source.type} card preview enlarges the badge (fit=${fit.toFixed(2)})`);
  h.ok(layout.width * fit <= cardW, `${source.type} card preview badge fits the card width`);
  h.ok(layout.height * fit <= cardH, `${source.type} card preview badge fits the card height`);
}

// ---- the shared badge painter -------------------------------------------------
// The editor preview and the studio cards both paint through this helper; without
// an offscreen buffer (Node, or an exotic browser) it reports false so the caller
// falls back to drawing the badge straight onto the canvas — never a blank box.
{
  const t = traced();
  const insert = makeInsert(CTA_ITEMS[0]);
  h.eq(
    paintCtaWithFloatShadow(t.ctx, insert, { settled: true }),
    false,
    "badge painter reports no offscreen buffer in this environment"
  );
  h.eq(t.rotations.length, 0, "the shared badge painter never tilts a badge");
}

// ---- every shape and finish can be previewed on its own chip ------------------
{
  const insert = makeInsert(CTA_ITEMS[0]);
  const t = traced();
  const shapes = new Set<string>();
  for (const shape of ["pill", "round", "square", "banner"] as CtaShape[]) {
    const patched = { ...insert, visualOptions: { ...insert.visualOptions, ctaShape: shape } };
    const layout = getCtaBadgeLayout(patched as TimelineInsert, t.ctx);
    h.ok(layout.width > 0 && layout.height > 0, `${shape} chip badge has area`);
    shapes.add(`${Math.round(layout.width)}x${Math.round(layout.height)}`);
    renderCallToAction(t.ctx, patched as TimelineInsert, 64, 32, 1, 0, { settled: true });
    h.ok(true, `${shape} chip preview draws`);
  }
  // a round badge is not the same picture as a pill: the chips stay distinguishable
  h.ok(shapes.size >= 3, `shape chips show different badges (${shapes.size} distinct sizes)`);

  for (const style of ["solid", "gradient", "outline", "glass"]) {
    const patched = { ...insert, visualOptions: { ...insert.visualOptions, ctaStyle: style } };
    try {
      renderCallToAction(t.ctx, patched as TimelineInsert, 64, 32, 1, 0, { settled: true });
      h.ok(true, `${style} chip preview draws`);
    } catch (err) {
      h.ok(false, `${style} chip preview threw: ${err}`);
    }
  }
}

// ---- badges get the floating drop shadow in the video ------------------------
{
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "src", "lib", "render-effects.ts"), "utf8");
  const map = source.slice(source.indexOf("const FLOAT_SHADOW_CATEGORIES"));
  const entries = map.slice(0, map.indexOf("};"));
  h.ok(entries.includes("call_to_action: true"), "badges join the floating shadow pass");
  h.ok(entries.includes("stickers: true"), "stickers keep the floating shadow pass");
}

h.done("cta-preview");
