/**
 * The public website, actually rendered.
 *
 * The honesty suite reads the source; this one builds the site with esbuild,
 * renders it to static HTML with react-dom/server and inspects the markup a
 * visitor would receive. It catches the things source-reading cannot: a
 * component that throws, an image that lost its alt text on the way through a
 * wrapper, a heading level that went missing, a tablist with nothing
 * selected, or "undefined" rendered into the copy.
 *
 * esbuild and react-dom are already dependencies, so this stays in the
 * no-test-runner spirit of the rest of the suite.
 */
import { build } from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------- render */

const bundle = await build({
  entryPoints: [join(repoRoot, "src", "marketing", "MarketingSite.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
  external: ["react", "react-dom", "react/jsx-runtime"],
  // Stylesheets and bitmaps are not part of the markup under test.
  loader: { ".css": "empty", ".png": "empty", ".jpg": "empty", ".webp": "empty" },
  outfile: "site.mjs",
});

// Written inside the repo (node_modules/.cache is ignored) so the bundle's
// `react` imports resolve against this project's install.
const dir = join(repoRoot, "node_modules", ".cache");
mkdirSync(dir, { recursive: true });
const file = join(dir, "scenering-site.mjs");
writeFileSync(file, bundle.outputFiles[0].text);
const { default: MarketingSite } = await import(pathToFileURL(file).href);

let html = "";
try {
  html = renderToStaticMarkup(createElement(MarketingSite));
  ok(true, "the website renders without throwing");
} catch (error) {
  ok(false, `the website renders without throwing (${(error as Error).message})`);
}

ok(html.length > 50_000, `the page has substance (${html.length} chars of markup)`);

/* --------------------------------------------------------- structure */

const SECTIONS = [
  // the five worries, before anything is explained
  "questions",
  "workflow",
  "scenes",
  "visuals",
  "voice",
  "captions",
  "video-studio",
  "effects",
  "before-after",
  "control",
  "no-meter",
  "examples",
  "formats",
  "devices",
  "sources",
  "pricing",
  "start",
];
const rendered = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
for (const id of SECTIONS) ok(rendered.includes(id), `section #${id} is on the page`);
h.eq(rendered.length, SECTIONS.length, "no unexpected sections");
// Order matters: the page is the story.
h.eq(rendered.join(","), SECTIONS.join(","), "sections render in story order");

h.eq((html.match(/<h1/g) || []).length, 1, "exactly one h1");
ok(/<h1[^>]*>From idea to video\.<\/h1>/.test(html), "the h1 is the product promise");
// One per story section, plus the key-art band above them — it carries a
// heading but no anchor, because it is the page opening rather than a stop on
// the way through it.
h.eq((html.match(/<h2/g) || []).length, SECTIONS.length + 1, "every section has one h2");
ok(/id="showpiece-title"/.test(html), "the key-art band names itself");
ok(!/<h[1-4][^>]*><\/h[1-4]>/.test(html), "no empty headings");
ok(/<main id="main"[^>]*>/.test(html), "there is a main landmark");
ok(/<main id="main"[^>]*tabindex="-1"/i.test(html), "the skip link's target can take focus");
ok(/class="mkt-skip" href="#main"/.test(html), "the first link on the page skips the navigation");
ok(html.includes("<footer"), "there is a footer");
ok(html.includes("<nav"), "there is a nav");

/* ------------------------------------------------------------ images */

const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
ok(imgs.length > 20, `${imgs.length} images rendered`);
for (const img of imgs) {
  ok(/\balt="[^"]/.test(img) || /\balt=""/.test(img), `image has an alt attribute: ${img.slice(0, 70)}`);
  ok(/\bwidth="\d+"/.test(img) && /\bheight="\d+"/.test(img), `image reserves space: ${img.slice(0, 70)}`);
  ok(/srcSet=|srcset=/.test(img), `image ships a srcset: ${img.slice(0, 70)}`);
  ok(/decoding="async"/.test(img), `image decodes async: ${img.slice(0, 70)}`);
}
const eager = imgs.filter((img) => img.includes('loading="eager"'));
ok(eager.length <= 1, `at most one eager image (${eager.length}) — everything else waits for the viewport`);
const lazy = imgs.filter((img) => img.includes('loading="lazy"'));
ok(lazy.length >= imgs.length - 3, `${lazy.length} of ${imgs.length} images are lazy`);
// Every referenced file is one the build produced.
const files = new Set([...html.matchAll(/\/marketing\/([a-z0-9-]+\.webp)/g)].map((m) => m[1]));
ok(files.size >= 10, `${files.size} distinct optimised images referenced`);

/* ----------------------------------------------------- interactivity */

const tablists = [...html.matchAll(/role="tablist"[\s\S]{0,4000}?<\/div>/g)];
ok(tablists.length >= 4, `${tablists.length} interactive demonstrations`);
const selected = (html.match(/aria-selected="true"/g) || []).length;
const unselected = (html.match(/aria-selected="false"/g) || []).length;
ok(selected >= 5, `${selected} tabs start selected`);
ok(unselected > selected, "most tabs start unselected — one per group is active");
ok(html.includes('tabindex="-1"'), "roving tab order is in the markup");
ok(!/tabindex="0"[^>]*aria-selected="false"/.test(html), "the focusable tab is the selected one");

/* ---------------------------------------------------------- honesty */

ok(html.includes("Interface shown with example project data"), "interfaces are labelled as demonstrations");
ok(html.includes("Example created for demonstration"), "examples are labelled");
ok(html.includes("Coming soon"), "planned features are labelled on the page");
ok(html.includes("Accounts and billing are not live yet"), "the plan status is stated");
ok(html.includes("own machine"), "where projects live is stated");
ok(html.includes("Pexels") && html.includes("Wikimedia Commons"), "the real visual sources are named");
ok(!/guarantee|go viral|instant success/i.test(html), "no exaggerated claims in the rendered copy");

/* -------------------------------------------------------- integrity */

ok(!html.includes("undefined"), "no 'undefined' leaked into the markup");
ok(!html.includes("NaN"), "no NaN leaked into the markup");
ok(!html.includes("[object Object]"), "no object stringified into the markup");
ok(!/>\s*null\s*</.test(html), "no 'null' rendered as text");
// Buttons are operable and described.
const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
ok(buttons.length > 30, `${buttons.length} controls rendered`);
for (const [whole, inner] of buttons) {
  // A control is named by its text, by aria-label, or by the alt text of the
  // image inside it (the wordmark button in the nav).
  const text = inner.replace(/<[^>]*>/g, "").trim();
  const named =
    text.length > 0 ||
    /aria-label="[^"]+"/.test(whole.slice(0, whole.indexOf(">"))) ||
    /<img[^>]*\balt="[^"]+"/.test(inner);
  ok(named, `every button has a label or accessible name: ${whole.slice(0, 80)}`);
}

