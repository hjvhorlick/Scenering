import { createHarness, createStubContext } from "./harness";
import { STICKER_LIBRARY, drawSticker, resolveStickerId } from "../src/lib/sticker-3d";
import { MOTION_PRESETS, computeMotion, NEUTRAL_MOTION } from "../src/lib/overlay-motion";
import { TEXT_TEMPLATES } from "../src/data/text-templates";
import {
  renderTextTemplate,
  getTextTemplateBounds,
  resolveArtStyle,
} from "../src/lib/render-text-template";
import { TEXT_ART_PRESETS, drawTextArt, DEFAULT_TEXT_ART } from "../src/lib/text-art";
import { VIDEO_FILTERS, getFilterCanvas, getPreset, makeFilterConfig } from "../src/data/video-filters";
import { paintVideoFilter } from "../src/lib/video-filter-render";

/**
 * Exercises the drawing code for non-finite numbers and structural mistakes.
 * The stub context throws on any NaN argument, so "it drew without throwing"
 * is a real assertion about the maths, even without a canvas to rasterise to.
 */
const h = createHarness();

// ---------------------------------------------------------------- stickers
h.ok(STICKER_LIBRARY.length >= 30, `expected a large sticker set, got ${STICKER_LIBRARY.length}`);
const stickerIds = new Set<string>();
for (const sticker of STICKER_LIBRARY) {
  h.ok(!stickerIds.has(sticker.id), `duplicate sticker id: ${sticker.id}`);
  stickerIds.add(sticker.id);
  h.ok(Boolean(sticker.name), `sticker ${sticker.id} has a name`);

  h.eq(resolveStickerId(sticker.id), sticker.id, `sticker ${sticker.id} resolves to itself`);

  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const { ctx } = createStubContext();
    try {
      drawSticker(ctx, sticker.id, { motion: computeMotion(t, 4, { preset: "bounce" }), time: t });
      h.ok(true, `sticker ${sticker.id} drew at t=${t}`);
    } catch (err) {
      h.ok(false, `sticker ${sticker.id} threw at t=${t}: ${err}`);
    }
  }
}

// ------------------------------------------------------------------ motion
h.ok(MOTION_PRESETS.length >= 15, `expected 15+ overlay motions, got ${MOTION_PRESETS.length}`);
for (const preset of MOTION_PRESETS) {
  for (let i = 0; i <= 40; i++) {
    const elapsed = (i / 40) * 4;
    const state = computeMotion(elapsed, 4, { preset: preset.id });
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === "number") {
        h.finite(value, `overlay motion ${preset.id}.${key} at ${elapsed.toFixed(2)}s`);
      }
    }
  }
  // Out-of-range and degenerate timings must not produce NaN.
  for (const [elapsed, lifetime] of [[-1, 4], [99, 4], [0, 0], [NaN, 4]]) {
    const state = computeMotion(elapsed, lifetime, { preset: preset.id });
    // Every numeric field must stay finite: these feed straight into canvas
    // transforms, where a NaN silently blanks the element.
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === "number") {
        h.finite(value, `${preset.id}.${key} at elapsed=${elapsed} lifetime=${lifetime}`);
      }
    }
  }
}
// An unknown id must degrade gracefully rather than throw.
const unknownMotion = computeMotion(0.5, 2, { preset: "does-not-exist" as never });
h.finite(unknownMotion.scale, "an unknown motion id still returns a usable state");
h.finite(NEUTRAL_MOTION.scale, "the neutral motion state is usable");

// --------------------------------------------------------- text templates
h.ok(TEXT_TEMPLATES.length >= 25, `expected the full template set, got ${TEXT_TEMPLATES.length}`);
const sectionCounts = new Map<string, number>();
const templateIds = new Set<string>();
for (const template of TEXT_TEMPLATES) {
  h.ok(!templateIds.has(template.id), `duplicate template id: ${template.id}`);
  templateIds.add(template.id);
  sectionCounts.set(template.section, (sectionCounts.get(template.section) || 0) + 1);
}
// The standing requirement: every section needs at least four templates.
for (const [section, count] of sectionCounts) {
  h.ok(count >= 4, `section "${section}" has only ${count} templates, needs 4+`);
}

