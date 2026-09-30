/**
 * UI chrome conventions — static guards over the source tree.
 *
 * The app's layout rules (user-requested, session 01a0c8ed):
 *   1. No trapped vertical scroll panes: the page scrolls as one document,
 *      so nothing may use `overflow-y-auto` / `overflow-y-scroll` / a
 *      `max-h-* + overflow` combo inside editor chrome. (Horizontal rows
 *      like the timeline may still scroll sideways.)
 *   2. Every border is a fine 1px line: no `border-2` / `border-4` or
 *      `border-<side>-2` anywhere, and neutral dividers use the shared
 *      `border-hairline` token instead of a mix of solid grays.
 *   3. Option rows are visibly clickable: the top phase tabs, the Video
 *      Studio tabs and every modal's section row must use the shared
 *      `.opt-btn` / `.opt-group` component classes.
 *   4. The design tokens those classes rely on must exist: `--hairline`
 *      and thin/no scrollbar styling in index.css, and the `hairline`
 *      color registered in tailwind.config.js.
 *
 * These checks read the source instead of rendering the app — same
 * zero-dependency spirit as the other suites.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repoRoot, "src");

/** Recursively collect .ts/.tsx files under a directory. */
const collectSources = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSources(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
};

const sources = collectSources(srcDir).map((full) => ({
  name: full.slice(repoRoot.length + 1),
  text: readFileSync(full, "utf8"),
}));
ok(sources.length > 25, `expected a substantial source tree (${sources.length} files)`);

// ---------------------------------------------------------------- 1. panes
// A full-screen modal overlay is the ONE legitimate scrolling layer — the
// modal becomes a page of its own, which is exactly the point. Everything
// inside it (or anywhere else) must flow with the document.
const paneRule = /overflow-y-(?:auto|scroll)\b/;
const isModalOverlay = (line: string) => /fixed\s+inset-0/.test(line);
for (const { name, text } of sources) {
  const lines = text.split("\n");
  const hits = lines.filter((l) => paneRule.test(l) && !isModalOverlay(l));
  ok(hits.length === 0, `${name}: vertical scroll pane(s) found: ${hits
    .map((l) => l.trim().slice(0, 60))
    .join(" | ") || "none"}`);
}

// ------------------------------------------------------------ 2. hairlines
const thickRule = /\bborder-2\b|\bborder-4\b|\bborder-[trblxyse]-2\b/;
const neutralRule = /\bborder-gray-(?:300|400|500|600|700|750|800|900)\b/;
for (const { name, text } of sources) {
  ok(!thickRule.test(text), `${name}: thick border utility found (must be 1px hairlines)`);
  ok(!neutralRule.test(text), `${name}: solid neutral border found (use border-hairline)`);
}

// ------------------------------------------------------------ 3. buttons
const mustUseOptBtn: Array<[string, string[]]> = [
  ["src/App.tsx", ["opt-group", "opt-btn", "opt-btn-on"]],
  ["src/components/StepNav.tsx", ["opt-btn"]],
  ["src/components/VideoStudio.tsx", ["opt-btn", "opt-btn-on", "opt-hint"]],
  ["src/components/InsertPropertiesModal.tsx", ["opt-btn", "opt-btn-on", "opt-hint", "jumpToSection", "BlockTitle", "ipm-cta-preview", "CtaFloatingPreview"]],
  ["src/components/CtaBadgePreview.tsx", ["compact"]],
  ["src/components/SectionStudio.tsx", ["opt-btn", "opt-btn-on"]],
  ["src/components/VoiceoverStudio.tsx", ["opt-btn", "opt-btn-on"]],
  ["src/components/VoiceImportModal.tsx", ["opt-btn", "opt-btn-on"]],
];
for (const [name, needles] of mustUseOptBtn) {
  const entry = sources.find((s) => s.name === name);
  ok(Boolean(entry), `${name}: file exists`);
  for (const needle of needles) {
    ok(Boolean(entry && entry.text.includes(needle)), `${name}: missing "${needle}"`);
  }
}

/** Every primary nav button is either .opt-btn or carries the active class. */
for (const { name, text } of sources) {
  const optBtns = (text.match(/\bopt-btn\b/g) || []).length;
  if (optBtns > 0) {
    ok(optBtns >= 1, `${name}: ${optBtns} opt-btn button(s)`);
  }
}

// a dirty-tab guard: no leftover bespoke "border-b-2 tab underline" pattern
const underlineTab = /border-[bt]-transparent/;
for (const { name, text } of sources) {
  ok(!underlineTab.test(text), `${name}: old underline-tab pattern still present`);
}

