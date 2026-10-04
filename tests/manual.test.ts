import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { MANUAL_CHAPTERS, MANUAL_SECTIONS } from "../src/marketing/manual-data";

const h = createHarness();
h.eq(MANUAL_CHAPTERS.length, 20, "manual has twenty ordered handbook chapters");
h.eq(MANUAL_SECTIONS.length, 60, "manual has sixty substantive sections");
h.eq(new Set(MANUAL_CHAPTERS.map((chapter) => chapter.id)).size, MANUAL_CHAPTERS.length, "chapter ids are unique");
h.eq(new Set(MANUAL_SECTIONS.map((section) => section.id)).size, MANUAL_SECTIONS.length, "section anchors are unique");
for (const chapter of MANUAL_CHAPTERS) {
  h.ok(chapter.description.length >= 35, `${chapter.id}: chapter has a description`);
  h.eq(chapter.sections.length, 3, `${chapter.id}: chapter has three detailed sections`);
  for (const section of chapter.sections) {
    h.ok(section.summary.length >= 45, `${section.id}: summary is substantive`);
    h.ok(section.paragraphs.length >= 2, `${section.id}: has explanatory paragraphs`);
    h.ok(section.paragraphs.every((paragraph) => paragraph.length >= 80), `${section.id}: paragraphs contain operational detail`);
    h.ok(section.keywords.length >= 3, `${section.id}: reference keywords are indexed`);
    h.ok(!/guaranteed views|go viral|customer story|testimonial/i.test(section.paragraphs.join(" ")), `${section.id}: no stories or unsupported marketing claims`);
  }
}
const all = JSON.stringify(MANUAL_CHAPTERS).toLowerCase();
for (const term of ["registration", "setup", "scenes", "visual research", "cropping", "voiceover", "captions", "timeline", "audio visualisers", "rendering", "vault", "download", "attribution"]) h.ok(all.includes(term), `manual covers ${term}`);
const page = readFileSync("src/marketing/ManualPage.tsx", "utf8");
h.ok(page.includes("manual-nav"), "manual has left chapter navigation");
h.ok(page.includes("Search the manual by keyword"), "manual has keyword search");
h.ok(page.includes("manual-pager"), "manual has previous and next chapter navigation");
h.ok(page.includes("manual-keywords"), "manual exposes clickable reference terms");
const publicPage = readFileSync("src/marketing/PublicPage.tsx", "utf8");
h.ok(publicPage.includes('path === "/manual"'), "public router lazy-loads the manual route");
h.ok(publicPage.includes('href="/manual"'), "public footer links to the manual");
const cornerMenu = readFileSync("src/shared/SiteCornerMenu.tsx", "utf8");
h.ok(cornerMenu.includes('["/manual", "Manual"]'), "shared corner menu links to the manual");
const platform = readFileSync("server/platform.ts", "utf8");
h.ok(platform.includes('"/manual"'), "manual is included in the sitemap page list");
h.done("reference manual");
