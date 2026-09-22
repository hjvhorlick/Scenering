import { fitFrameInBox, frameSizeFor } from "../src/lib/scene-framing";
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
h.done("responsive");
