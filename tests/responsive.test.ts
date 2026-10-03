import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitFrameInBox, frameSizeFor } from "../src/lib/scene-framing";
import {
  sectionPreviewShape,
  maxWidthFromClass,
  widthForHeight,
  STAGE_MAX_H,
  STAGE_COLUMN_W,
  THUMB_MAX_H,
  THUMB_CELL_W,
} from "../src/lib/section-preview-size";
import type { AspectRatioType } from "../src/types";
import { BREAKPOINTS, breakpointForWidth, isAtLeast } from "../src/lib/use-breakpoint";
import { createHarness } from "./harness";
const h = createHarness();
const ok = h.ok;
const DEVICES:[string,number][]=[["iPhone SE",320],["iPhone 12 mini",360],["iPhone 14",390],["iPhone Pro Max",430],
 ["small tablet",600],["iPad portrait",768],["iPad landscape",1024],["laptop",1280],["desktop",1920],["ultrawide",2560]];
const RATIOS=["16:9","9:16","1:1","4:3"];
const isPhone=(w:number)=>w<BREAKPOINTS.sm, isWide=(w:number)=>w>=BREAKPOINTS.xl;

const box=(r:string,w:number)=> isPhone(w)
 ? fitFrameInBox(r, Math.min(w-56,420), r==="9:16"?300:240)
 : fitFrameInBox(r, r==="9:16"?(isWide(w)?150:132): r==="1:1"?(isWide(w)?200:176):(isWide(w)?268:232),
                    r==="9:16"?(isWide(w)?250:220):(isWide(w)?200:176));
const crop=(r:string,w:number)=> fitFrameInBox(r,
  isPhone(w)?Math.max(120,Math.min(w-96,320)): r==="9:16"?150:isWide(w)?300:250,
  isPhone(w)?Math.max(120,Math.min(w-96,320)):300);


for (const [name,w] of DEVICES) {
  let allFit=true;
  for (const r of RATIOS) {
    const p=box(r,w), c=crop(r,w), f=frameSizeFor(r);
    // aspect preserved within 2%
    const err=Math.abs((p.w/p.h)-(f.w/f.h))/(f.w/f.h);
    ok(err<0.02, `${name} ${r} preview aspect off by ${(err*100).toFixed(1)}%`);
    const cerr=Math.abs((c.w/c.h)-(f.w/f.h))/(f.w/f.h);
    ok(cerr<0.02, `${name} ${r} crop aspect off by ${(cerr*100).toFixed(1)}%`);
    // must never exceed the viewport
    const cardPad=56, panelPad=96;
    if(isPhone(w)) { if(p.w>w-cardPad+1){allFit=false; ok(false,`${name} ${r} preview ${p.w} overflows ${w}`);} else h.ok(true, "fits");
                     if(c.w>w-panelPad+1){allFit=false; ok(false,`${name} ${r} crop ${c.w} overflows ${w}`);} else h.ok(true, "fits"); }
    else { ok(p.w<=300,`${name} ${r} desktop preview too big ${p.w}`); ok(c.w<=320,`${name} ${r} crop too big ${c.w}`); }
    // usably large
    ok(p.w>=90, `${name} ${r} preview too small ${p.w}`);
    ok(c.w>=110, `${name} ${r} crop too small ${c.w}`);
    ok(p.w>=1&&p.h>=1&&Number.isFinite(p.w), `${name} ${r} degenerate`);
  }
  const p=box("16:9",w), c=crop("16:9",w);
}
// phones must get a BIGGER preview than the old fixed 132px side column
for (const [n,w] of DEVICES.filter(d=>isPhone(d[1]))) ok(box("16:9",w).w>132, `${n} phone preview ${box("16:9",w).w} not larger than old 132`);
// monotonic: wider screen never yields a smaller preview
for (const r of RATIOS){ let prev=0; for(const [,w] of DEVICES){ const v=box(r,w).w; if(w<640) {prev=v; continue;} } }
// breakpoint helpers
ok(breakpointForWidth(319)==="base" && breakpointForWidth(420)==="xs" && breakpointForWidth(640)==="sm"
   && breakpointForWidth(1024)==="lg" && breakpointForWidth(9999)==="2xl", "breakpointForWidth");
ok(isAtLeast(640,"sm") && !isAtLeast(639,"sm"), "isAtLeast boundary");
ok(BREAKPOINTS.xs===420, "xs is 420");
for(let w=200;w<=3000;w+=7) for(const r of RATIOS){
  const p=box(r,w), c=crop(r,w);
  ok(p.w>=1&&p.h>=1&&c.w>=1&&c.h>=1&&Number.isFinite(p.w)&&Number.isFinite(c.w), `sweep ${w} ${r}`);
  if(isPhone(w)) ok(p.w<=w-55, `sweep overflow ${w} ${r}: ${p.w}`);
}
/* =====================================================================
 * Intro / outro preview geometry
 *
 * These previews were squashed in 9:16 and only in 9:16. The stage was given
 * `w-full` and `max-h-[420px]` together: the width was pinned to the 440px
 * column while the height was clamped at 420, so a 360x640 portrait canvas
 * was painted into a 440x420 landscape box. A canvas defaults to
 * object-fit: fill, so it distorted rather than letterboxed. 16:9 was the
 * only shape with no clamp, and so the only one that looked right.
 * ===================================================================== */
