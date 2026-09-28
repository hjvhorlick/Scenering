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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const sprite = read("src/components/icons/IconSprite.tsx");
const icon = read("src/components/icons/Icon.tsx");
const css = read("src/shared/icons.css");

const files = execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts'", { cwd: repoRoot, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => !f.includes("/icons/"))
  .map((name) => ({ name, text: read(name) }));

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
  ok(/icoGold|\{\.\.\.gold/.test(body), `${name} carries a gold accent`);
  // A few icons — the warning triangle, the bolt, the star — are gold objects
  // in their own right, so blue is not required, but a body is.
  ok(/icoBlue|icoSteel|icoGold|Disc|\{\.\.\.gold/.test(body), `${name} has a body`);
  ok(/Disc|Base|d="|rect|circle|ellipse|path/.test(body), `${name} actually draws something`);
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
const em = Number(base.match(/width:\s*([\d.]+)em/)?.[1] ?? 0);
ok(em >= 1.6, `icons are ${em}em — about twice the old emoji`);
ok(/margin-block:\s*-[\d.]+em/.test(base), "the line box does not grow to fit them");
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

/**
 * The words a reader actually sees: JSX text nodes plus string literals that
 * read like a sentence. Deliberately not the whole source — renaming a
 * variable or dropping a CSS class is not a copy change, and this has to fail
 * only when the prose moves.
 */
const prose = (text: string): string[] => {
  const stripped = text
    // class lists are not words
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^{}]*(?:\{[^{}]*\})?[^{}]*\})/g, " ")
    // the markup this change introduced, and the emoji it replaced
    .replace(/<Icon glyph=(?:"[^"]*"|\{[^{}]*\})(?:\s+size="\w+")?\s*\/>/g, " ")
    .replace(/<span className="t-ico">(?:[^<]*|\{[^{}]*\})<\/span>/g, " ")
    .replace(/<IconSprite \/>/g, " ")
    .replace(/\biconify\(/g, "(");

  const out: string[] = [];
  // text sitting between tags
  for (const m of stripped.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  // quoted copy: at least two words, so identifiers and ids are skipped
  for (const m of stripped.matchAll(/"([^"\\\n]{4,})"/g)) {
    if (/\s/.test(m[1]) && /[A-Za-z]{2}/.test(m[1]) && !/^[a-z-]+(?: [a-z0-9:/[\]-]+)*$/.test(m[1])) out.push(m[1]);
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
for (const { name } of files) {
  let old: string;
  try {
    old = execSync(`git show ${BEFORE}:${name}`, { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    continue; // the file is new in this change
  }
  const a = prose(old);
  const b = prose(read(name));
  const same = a.length === b.length && a.every((w, i) => w === b[i]);
  ok(same, `${name}: every word is unchanged`);
  compared += 1;
}
ok(compared > 25, `${compared} files compared against ${BEFORE} word for word`);

h.done("icons");