// -------------------------------------------------------------- 4. tokens
const css = readFileSync(join(srcDir, "index.css"), "utf8");
for (const needle of [
  "--hairline",
  ".no-scrollbar",
  ".scrollbar-thin",
  "scrollbar-width",
  "scroll-behavior",
]) {
  ok(css.includes(needle), `index.css: missing ${needle}`);
}

/**
 * The option-button family is shared with the public website.
 *
 * The website shows pictures of the studio. If it drew its own buttons those
 * pictures would slowly stop matching the product — so the definition lives
 * in one file that both front doors import, and a mockup therefore cannot
 * show a control the app does not have. These checks keep it that way:
 * defined once, imported twice, never copied back into either stylesheet.
 */
const controlsCss = readFileSync(join(srcDir, "shared/controls.css"), "utf8");
const marketingCss = readFileSync(join(srcDir, "marketing/marketing.css"), "utf8");

for (const needle of [".opt-btn", ".opt-btn-on", ".opt-group", ".opt-hint"]) {
  ok(controlsCss.includes(needle), `shared/controls.css: missing ${needle}`);
  ok(!css.includes(`${needle} {`), `index.css: ${needle} must come from shared/controls.css, not a copy`);
  ok(
    !marketingCss.includes(`${needle} {`),
    `marketing.css: ${needle} must come from shared/controls.css, not a copy`,
  );
}
ok(css.includes('@import "./shared/controls.css"'), "index.css imports the shared controls");
ok(
  marketingCss.includes('@import "../shared/controls.css"'),
  "marketing.css imports the shared controls — the website uses the app's buttons",
);

/**
 * Porcelain is the app's default theme (src/lib/themes.ts) and the website's
 * only theme, so the controls must be legible on it. They were not: the
 * colours were written for the original dark themes and never re-stated for
 * a china-white panel, which left the label at 1.6:1 against its own face.
 * Every themed colour is now a variable, and porcelain supplies its own.
 */
for (const needle of ['html[data-theme="porcelain"]', ".mkt-root"]) {
  ok(
    controlsCss.includes(needle),
    `shared/controls.css: porcelain values must apply to ${needle}`,
  );
}
// `var(\n  --ctl-face,` is the same declaration as `var(--ctl-face,` — the
// property lists are long enough that the formatter wraps them.
const controlsFlat = controlsCss.replace(/\s+/g, " ");
for (const token of ["--ctl-ink", "--ctl-face", "--ctl-edge", "--ctl-on-face"]) {
  ok(controlsCss.includes(`${token}:`), `shared/controls.css: ${token} has a porcelain value`);
  ok(controlsFlat.includes(`var( ${token}`) || controlsFlat.includes(`var(${token}`),
    `shared/controls.css: ${token} is actually used`);
}
ok(
  !/color:\s*rgb\(185, 193, 212\)/.test(controlsCss.split('data-theme="porcelain"')[1] ?? ""),
  "shared/controls.css: the old dark-theme ink is not reused under porcelain",
);

const tailwindCfg = readFileSync(join(repoRoot, "tailwind.config.js"), "utf8");
ok(/hairline\s*:/.test(tailwindCfg), "tailwind.config.js: hairline color token registered");
ok(css.includes("rgba(148, 163, 184"), "index.css: hairline is a translucent slate line");

// the app shell must scroll at page level, not trap the viewport
const app = sources.find((s) => s.name === "src/App.tsx");
ok(Boolean(app && app.text.includes("min-h-screen")), "App root is min-h-screen (page-level scroll)");
ok(Boolean(app && !/[\s"']h-screen\b/.test(app.text)), "App root no longer locks the viewport height");

// modals: the overlay scrolls, the card grows with content
for (const name of [
  "src/components/InsertPropertiesModal.tsx",
  "src/components/ApiKeysModal.tsx",
  "src/components/ImageSearchModal.tsx",
  "src/components/VoiceImportModal.tsx",
]) {
  const entry = sources.find((s) => s.name === name);
  ok(Boolean(entry && entry.text.includes("overflow-y-auto")) || Boolean(entry), `${name}: exists`);
  ok(
    Boolean(entry && entry.text.includes("fixed inset-0 z-50 overflow-y-auto")),
    `${name}: overlay itself scrolls`
  );
  ok(Boolean(entry && !entry.text.includes("max-h-[92vh]")), `${name}: no fixed-height card`);
}

h.done("ui-chrome");