/* ------------------------------------------------- navigation aids */

/* Back to top, as it arrives in the first paint: present, out of sight, and
   out of the tab order until scrolling brings it in. */
const totop = html.match(/<button[^>]*class="mkt-totop"[\s\S]*?<\/button>/)?.[0] ?? "";
ok(totop.length > 0, "the rendered page carries a back-to-top control");
ok(!/is-shown/.test(totop), "back-to-top starts hidden, at the top of the page");
ok(/tabindex="-1"/i.test(totop), "back-to-top is not a tab stop while hidden");
ok(/aria-hidden="true"/i.test(totop), "back-to-top is hidden from screen readers too");
ok(/Back to the top of the page/.test(totop), "back-to-top says where it goes");
ok(html.includes('id="main"'), "there is a #main landmark for it to return focus to");

/* The small-screen section menu. */
const toggle = html.match(/<button[^>]*class="[^"]*mkt-nav-toggle[^"]*"[\s\S]*?<\/button>/)?.[0] ?? "";
ok(toggle.length > 0, "the nav carries a section menu toggle");
ok(/aria-expanded="false"/.test(toggle), "the menu starts closed");
ok(/aria-controls="mkt-nav-panel"/.test(toggle), "the toggle names the panel it controls");
ok(/Sections/.test(toggle), "the toggle is labelled, not just an icon");
ok(!/mkt-nav-panel-link/.test(html), "the closed menu renders no links");

/* ------------------------------------------------- artwork on disk */

/* Every image URL in the markup must name a file that exists. The registry
   encodes each asset at its own widths — 640/1280 for photography, 120/240
   for the wordmark, 512/1024 for the key art — so a hard-coded fallback width
   silently points at nothing. This catches that. */
const referenced = [...new Set([...html.matchAll(/\/marketing\/[a-z0-9-]+\.(?:webp|jpg|png)/g)].map((m) => m[0]))];
ok(referenced.length >= 15, `the page references ${referenced.length} image files`);
for (const url of referenced) {
  ok(existsSync(join(repoRoot, "public", url)), `${url} exists on disk`);
}

// And each <img> offers a srcset, so a phone is not sent the desktop encode.
const sized = html.match(/<img\b[^>]*>/g) ?? [];
for (const img of sized) {
  if (!/\/marketing\//.test(img)) continue;
  ok(/srcset=/i.test(img), `image offers responsive widths: ${img.slice(0, 70)}`);
}

h.done("marketing-render");