for (const template of TEXT_TEMPLATES) {
  for (const elapsed of [0, 0.4, 1.5, 6]) {
    const { ctx } = createStubContext();
    const item = {
      id: `test-${template.id}`,
      type: template.id,
      category: "text" as const,
      startTime: 0,
      duration: 6,
      content: {
        label: "Label", book: "Genesis", chapter: "1", verse: "1",
        primaryText: "The quick brown fox jumps over the lazy dog",
        secondaryText: "A supporting line of text",
        author: "Someone", number: "3",
        item1: "First", item2: "Second", item3: "Third", item4: "Fourth",
      },
      visualOptions: { templateStyle: { templateId: template.id } },
    };
    try {
      renderTextTemplate(ctx, item as never, 100, 100, 1, 1920, elapsed);
      h.ok(true, `template ${template.id} rendered at ${elapsed}s`);
    } catch (err) {
      h.ok(false, `template ${template.id} threw at ${elapsed}s: ${err}`);
    }

    const bounds = getTextTemplateBounds(item as never, 1920);
    h.finite(bounds.w, `template ${template.id} bounds width`);
    h.finite(bounds.h, `template ${template.id} bounds height`);
    h.ok(bounds.w > 0 && bounds.h > 0, `template ${template.id} has a positive size`);
  }
}

// ---------------------------------------------------------------- text art
h.ok(TEXT_ART_PRESETS.length >= 12, `expected 12+ art styles, got ${TEXT_ART_PRESETS.length}`);
for (const style of TEXT_ART_PRESETS) {
  const artStyle = { ...DEFAULT_TEXT_ART, ...style.style };
  for (const reveal of [0, 0.5, 1]) {
    const { ctx } = createStubContext();
    try {
      drawTextArt(ctx, "Chapter One", artStyle, {
        family: "Inter", fallback: "sans-serif",
        x: 200, y: 200, maxWidth: 1200, reveal, seed: 7,
      });
      h.ok(true, `art style ${style.id} drew at reveal=${reveal}`);
    } catch (err) {
      h.ok(false, `art style ${style.id} threw at reveal=${reveal}: ${err}`);
    }
  }
  // Empty and very long strings must not break the layout maths.
  for (const text of ["", "A", "word ".repeat(60)]) {
    const { ctx } = createStubContext();
    try {
      drawTextArt(ctx, text, artStyle, {
        family: "Inter", fallback: "sans-serif", x: 10, y: 10, maxWidth: 800,
      });
      h.ok(true, `art style ${style.id} handled a ${text.length}-char string`);
    } catch (err) {
      h.ok(false, `art style ${style.id} threw on a ${text.length}-char string: ${err}`);
    }
  }
}

// ----------------------------------------------------------------- filters
h.ok(VIDEO_FILTERS.length > 0, "there is at least one video filter");
for (const filter of VIDEO_FILTERS) {
  const preset = getPreset(filter.id);
  h.ok(Boolean(preset), `getPreset resolves ${filter.id}`);

  const config = makeFilterConfig(filter.id);
  const css = getFilterCanvas(config, 1920);
  h.eq(typeof css, "string", `filter ${filter.id} returns a CSS string`);
  h.ok(!css.includes("NaN"), `filter ${filter.id} CSS contains no NaN: ${css}`);

  for (const t of [0, 1.5, 9]) {
    const { ctx } = createStubContext();
    try {
      paintVideoFilter(ctx, config, 1920, 1080, t);
      h.ok(true, `filter ${filter.id} painted at t=${t}`);
    } catch (err) {
      h.ok(false, `filter ${filter.id} threw at t=${t}: ${err}`);
    }
  }
}
// A missing or unknown filter must be a no-op, not a crash.
h.eq(getFilterCanvas(null as never, 1920), "none", "a null filter is 'none'");

h.done("render");
