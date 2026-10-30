/**
 * The PayPal checkout dialog has to be visible on the page that opens it.
 *
 * This suite exists because of a checkout that opened and could not be seen.
 * The dialog is portalled into `document.body`, so it is mounted by whichever
 * surface the member clicked "Subscribe" on — and the two surfaces ship
 * different stylesheets. The studio's App imports `src/index.css`, so the
 * Tailwind build is in the document; the public website's MarketingSite
 * imports only `marketing.css`, and the Tailwind stylesheet rides along with
 * the App and admin chunks, which a marketing page never loads.
 *
 * The dialog was written with the studio's utility classes. On /pricing it
 * therefore rendered with no CSS at all: the overlay was not fixed or
 * full-screen, the panel had no background, and the whole thing was appended
 * after the footer — below the fold on a white page. The subscribe button did
 * nothing a visitor could see, while the identical markup looked correct from
 * the account modal, where the utilities do exist.
 *
 * The rule that follows from it: a component that portals out of the React
 * tree cannot borrow the host page's stylesheet. Everything it is styled with
 * must ship with the component. These checks read the source, so they fail the
 * moment a utility class is reintroduced without a rule of its own to back it.
 */
import { readFileSync } from "node:fs";
import { createHarness } from "./harness";

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const dialog = read("src/components/PayPalSubscriptionDialog.tsx");
const css = read("src/components/paypal-checkout.css");

/* ------------------------------------------------- the classes it uses */

/**
 * Every class name in the dialog's markup, from `className="a b"` and from
 * `className={`a ${…}`}`. Template expressions are dropped: what is
 * interpolated is the state modifier, which is listed below by name.
 */
function classesUsed(): string[] {
  const found = new Set<string>();
  for (const match of dialog.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = (match[1] ?? match[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
    raw.split(/\s+/).filter(Boolean).forEach((name) => found.add(name));
  }
  return [...found].sort();
}

/** The state modifiers the template literals interpolate into `ppc-status`/`ppc-btn`. */
const stateModifiers = ["is-warn", "is-good", "is-bold", "is-primary"];

const used = [...classesUsed(), ...stateModifiers];
h.ok(used.length > 10, `the dialog declares a real set of classes (${used.length})`);

/** Whether the component's own stylesheet defines a class. */
const definedInOwnCss = (name: string) =>
  new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(css);

for (const name of used) {
  h.ok(definedInOwnCss(name), `the dialog's own stylesheet defines .${name}`);
}

/* ------------------------------------------- it carries that stylesheet */

h.ok(
  dialog.includes('import "./paypal-checkout.css"'),
  "the dialog imports its own stylesheet, so the CSS travels with the component",
);

/* Self-contained: no `@apply`, no Tailwind directives and no Tailwind custom
   properties. Any of those would need the Tailwind build present — exactly the
   thing a marketing page does not load. */
h.ok(!/@apply\b/.test(css), "the stylesheet uses no @apply");
h.ok(!/@tailwind\b/.test(css), "the stylesheet uses no @tailwind directives");
h.ok(!/var\(--tw-/.test(css), "the stylesheet uses no Tailwind custom properties");

/* No Tailwind preflight on the website either, so the box model has to be
   stated rather than assumed: these are the declarations whose absence turned
   the dialog into invisible markup. */
const rule = (selector: string) => {
  const start = css.indexOf(selector);
  h.ok(start > -1, `${selector} is styled`);
  const body = css.slice(start, css.indexOf("}", start));
  return body;
};

const overlay = rule(".ppc-overlay");
h.ok(/position:\s*fixed/.test(overlay), "the backdrop is fixed to the viewport, not in the page flow");
h.ok(/inset:\s*0/.test(overlay), "the backdrop covers the whole viewport");
h.ok(/z-index:\s*\d+/.test(overlay), "the backdrop stacks above the surfaces that open it");
h.ok(/display:\s*flex/.test(overlay), "the backdrop centres the dialog card");

const panel = rule(".ppc-panel");
h.ok(/background:\s*#/.test(panel), "the card has its own background, not the page's");
h.ok(/border-radius:\s*\d/.test(panel), "the card is rounded on its own, without a preflight reset");
h.ok(/box-sizing:\s*border-box/.test(panel), "the card sizes itself without a preflight reset");
h.ok(/font-family:/.test(panel), "the card names its font instead of inheriting the marketing page's");

/* ------------------------------------------------- both entry points */

h.ok(
  read("src/marketing/PublicPage.tsx").includes("PayPalSubscriptionDialog"),
  "the pricing page still opens this dialog — the surface where it was invisible",
);
h.ok(
  read("src/components/AccountMembershipModal.tsx").includes("PayPalSubscriptionDialog"),
  "the account modal still opens the same dialog",
);

/* ------------------------------------------------- honest failure copy */

/* Comments in this codebase quote the copy they replaced, and the history is
   worth keeping — so these checks read the code only. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* When checkout is refused, the message must name the reason the server gave.
   A `production` special case used to answer every failure with a sentence
   about which host the Sandbox runs on — untrue on the live site, and it
   talked over the variable that was actually missing. */
const dialogCode = withoutComments(dialog);
h.ok(!dialogCode.includes("development or preview host"), "the dialog reports the server's gaps, not a host guess");
h.ok(
  dialogCode.includes("Still to set: ${gaps.join(\"; \")}"),
  "the dialog names the variables still to set",
);

for (const file of ["src/marketing/PublicPage.tsx", "src/components/AccountMembershipModal.tsx"] as const) {
  const source = withoutComments(read(file));
  h.ok(!source.includes("not on the live site"), `${file} does not blame the host for a configuration gap`);
  h.ok(!source.includes("Production billing has not been enabled"), `${file} does not report a false reason`);
  h.ok(source.includes("missing?.length"), `${file} leads with the server's own reasons`);
}

h.done("PayPal checkout dialog styling");