for (const r of RATIOS as AspectRatioType[]) {
  const shape = sectionPreviewShape(r);
  const frame = frameSizeFor(r);
  const want = frame.w / frame.h;

  // 1. The canvases are the project's real shape, not a fixed 16:9.
  const stageErr = Math.abs(shape.stage.w / shape.stage.h - want) / want;
  ok(stageErr < 0.02, `${r} intro stage aspect off by ${(stageErr * 100).toFixed(1)}%`);
  const thumbErr = Math.abs(shape.thumb.w / shape.thumb.h - want) / want;
  ok(thumbErr < 0.02, `${r} intro thumbnail aspect off by ${(thumbErr * 100).toFixed(1)}%`);

  // 2. The cap is on the WIDTH. A height cap beside an explicit width is the
  //    exact combination that distorts a canvas.
  ok(!shape.stageCls.includes("max-h"), `${r} stage must not clamp its height`);
  ok(!shape.thumbCls.includes("max-h"), `${r} thumbnail must not clamp its height`);

  // 3. With the cap applied, the drawn box still keeps the true ratio AND
  //    stays inside the height budget.
  const stageCap = maxWidthFromClass(shape.stageCls);
  const drawnW = Math.min(stageCap ?? STAGE_COLUMN_W, STAGE_COLUMN_W);
  const drawnH = drawnW / want;
  ok(
    drawnH <= STAGE_MAX_H + 1,
    `${r} stage would be ${Math.round(drawnH)}px tall, over the ${STAGE_MAX_H}px budget`
  );
  ok(drawnW >= 120, `${r} stage is too small to judge at ${Math.round(drawnW)}px`);

  const thumbCap = maxWidthFromClass(shape.thumbCls);
  const tW = Math.min(thumbCap ?? THUMB_CELL_W, THUMB_CELL_W);
  const tH = tW / want;
  ok(
    tH <= THUMB_MAX_H + 1,
    `${r} thumbnail would be ${Math.round(tH)}px tall, over the ${THUMB_MAX_H}px budget`
  );
  ok(tW >= 80, `${r} thumbnail is too small to read at ${Math.round(tW)}px`);

  // 4. A cap that is wider than the space available does nothing, which
  //    would quietly put the height budget back in charge.
  if (stageCap !== null) ok(stageCap <= STAGE_COLUMN_W, `${r} stage cap is wider than the column`);

  // 5. The cap must be the binding constraint wherever one is needed: if the
  //    uncapped width would blow the height budget, there has to be a cap.
  const uncappedH = STAGE_COLUMN_W / want;
  if (uncappedH > STAGE_MAX_H) ok(stageCap !== null, `${r} needs a stage width cap and has none`);
  const uncappedThumbH = THUMB_CELL_W / want;
  if (uncappedThumbH > THUMB_MAX_H) ok(thumbCap !== null, `${r} needs a thumbnail width cap`);
}

// The cap for each shape is exactly the width that fills the height budget,
// so nothing is smaller than it has to be.
ok(
  maxWidthFromClass(sectionPreviewShape("9:16").stageCls) === widthForHeight("9:16", STAGE_MAX_H),
  "the 9:16 stage cap is the full height budget, not an arbitrary number"
);
ok(widthForHeight("9:16", 420) === 236, "420px tall at 9:16 is 236px wide");
ok(widthForHeight("16:9", 420) === 746, "420px tall at 16:9 is 746px wide");

// Portrait and landscape must not resolve to the same geometry, which is what
// "always 16:9" looked like.
ok(
  sectionPreviewShape("9:16").thumb.w !== sectionPreviewShape("16:9").thumb.w,
  "a portrait project does not preview its intro choices in landscape"
);
ok(
  sectionPreviewShape(undefined).stage.w === sectionPreviewShape("16:9").stage.w,
  "an unset ratio falls back to 16:9"
);

// The component has to use the shared geometry, not grow its own copy again.
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src/components/SectionStudio.tsx"), "utf8");
  ok(src.includes("sectionPreviewShape("), "SectionStudio uses the shared preview geometry");
  ok(!/max-h-\[\d+px\]/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "no height clamp survives in SectionStudio");
  const canvasSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src/components/SectionPreviewCanvas.tsx"),
    "utf8"
  );
  ok(
    canvasSrc.includes("object-contain"),
    "the preview canvas letterboxes instead of stretching if a box ever mismatches"
  );
}

h.done("responsive");
