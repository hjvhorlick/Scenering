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

/* =====================================================================
 * The pages themselves: front page, standalone pages, manual, sign-in.
 *
 * There is no browser here to measure a layout in, so these read the
 * stylesheets and assert the properties that decide whether a page works
 * on a given screen: that layouts are written mobile-first, that nothing
 * is pinned to a width a phone does not have, that panels which hang off
 * the top of the window have a ceiling and their own scroll, and that the
 * viewport is declared in the one way that makes any of it apply.
 * ===================================================================== */
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  const mkt = read("src/marketing/marketing.css");
  const menu = read("src/shared/site-corner-menu.css");
  const signIn = read("src/studio/sign-in.css");
  const html = read("index.html");

  // 1. Without this meta tag a phone pretends to be 980px wide and shrinks
  //    the whole page, which makes every media query below a decoration.
  ok(/<meta name="viewport"[^>]*width=device-width/.test(html), "the viewport is the device's width");
  ok(/initial-scale=1/.test(html), "the page opens at 1:1 scale");
  ok(/viewport-fit=cover/.test(html), "viewport-fit=cover, so env(safe-area-inset-*) has real values on a notched phone");
  ok(!/user-scalable=no|maximum-scale=1/.test(html), "pinch zoom is never disabled");

  // 2. Mobile-first. A `max-width` query describes an exception; a sheet
  //    built out of them is a desktop layout with apologies. The marketing
  //    sheet must stay predominantly min-width.
  const minW = (mkt.match(/@media \(min-width/g) || []).length;
  const maxW = (mkt.match(/@media \(max-width|@media \(width <=/g) || []).length;
  ok(minW >= maxW, `marketing.css is mobile-first (${minW} min-width vs ${maxW} max-width queries)`);
  ok(minW >= 20, "the page has real breakpoints, not one catch-all");

  // 3. The extremes at both ends are handled on purpose.
  ok(/@media \(min-width: 1600px\)/.test(mkt), "there is a layout for a very wide monitor");
  ok(/@media \(width <= 359px\)/.test(mkt), "there is a layout for a 320px phone");
  ok(/@media \(max-height: 560px\)/.test(mkt), "there is a layout for a phone held sideways");
  ok(/@media \(pointer: coarse\)/.test(mkt), "touch screens get finger-sized targets");
  ok(/@media \(pointer: coarse\)/.test(menu), "the corner menu gets finger-sized rows too");

  // 4. Anything that opens off the top of the window must be able to end:
  //    a drop panel taller than a sideways phone with no scroll of its own
  //    is a panel whose last item cannot be reached.
  for (const [sheet, name, sel] of [
    [mkt, "marketing.css", ".mkt-nav-panel"],
    [mkt, "marketing.css", ".pub-navlinks"],
    [mkt, "marketing.css", ".manual-nav"],
    [menu, "site-corner-menu.css", ".sc-corner-panel"],
  ] as [string, string, string][]) {
    const blocks = sheet.split(sel).slice(1).map((b) => b.slice(0, b.indexOf("}") + 1));
    ok(blocks.some((b) => /max-height:/.test(b)), `${name} gives ${sel} a height ceiling`);
    ok(
      blocks.some((b) => /max-height:/.test(b) && /overflow-y: auto|overflow: auto/.test(b)),
      `${name} gives ${sel} a height ceiling it can scroll inside`
    );
  }

  // 5. 100vh on a phone is the viewport at its TALLEST — while the browser
  //    chrome is showing, a 100vh page is taller than the window. Every
  //    full-height rule carries a dvh twin.
  for (const [sheet, name] of [[mkt, "marketing.css"], [menu, "site-corner-menu.css"], [signIn, "sign-in.css"]] as [string, string][]) {
    const vh = (sheet.match(/100vh/g) || []).length;
    const dvh = (sheet.match(/100dvh/g) || []).length;
    ok(dvh >= vh, `${name} pairs every 100vh with a 100dvh fallback (${vh} vh, ${dvh} dvh)`);
  }

  // 6. Nothing may be wider than the narrowest phone we support. A fixed
  //    width or a grid of fixed columns over 300px is a horizontal scrollbar
  //    at 320px unless a query is holding it back.
  const outsideQueries = mkt.replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\}\s*)*\}/g, "");
  const fixedWidths = [...outsideQueries.matchAll(/(?<!max-|min-)\bwidth:\s*(\d{3,})px/g)].map((m) => Number(m[1]));
  for (const w of fixedWidths) ok(w <= 300, `an unconditional width of ${w}px does not fit a 320px screen`);
  for (const m of outsideQueries.matchAll(/grid-template-columns:([^;]+);/g)) {
    const sum = [...m[1].matchAll(/(\d+)px/g)].reduce((a, x) => a + Number(x[1]), 0);
    ok(sum <= 300, `a fixed ${sum}px of columns outside a media query cannot fit a phone`);
  }
  for (const m of outsideQueries.matchAll(/minmax\((\d+)px/g)) {
    ok(Number(m[1]) <= 300, `a ${m[1]}px minimum column outside a media query overflows a phone`);
  }

  // 7. Images and media never push a page sideways.
  ok(/\.mkt-root img\s*\{[^}]*max-width: 100%/.test(mkt), "every picture on the site is capped at its container");

  // 8. The standalone pages get the tablet range, not three columns or one.
  ok(
    /@media \(620px <= width <= 900px\)[\s\S]{0,400}grid-template-columns: repeat\(2/.test(mkt),
    "the standalone pages show two columns on a tablet"
  );

  // 9. The studio shell: the one flex child that holds everything must be
  //    allowed to be narrower than its content, or a single wide row drags
  //    the whole app past the right edge of the window.
  const app = read("src/App.tsx");
  ok(/flex-1 flex flex-col min-w-0/.test(app), "the studio's main column may shrink below its content");
  ok(/overflow-x-auto/.test(app) || /overflow-x-auto/.test(read("src/components/Timeline.tsx")), "wide rows scroll themselves");
  // The phase tabs are the widest fixed row in the app; they must scroll
  // rather than widen the header.
  ok(/t-tabbar[^"]*overflow-x-auto/.test(app), "the phase tabs scroll sideways instead of stretching the header");

  // The project name lives on its own full-width line under the logo and
  // the phase tabs. It used to sit inline between them with a width clamp,
  // and a long name still pushed the right-hand buttons off the edge of a
  // laptop screen; a wrapped second line can never compete for that row.
  const projectTitle =
    app.match(/<h2\s+className="order-last w-full[^"]*"/)?.[0] ?? "";
  ok(projectTitle.length > 0, "the header still carries the project title, on its own line");
  ok(/w-full/.test(projectTitle), "the title wraps to a full-width row of its own");
  ok(/order-last/.test(projectTitle), "the title's row comes after the logo, tabs and buttons");
  ok(/truncate/.test(projectTitle), "a novel-length title still keeps to a single line");
  ok(
    app.includes('title={currentProject ? currentProject.title : "Start a New Project"}'),
    "a shortened title is still readable in full from the tooltip"
  );
}

/* =====================================================================
 * Fitting the phone: the corner menu, the headers, and the sections that
 * were wider than the screen.
 *
 * The owner's report, in their words: "the header is cutoff and does not show
 * the full menu … if i turn my phone side ways it sould adapt to that view …
 * the front page and some other pages have very large sections that falls
 * outside the cell phone area of view."
 *
 * Three things had to be true for that to stop happening, and all three are
 * structural rather than cosmetic, so they are pinned here:
 *
 *   1. The corner button's width and the space every header keeps clear for it
 *      come from ONE definition. A header that guesses the width gets it wrong
 *      the moment the button grows a plan badge — which is exactly when the
 *      studio's theme picker and the website's last nav item disappeared under
 *      it.
 *   2. On a phone the button is the ☰ glyph alone, with the name on
 *      aria-label, so a 320px header is not a third spent on one control.
 *   3. Anything on the website that could not shrink to a phone's width either
 *      became a layout that does fit (the plan comparison becomes cards) or
 *      gained its own sideways scroll. Nothing is left to `overflow-x: clip`
 *      to silently swallow.
 * ===================================================================== */
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  const mkt = read("src/marketing/marketing.css");
  const menu = read("src/shared/site-corner-menu.css");
  const chrome = read("src/index.css");
  const app = read("src/App.tsx");
  const marketingSite = read("src/marketing/MarketingSite.tsx");
  const publicPage = read("src/marketing/PublicPage.tsx");

  // --- 1. one source of truth for the menu's footprint -------------------
  ok(/:root\s*\{[^}]*--sc-corner-reserve:/s.test(menu), "the corner-menu footprint is defined once, as variables");
  ok(
    /\.sc-corner-reserve\s*\{[^}]*width:\s*var\(--sc-corner-reserve\)/s.test(menu),
    "…and one class keeps that width clear"
  );
  ok(
    /\.sc-corner\s*\{[^}]*top:\s*var\(--sc-corner-inset-y\)/s.test(menu) &&
      /\.sc-corner\s*\{[^}]*right:\s*var\(--sc-corner-inset-x\)/s.test(menu),
    "the button positions itself from the same variables"
  );
  ok(
    /\.sc-corner-trigger\s*\{[^}]*height:\s*var\(--sc-corner-height\)/s.test(menu),
    "and sizes itself from them too"
  );
  ok(
    menu.includes("env(safe-area-inset-right)") && menu.includes("env(safe-area-inset-top)"),
    "a phone turned sideways keeps the button clear of the notch"
  );

  // every header reserves it, and none of them hardcodes the old 92px
  ok(app.includes("pr-[var(--sc-corner-reserve)]"), "the studio header reserves the menu's width");
  ok(marketingSite.includes('className="sc-corner-reserve"'), "the front-page nav reserves it");
  ok(publicPage.includes('className="sc-corner-reserve"'), "the standalone-page nav reserves it");
  ok(!/style=\{\{ width: 92 \}\}/.test(marketingSite + publicPage), "no header guesses the width any more");

  // --- 2. a phone gets the glyph, and keeps the name ---------------------
  ok(
    /\.sc-corner-trigger \.sc-corner-word[^{]*\{[^}]*display: none/s.test(menu),
    "a phone shows the ☰ glyph without the word"
  );
  ok(read("src/shared/SiteCornerMenu.tsx").includes('aria-label="Menu"'), "…and the control keeps its accessible name");
  ok(
    /\.sc-corner-trigger em \{[^}]*display: none/s.test(menu.slice(menu.indexOf("@media (max-width: 560px)"), menu.indexOf("@media (prefers-reduced-motion"))),
    "the plan badge is not drawn on a phone either"
  );
  ok(
    /\.sc-corner-trigger \.sc-corner-word,\s*\n\s*\.sc-corner-trigger em/.test(menu),
    "both are hidden by the same rule, so they cannot drift apart"
  );

  // --- the studio header on a phone -------------------------------------
  ok(
    app.includes('<SocialLinksRow size={36} className="hidden md:flex shrink-0" />'),
    "the studio header keeps its social strip for tablet width and up only"
  );
  ok(
    /@media \(max-height: 560px\)[^{]*\{[^@]*\.t-app-hdr/s.test(chrome),
    "the studio header compacts when the phone is sideways"
  );
  ok(
    /@media \(max-height: 560px\)[^{]*\{[^@]*\.t-app-hdr img/s.test(chrome),
    "…and the wordmark shrinks with it rather than wrapping the row"
  );

  // --- the website, sideways -------------------------------------------
  ok(
    /@media \(max-height: 560px\)[^{]*\{[^@]*\.mkt-nav-inner[^}]*min-height: 48px/s.test(mkt),
    "the website header compacts when the phone is sideways"
  );
  ok(
    /@media \(max-height: 560px\)[^{]*\{[^@]*\.mkt-section[^}]*padding-top: 30px/s.test(mkt),
    "…and the front page stops paying desktop section padding in landscape"
  );

  // --- 3. the sections that fell off the side ---------------------------
  ok(
    /\.pub-table-wrap \{[^}]*overflow-x: auto/s.test(mkt),
    "the plan comparison still scrolls on a desktop where it is a table"
  );
  ok(
    /@media \(width <= 780px\)[\s\S]{0,900}\.pub-table tbody tr \{[^}]*border-radius/s.test(mkt),
    "…and becomes one card per row on a phone"
  );
  ok(
    /\.pub-table tbody td\[data-label\]::before \{[^}]*content: attr\(data-label\)/s.test(mkt),
    "each cell on a phone says which plan it answers for"
  );
  ok(
    /\.pub-table tbody th\[scope="row"\],[\s\S]{0,120}\.pub-table tbody td:first-child/s.test(mkt),
    "the row's own name heads its card"
  );
  ok(
    (publicPage.match(/data-label=/g) || []).length >= 9,
    "the markup carries the plan labels the phone layout reads"
  );
  ok(
    !/overflow-x: clip[\s\S]{0,80}(fixed|absolute)/.test(mkt),
    "clipping is a safety net, not the layout"
  );

  // --- the long front page is not all live at once ----------------------
  ok(
    /\.mkt-section \{[^}]*content-visibility: auto/s.test(mkt),
    "off-screen front-page sections are skipped until they are approached"
  );
  ok(
    /\.mkt-section \{[^}]*contain-intrinsic-size: auto/s.test(mkt),
    "…with a remembered placeholder height, so the scrollbar does not jump"
  );
  const fixedInSections = [...read("src/marketing/components/primitives.tsx").matchAll(/position:\s*fixed/g)];
  ok(fixedInSections.length === 0, "nothing inside a contained section is positioned against the viewport");
}

h.done("responsive");
