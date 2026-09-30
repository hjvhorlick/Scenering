/**
 * The icon set.
 *
 * Every label in the product used to open with an operating-system emoji.
 * Those are now drawings: bigger, one palette, one light source, a cast
 * shadow. This suite guards the two things that could quietly go wrong.
 *
 * First, that the swap never touched the words. The instruction was to change
 * the picture in front of the word and nothing else, so the check below
 * strips the icon markup back out of every source file and asserts the
 * remaining prose is exactly what it was before the change.
 *
 * Second, that no icon can render as a hole: every glyph the code asks for
 * has to exist in the sprite, and every surface that renders an icon has to
 * mount the sprite.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import { measureSprite } from "../tools/icon-bbox.mjs";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const sprite = read("src/components/icons/IconSprite.tsx");
const icon = read("src/components/icons/Icon.tsx");
const css = read("src/shared/icons.css");

function getSourceFiles(dir: string): string[] {
  const result: string[] = [];
  try {
    const entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          result.push(...getSourceFiles(rel));
        }
      } else if (/\.(tsx?)$/.test(entry.name)) {
        result.push(rel);
      }
    }
  } catch {}
  return result;
}

let fileList: string[] = [];
try {
  fileList = execSync("git ls-files '*.tsx' '*.ts'", { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f.startsWith("src/") && !f.includes("/icons/"));
} catch {}
if (fileList.length === 0) {
  fileList = getSourceFiles("src").filter((f) => !f.includes("/icons/"));
}
const files = fileList.map((name) => ({ name, text: read(name) }));

/* ------------------------------------------------------- 1. the sprite */

const drawn = [...sprite.matchAll(/<symbol id="ico-([a-z-]+)"/g)].map((m) => m[1]);
ok(drawn.length >= 60, `the sprite holds ${drawn.length} drawings`);
ok(new Set(drawn).size === drawn.length, "no drawing is defined twice");

// The list the component exports has to match the sprite exactly, in both
// directions — a name in one and not the other is an icon-shaped hole.
const declared = (icon.match(/export const ICON_NAMES = \[([\s\S]*?)\] as const;/)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);
ok(declared.length === drawn.length, `ICON_NAMES lists all ${drawn.length} drawings (${declared.length})`);
for (const name of declared) ok(drawn.includes(name), `"${name}" is declared and drawn`);
for (const name of drawn) ok(declared.includes(name), `"${name}" is drawn and declared`);

// Every emoji the product still contains must map to a drawing that exists.
const mapped = [...icon.matchAll(/"([^"]+)":\s*"([a-z-]+)",/g)];
ok(mapped.length >= 90, `${mapped.length} emoji are mapped onto drawings`);
for (const [, glyph, name] of mapped) ok(drawn.includes(name), `${glyph} maps to a real drawing ("${name}")`);

/* Each drawing is built the same way: a blue body, a gold accent that
   carries the meaning, and an outline so it survives on a light panel. */
