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
  // Two surfaces under test: the front page (the sales pitch) and the
  // features tour at /features (the full demonstrations that used to crowd
  // the front page).
  stdin: {
    contents:
      'export { default as MarketingSite } from "./src/marketing/MarketingSite";\n' +
      'export { default as PublicPage } from "./src/marketing/PublicPage";\n',
    resolveDir: repoRoot,
    loader: "ts",
  },
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
const { MarketingSite, PublicPage } = await import(pathToFileURL(file).href);

let home = "";
try {
  home = renderToStaticMarkup(createElement(MarketingSite));
  ok(true, "the front page renders without throwing");
} catch (error) {
  ok(false, `the front page renders without throwing (${(error as Error).message})`);
}

let tour = "";
try {
  tour = renderToStaticMarkup(createElement(PublicPage, { path: "/features" }));
  ok(true, "the features tour renders without throwing");
} catch (error) {
  ok(false, `the features tour renders without throwing (${(error as Error).message})`);
}

// Most checks below read both pages at once: between them they carry the
// whole product story, just split into the pitch and the proof.
const html = home + tour;
ok(!/\bAI\b|artificial intelligence|\bneural\b|machine learning/i.test(html), "the rendered marketing pages use TTS language, not AI references");

ok(home.length > 20_000, `the front page has substance (${home.length} chars of markup)`);
ok(tour.length > 25_000, `the features tour has substance (${tour.length} chars of markup)`);

/* --------------------------------------------------------- structure */

// The front page is a sales page: what you can put on a scene, what you get,
// what it costs to run, the plans, the proof, the close — and nothing else.
const HOME_SECTIONS = ["effects", "features", "no-meter", "pricing", "examples", "start"];
const homeRendered = [...home.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
h.eq(homeRendered.join(","), HOME_SECTIONS.join(","), "the front page renders the sales story, in order");

// The features tour carries the demonstrations, opening with the six worries
// (including the device-performance answer), in workflow order.
const TOUR_SECTIONS = [
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
  "formats",
  "devices",
  "sources",
];
const tourRendered = [...tour.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
h.eq(tourRendered.join(","), TOUR_SECTIONS.join(","), "the features tour renders the demonstrations, in order");

h.eq((home.match(/<h1/g) || []).length, 1, "exactly one h1 on the front page");
ok(/<h1[^>]*>Create videos from your ideas\.<\/h1>/.test(home), "the h1 is the product promise");
h.eq((tour.match(/<h1/g) || []).length, 1, "exactly one h1 on the features tour");
// One heading per section, plus the key-art band above them — it carries a
// heading but no anchor, because it is the page opening rather than a stop on
// the way through it.
ok((home.match(/<h2/g) || []).length >= HOME_SECTIONS.length + 1, "every front-page section has a heading");
ok((tour.match(/<h2/g) || []).length >= TOUR_SECTIONS.length, "every tour section has a heading");
ok(/id="showpiece-title"/.test(html), "the key-art band names itself");
ok(!/<h[1-4][^>]*><\/h[1-4]>/.test(html), "no empty headings");
ok(/<main id="main"[^>]*>/.test(html), "there is a main landmark");
for (const path of ["/terms", "/privacy", "/refunds", "/cookies"]) {
  ok(home.includes(`href="${path}"`), `the front page footer renders ${path}`);
  ok(tour.includes(`href="${path}"`), `the standalone page footer renders ${path}`);
}
ok(home.includes("mkt-nav-legal-panel") && tour.includes("mkt-nav-legal-panel"), "both the front page and standalone page headers render the Legal dropdown with the four legal pages");
ok(home.includes("mkt-footer-legal-bar") && home.includes("Legal documents"), "the front page footer renders the legal documents bar");
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
ok(eager.length <= 2, `at most two eager images — the key art and the hero still (${eager.length})`);
const lazy = imgs.filter((img) => img.includes('loading="lazy"'));
ok(lazy.length >= imgs.length - 3, `${lazy.length} of ${imgs.length} images are lazy`);
// Every referenced file is one the build produced.
const files = new Set([...html.matchAll(/\/marketing\/([a-z0-9-]+\.webp)/g)].map((m) => m[1]));
ok(files.size >= 10, `${files.size} distinct optimised images referenced`);

/* ----------------------------------------------------- interactivity */

/*
 * The demonstrations are gone. Every one of them was a fixed-size composition
 * — an app window with a timeline, a results grid, a caption studio — that had
 * to be redesigned for a phone and rebuilt as a second, smaller component.
 * The page is now static small blocks: facts, steps, tiles and samples, the
 * same markup at every width, so nothing here is a tab-driven demo window.
 */
const tabpanels = [...html.matchAll(/role="tabpanel"/g)];
ok(tabpanels.length === 0, "no tab-driven demonstration windows are left on the page");
// The hero keeps its single workspace illustration (the owner asked for it to
// stay exactly as it is); the tour draws no window at all.
ok(!tour.includes("mkt-app-body") && !tour.includes("mkt-tl-view"), "the tour draws no studio window or timeline");
ok(!home.includes("mkt-app-body"), "the front page draws no studio window at all");
ok(html.includes('tabindex="-1"'), "the skip target and closed menus stay out of the tab order");
ok(html.includes("mkt-tiles"), "the tour is built from the small tile block");
ok(html.includes("mkt-facts") && html.includes("mkt-steps-mini"), "…and its fact and step blocks");

/* ---------------------------------------------------------- honesty */

ok(html.includes("Interface shown with example project data"), "interfaces are labelled as demonstrations");
ok(html.includes("Example created for demonstration"), "examples are labelled");
ok(html.includes("Coming soon"), "planned features are labelled on the page");
// The developer note about billing configuration is for administrators, not
// public visitors. The plan cards identify browser-local Piper narration.
ok(!html.includes("Paid checkout requires configured"), "no payment-setup note is shown to visitors");
ok(!html.includes("Google Studio") && !html.includes("free Google key"), "the pricing section no longer promises a Google narration key");
ok(html.includes("with local Piper TTS narration"), "the plans identify Piper TTS as the narration engine");
ok(html.includes("Preview renders do not use final-export allowance"), "preview usage is stated");
ok(html.includes("2-core Celeron with 4 GB RAM"), "the tested low-spec Celeron configuration is visible on the marketing page");
ok(html.includes("persistent render engine"), "the marketing page explains persistent rendering for modest hardware");
ok(html.includes("faster modern PC is recommended"), "the marketing page recommends faster hardware for smoother renders");
ok(html.includes("Pexels") && html.includes("Wikimedia Commons"), "the real visual sources are named");
ok(!/guarantee|go viral|instant success/i.test(html), "no exaggerated claims in the rendered copy");

/* -------------------------------------------------------- integrity */

ok(!html.includes("undefined"), "no 'undefined' leaked into the markup");
ok(!html.includes("NaN"), "no NaN leaked into the markup");
ok(!html.includes("[object Object]"), "no object stringified into the markup");
ok(!/>\s*null\s*</.test(html), "no 'null' rendered as text");
// Buttons are operable and described.
const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
ok(buttons.length >= 5, `${buttons.length} controls rendered`);
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

/* The shared corner menu used by every Scenering surface. */
const toggle = html.match(/<button[^>]*class="[^"]*sc-corner-trigger[^"]*"[\s\S]*?<\/button>/)?.[0] ?? "";
ok(toggle.length > 0, "the page carries the shared corner menu toggle");
ok(/aria-expanded="false"/.test(toggle), "the corner menu starts closed");
ok(/aria-controls="sc-corner-panel"/.test(toggle), "the toggle names the panel it controls");
ok(/Menu/.test(toggle), "the corner toggle is labelled, not just an icon");
ok(!/id="sc-corner-panel"/.test(html), "the closed corner menu renders no panel");

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