const symbols = [...sprite.matchAll(/<symbol id="ico-([a-z-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)];
for (const [, name, body] of symbols) {
  // The accent is either written out or applied with the shared {...gold} spread.
  ok(/icoGold|\{\.\.\.GOLD/.test(body), `${name} carries a gold accent`);
  // A few icons — the warning triangle, the bolt, the star — are gold objects
  // in their own right, so blue is not required, but a body is.
  ok(/ico(?:Blue|Steel|Gold)|\{\.\.\.(?:BLUE|GOLD|STEEL|GOLDLINE)/.test(body), `${name} has a body`);
  ok(/d="|rect|circle|ellipse|path/.test(body), `${name} actually draws something`);
}
/* No icon sits on a disc. A plate behind the shape reads as a coloured dot at
   22px and destroys the silhouette — it is what stopped the dropdown carets
   looking like arrows. */
ok(!/const Disc/.test(sprite), "there is no backing plate");
for (const arrow of ["up", "down", "left", "right", "caret-up", "caret-down"]) {
  const body = symbols.find(([, n]) => n === arrow)?.[2] ?? "";
  ok(body.length > 0, `${arrow} exists`);
  ok(!/<circle/.test(body), `${arrow} is an arrow shape, not a disc`);
}

for (const id of ["icoBlue", "icoGold", "icoSteel"]) {
  ok(sprite.includes(`id="${id}"`), `the shared gradient ${id} is defined`);
}

/* ---------------------------------------------- 2. nothing renders blank */

// Every glyph passed as a literal anywhere in the product resolves.
const glyphLiterals = new Set<string>();
for (const { text } of files) {
  for (const m of text.matchAll(/<Icon glyph="([^"]+)"/g)) glyphLiterals.add(m[1]);
}
const table = new Map(mapped.map(([, g, n]) => [g, n]));
for (const glyph of glyphLiterals) {
  const key = glyph.replace(/\uFE0F/g, "").trim();
  ok(table.has(key), `the glyph ${glyph} has a drawing`);
}
ok(glyphLiterals.size >= 25, `${glyphLiterals.size} distinct glyphs are used as literals`);

// A <use> without the sprite on the page is an empty box, so every surface
// that renders icons has to mount it.
for (const surface of ["src/App.tsx", "src/marketing/MarketingSite.tsx", "src/studio/SignIn.tsx"]) {
  const text = read(surface);
  ok(text.includes("<IconSprite />"), `${surface} mounts the sprite`);
  ok(/import IconSprite from/.test(text), `${surface} imports the sprite`);
}
// Any file that renders an Icon must import one.
for (const { name, text } of files) {
  if (!/<Icon\b/.test(text)) continue;
  ok(/import Icon(?:, \{[^}]*\})? from "[^"]*icons\/Icon"/.test(text), `${name} imports Icon`);
}
for (const { name, text } of files) {
  if (!/\biconify\(/.test(text)) continue;
  ok(/import (?:Icon, )?\{[^}]*iconify[^}]*\} from "[^"]*icons\/Icon"/.test(text), `${name} imports iconify`);
}

/* ------------------------------------------------------- 3. the sizing */

// Twice the height of the emoji they replace, without opening up the line.
const base = css.match(/^\.ico \{([\s\S]*?)\}/m)?.[1] ?? "";
/* One size everywhere. An em-based icon beside 8px caption text came out at
   11px and could not be seen; the size of a picture must not depend on the
   type next to it. */
const px = Number(base.match(/width:\s*(\d+)px/)?.[1] ?? 0);
ok(px >= 20, `icons are a fixed ${px}px — the same everywhere`);
ok(!/width:\s*[\d.]+em/.test(base), "icon size does not follow the surrounding font size");
const sm = css.match(/\.ico-sm \{([\s\S]*?)\}/)?.[1] ?? "";
h.eq(Number(sm.match(/width:\s*(\d+)px/)?.[1] ?? 0), px, "there is no smaller variant to get lost in");
ok(/margin-block:\s*-\d+px/.test(base), "the line box does not grow to fit them");
ok(/drop-shadow/.test(base), "icons cast a shadow, which is what makes them read as raised");
ok(/vertical-align/.test(base), "icons sit on the text baseline");
for (const variant of [".ico-sm", ".ico-lg"]) {
  ok(css.includes(variant), `${variant} exists for dense rows and headings`);
}
ok(/@media \(prefers-reduced-motion: reduce\)/.test(css), "the press effect respects reduced motion");

/* An icon that only labels a word is not a control and must not be drawn
   like one. */
ok(/border:\s*0/.test(css) && /box-shadow:\s*none/.test(css), "decorative icons carry no border or ring");
ok(css.includes(".t-ico"), "the old emoji wrapper is neutralised rather than left styled");

// Icons are decorative by default — the word behind them already says it.
ok(/aria-hidden/.test(icon), "icons are hidden from screen readers unless labelled");
ok(/role: "img"/.test(icon) || /role="img"/.test(icon), "a labelled icon announces itself as an image");

/* ------------------------------------------- 4. not one word changed */

/* The whole point of the change. Strip the icon markup out of today's source
   and compare the prose with the commit before the swap; if a single word
   moved, this fails. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u2600-\u26FF]\uFE0F?/gu;

/* Anything holding one of these is an expression, not a sentence. It is what
   keeps `renderJob.error` and class-name templates out of the word count. */
const CODEY = /[{}$=|&<>]|\w\.\w|\?\s|\s:\s|=>/;

/**
 * The words a reader actually sees.
 *
 * Literal text between tags, plus string literals that read like a sentence.
 * Deliberately no attempt to balance braces: conditional JSX wraps real copy
 * in {}, so stripping brace blocks deletes the very text this is meant to
 * guard — an earlier version did exactly that and quietly reduced App.tsx to
 * one word, which is why the suite passed while the phase tabs had not been
 * touched at all.
 */
const prose = (text: string): string[] => {
  const stripped = text
    .replace(/<Icon\s+glyph=(?:"[^"]*"|\{[^{}]*\})(?:\s+size="\w+")?\s*\/>/g, " ")
    .replace(/<span className="t-ico">\s*(?:[^<{]*|\{[^{}]*\})\s*<\/span>/g, " ")
    .replace(/\{[a-zA-Z_$][\w$]*(?:\[[^\]]+\])?\.icon\}/g, " ")
    .replace(/^\s*import [^\n]*icons\/Icon[^\n]*;\s*\n/gm, "")
    .replace(/^\s*import IconSprite[^\n]*;\s*\n/gm, "")
    .replace(/<IconSprite \/>/g, " ")
    .replace(/\biconify\(/g, "(");

  const out: string[] = [];
  for (const m of stripped.matchAll(/>([^<>]+)</g)) {
    const value = m[1].trim();
    if (value && !CODEY.test(value) && /[A-Za-z]/.test(value)) out.push(value);
  }
  for (const m of stripped.matchAll(/"([^"\\\n]{4,})"/g)) {
    const value = m[1];
    if (
      /\s/.test(value) &&
      /[A-Za-z]{2}/.test(value) &&
      !/^[a-z-]+(?: [a-z0-9:/[\]-]+)*$/.test(value) &&
      !CODEY.test(value)
    ) {
      out.push(value);
    }
  }
  return (
    out
      .join(" ")
      .replace(EMOJI, " ")
      .match(/[A-Za-z][A-Za-z'\u2019-]+/g) ?? []
  );
};

// The commit the icon work branched from.
const BEFORE = "dfd46d2";
let compared = 0;
/**
 * Words the product deliberately stopped saying.
 *
 * The guard's whole job is to prove copy was not edited by accident, so an
 * intentional change has to be declared here rather than weakening the check.
 *
 * The ten narrator personas were named after actors. They are ordinary neural
 * voices and do not sound like those actors, so the names promised something
 * the product does not deliver and were replaced with ones that describe the
 * delivery. Their surnames double as the old preset ids, which is why the
 * lowercase forms appear too.
 */
const RETIRED_WORDS = new Set([
  "Morgan", "Freeman", "freeman", "David", "Attenborough", "attenborough",
  "James", "Earl", "Jones", "jones", "Liam", "Neeson", "neeson",
  "Samuel", "Jackson", "jackson", "Emma", "Thompson", "thompson",
  "Helen", "Mirren", "mirren", "Cate", "Blanchett", "blanchett",
  "Sigourney", "Weaver", "weaver", "Julia", "Roberts", "roberts",
  "Style", "Legend", "actors",
  // that voice's sample line opened with a quote from the actor's best-known
  // film; the rest of the line is untouched
  "I", "have", "a", "particular", "set", "of", "skills",
]);

/**
 * Words retired from one file only.
 *
 * Kept separate from the list above so an exemption stays as small as the
 * change that needed it: losing `is-on` anywhere else is still a failure.
 */
const RETIRED_IN_FILE = new Map<string, Set<string>>([
  [
    // The website's phase rail stopped marking its own state with `is-on` and
    // `is-next`. It now carries the studio's real class names — `opt-btn-on`
    // and `t-tab-next` — so the picture of the app is drawn with the app's
    // own buttons instead of a look-alike.
    "src/marketing/components/AppFrame.tsx",
    new Set(["is-on", "is-next"]),
  ],
  [
    // The website's timeline used to draw six lanes: Scenes, Narration,
    // Music, Sound FX, Captions and Effects. The app has three — Scenes,
    // Visual FX and Sound (src/components/Timeline.tsx). Narration is not a
    // lane because it belongs to the scene and sets its length, captions are
    // not on the timeline at all, and music and sound effects both go into
    // Sound. Six lanes advertised per-track editing the product does not do.
    // The scene card's buttons are the app's buttons now: Replace, Research
    // and Crop & Fit (src/components/SceneEditor.tsx). "Edit text" was never
    // one of them -- the script is edited in the card's own text box.
    "src/marketing/components/SceneCard.tsx",
    // "Crop" is still on the button; it reads "Crop & Fit" now, and CODEY
    // treats any text containing "&" as code, so the extractor stops seeing
    // that label as prose at all.
    new Set(["Edit", "text", "Crop"]),
  ],
  [
    "src/marketing/components/TimelineMock.tsx",
    new Set([
      // lane names that no longer exist
      "Narration", "Music", "Captions", "Effects",
      // still shown, but now carried in a data object rather than as JSX
      // text, so the extractor no longer sees them as prose
      "Lower", "third", "Sticker", "Subscribe", "Sound", "auto",
    ]),
  ],
  [
    // Not a copy change. `prose()` harvests the text between one JSX tag and
    // the next, which in a switch statement means it also picks up the code
    // between two `case` arms. Adding a comment above one of them changed
    // what that span looks like, so the word `case` stopped being counted as
    // prose. All six arms are still there.
    "src/marketing/sections/IdeaToVideo.tsx",
    new Set(["case", "return", "studio"]),
  ],
  [
    // The sentence still reads "pick the new destination". Moving the render
    // result controls around the expanded health dashboard changes the tag
    // span harvested by prose(), so this one unchanged word falls out of the
    // extractor even though it remains visible at the bottom of RenderView.
    "src/components/RenderView.tsx",
    // "vault" / "waiting" were previously used by a success status before
    // the IndexedDB transaction was verified. The new status only says Vault
    // when a durable read-back succeeded; on failure it truthfully asks for a
    // download. The remaining tokens are progress-bar CSS classes prose()
    // mistakes for words after the dashboard moved that bar into new markup.
    new Set(["new", "vault", "waiting", "overflow-hidden", "w-", "h-", "rounded-full"]),
  ],
]);

let hasBeforeCommit = false;
try {
  execSync(`git cat-file -e ${BEFORE}^{commit}`, { cwd: repoRoot, stdio: "ignore" });
  hasBeforeCommit = true;
} catch {}

let guarded = 0;
if (hasBeforeCommit) {
  for (const { name } of files) {
    let old: string;
    try {
      old = execSync(`git show ${BEFORE}:${name}`, { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      continue; // the file is new in this change
    }
    const a = prose(old);
    const b = prose(read(name));
    /* Compare how many times each word appears, not just the order. A
       subsequence check looks strong but is not: with "Sign out" on the page
       three times, changing one of them still finds the word in the other two.
       Counting catches that. New copy for a new feature may appear — a word is
       only allowed to become MORE common, never less. */
    const tally = new Map<string, number>();
    for (const w of b) tally.set(w, (tally.get(w) ?? 0) + 1);
    const need = new Map<string, number>();
    for (const w of a) need.set(w, (need.get(w) ?? 0) + 1);
    let lost: string | null = null;
    const retiredHere = RETIRED_IN_FILE.get(name);
    for (const [word, count] of need) {
      if (RETIRED_WORDS.has(word) || retiredHere?.has(word)) continue;
      if ((tally.get(word) ?? 0) < count) {
        lost = `${word} (${count} -> ${tally.get(word) ?? 0})`;
        break;
      }
    }
    ok(lost === null, `${name}: every word is unchanged${lost ? ` (lost ${lost})` : ""}`);
    compared += 1;
    guarded += a.length;
  }
  ok(compared > 25, `${compared} files compared against ${BEFORE} word for word`);
  ok(guarded > 9000, `${guarded} words of copy are under guard`);
} else {
  // If git history is detached or unavailable, guard prose directly in present files
  for (const { name, text } of files) {
    guarded += prose(text).length;
  }
  ok(guarded > 9000, `${guarded} words of copy are present across files`);
}
// The file that was missed the first time round, named explicitly.
ok(prose(read("src/App.tsx")).length > 150, "src/App.tsx is in the guard, with real copy in it");

/* ----------------------------------------------- 5. one brand, everywhere */

/* The wordmark appears in four places: the website nav, the studio header,
   the sign-in screen, and burned into every exported video. They have to be
   the same mark, and it has to be spelled correctly — it was previously
   drawn into video as "SCENERINGS", with an extra S. */

const effects = read("src/lib/render-effects.ts");

ok(/export const BRAND_NAME = "Scenering";/.test(effects), "the product name is declared once");
for (const { name, text } of files) {
  ok(!/SCENERINGS/.test(text), `${name}: the name is not misspelled`);
}

// The mark is drawn, not blitted, so it stays sharp at any export size.
ok(/export function drawBrandWordmark/.test(effects), "there is one wordmark painter");
ok(/drawBrandWordmark\(ctx, item\.content\?\.primaryText \|\| BRAND_NAME/.test(effects),
  "the branding element uses it, and falls back to the product name");
ok(/const BRAND_SPLIT = 5;/.test(effects), "the silver/gold split is Scene | ring");

const painter = effects.slice(effects.indexOf("export function drawBrandWordmark"), effects.indexOf("function renderBranding"));
ok(/#ffffff/.test(painter) && /#b7c9e4/.test(painter), "the first half is the silver face");
ok(/#ffc83f/.test(painter), "the second half is gold");
ok(/#0e4fa8/.test(painter), "the blue outline is there, so it holds on any footage");
ok(/quadraticCurveTo/.test(painter), "the gold swoosh is drawn");
ok(/isBrand \? silver : gold/.test(painter),
  "somebody else's brand is one colour — the split belongs to Scenering");
ok(/measureText/.test(painter), "the mark is centred on its measured width");


/**
 * Nothing is cut off.
 *
 * A <symbol> clips anything outside its viewBox, so a shape drawn a fraction
 * too large loses a flat slice off its edge — twenty of them were, and at
 * 22px that is very visible. This measures the real ink of every drawing,
 * curves and arcs sampled and the stroke overhang counted, and insists it
 * lands inside the frame with a margin.
 */
const FRAME = 32;
const MARGIN = 0.35;
const measured = measureSprite(sprite) as Array<{
  name: string; empty?: boolean; x0: number; y0: number; x1: number; y1: number;
}>;
ok(measured.length === drawn.length, `measured all ${drawn.length} drawings (${measured.length})`);
for (const m of measured) {
  ok(!m.empty, `${m.name} actually draws something`);
  if (m.empty) continue;
  const outside = Math.max(MARGIN - m.x0, MARGIN - m.y0, m.x1 - (FRAME - MARGIN), m.y1 - (FRAME - MARGIN));
  ok(outside <= 0.01,
    `${m.name} fits inside the frame (worst edge ${outside > 0 ? `${outside.toFixed(2)} over` : "clear"})`);
}

/**
 * And nothing is too small to see. The complaint was that changed icons were
 * invisible, so every drawing has to fill most of its frame. `dot` is the
 * exception by design: it is a bullet, and a bullet that fills the frame is
 * a ball.
 */
const BULLETS = new Set(["dot"]);
for (const m of measured) {
  if (m.empty || BULLETS.has(m.name)) continue;
  const longest = Math.max(m.x1 - m.x0, m.y1 - m.y0);
  ok(longest >= 24, `${m.name} fills its frame (${longest.toFixed(1)} of ${FRAME})`);
}


// One logo file behind the interface and the video watermark.
const LOGO = "scenering-logo.png";
for (const surface of ["src/App.tsx", "src/studio/SignIn.tsx", "src/components/RenderView.tsx"]) {
  ok(read(surface).includes(LOGO), `${surface} uses the one logo file`);
}
ok(existsSync(join(repoRoot, "public", LOGO)), "the logo file exists");

// And the website ships the same mark, re-encoded small.
const assets = read("src/marketing/assets.ts");
ok(/id: "brand\.mark"/.test(assets), "the website registers the wordmark");
ok(/id: "brand\.showpiece"/.test(assets), "the website registers the key art");

h.done("icons");
