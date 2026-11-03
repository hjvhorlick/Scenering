/**
 * Advertising configuration — Google AdSense, deliberately inert by default.
 *
 * Nothing in this file (or AdSlot) renders, loads a script, or reserves any
 * layout space until the operator configures a publisher id and at least one
 * ad-unit slot at build time:
 *
 *   VITE_ADSENSE_CLIENT_ID      ca-pub-XXXXXXXXXXXXXXXX
 *   VITE_ADSENSE_SLOT_WEB       slot id for the one public-webpage unit
 *   VITE_ADSENSE_SLOT_STUDIO    slot id for the studio side rails (free plan)
 *
 * Build-time (VITE_) values are the only honest place for these: an ad unit
 * is public by design (it ships in the page), so no Worker secret is needed
 * and ads add zero Worker requests — the browser talks to Google directly.
 *
 * Placement rules, as agreed with the product owner:
 *  - Public webpages: ONE responsive unit directly below the hero — the
 *    first quiet pause on the page — never inside the hero itself, beside
 *    the pricing decision or over a demonstration.
 *  - Studio: free plan only, Setup and Render pages only, as fixed side
 *    rails fitted just outside the centred workspace's borders, below the
 *    header and the corner-menu row (plus 80 px of clearance) — each side
 *    shows only when its own margin is genuinely unused and wide enough to
 *    hold the rail (all measured at runtime, no fixed viewport-width wall) —
 *    never over the canvas, the timeline, or any editing surface, and never
 *    on mobile, where no margin could ever fit one. The corner menu
 *    (z-200) stays above the rails (z-30) at all times.
 *  - Paid plans (sceneflow/sceneforge), the owner-admin plan preview of a
 *    paid plan, and every other studio step: no ads at all.
 */

export type AdsenseSlotKind = "web" | "studio";

/**
 * The id of Google's AdSense loader in the page. The build writes it into every
 * page's <head> (src/marketing/seo-head.ts), and AdSlot reuses the same id when
 * it loads the script lazily — so a page carries one loader, never two.
 */
export const ADSENSE_SCRIPT_ID = "scenering-adsbygoogle";

/** A syntactically valid `ca-pub-…` publisher id, or "" for anything else. */
function validClientId(value: string | undefined): string {
  const trimmed = (value || "").trim();
  return /^ca-pub-\d{10,}$/.test(trimmed) ? trimmed : "";
}

/**
 * This site's AdSense publisher id — committed, not configured.
 *
 * The loader tag carrying it is pasted literally into index.html (53046ab) so
 * that a plain build ships Google's verification snippet with no `.env` at
 * all. The ad units need the same id for `data-ad-client`, and `AdSlot`
 * renders nothing without one — so while the id lived only in the gitignored
 * `.env`, emptying it (which `vite.config.ts` instructed, to avoid a second
 * loader beside the pasted one) silently made every placement unrenderable,
 * whichever slot ids were set. Both units — the public-page one and the studio
 * rails — went dark with no error, no build failure and no edit to any ad code.
 *
 * Holding the id here makes advertising impossible to switch off by
 * configuration: the slot ids alone decide whether a placement renders.
 * `VITE_ADSENSE_CLIENT_ID` still overrides it for a build that must point at a
 * different publisher, and setting it cannot duplicate the loader, because
 * `ensureAdsenseScript` checks the document for an adsbygoogle.js first.
 */
export const ADSENSE_PUBLISHER_ID = "ca-pub-3303356901060479";

/**
 * The publisher id for this build: the `VITE_ADSENSE_CLIENT_ID` override when
 * it is a well-formed `ca-pub-…`, otherwise the committed id above. Never "" —
 * an empty answer here is what turned the ad units off.
 */
export function adsenseClientId(env: Record<string, string | undefined>): string {
  return validClientId(env?.VITE_ADSENSE_CLIENT_ID) || ADSENSE_PUBLISHER_ID;
}

/* Google's site-verification loader is deliberately NOT generated here.
 *
 * It is pasted literally into index.html — the template for every page shell
 * the build writes — and into public/render-probe.html, public/brand-check.html
 * and public/icon-sheet.html, so a plain build with no `.env` at all still
 * ships it and Google can verify the site. An env-driven generator
 * (`adsenseScriptTag`) lived here until 53046ab removed it for exactly that
 * reason. Do not reintroduce one: `adsenseClientId()` now always answers a
 * publisher id, so a generated tag would sit beside the pasted one, and two
 * adsbygoogle.js loaders on a page is a common reason AdSense refuses a site.
 * `ADSENSE_SCRIPT_ID` stays — AdSlot stamps it on any script it injects itself,
 * which is one of the two de-duplication paths. */

/**
 * The two ad units, committed for the same reason as the publisher id.
 *
 * A slot id is not a secret — Google renders it into the page as
 * `data-ad-slot` for every visitor to read — and while these lived only in the
 * gitignored `.env`, losing that file switched both placements off with nothing
 * in the build, the tests or the deploy output to show for it. That is what
 * happened: the units went dark and stayed dark through several deploys.
 *
 * `VITE_ADSENSE_SLOT_WEB` / `VITE_ADSENSE_SLOT_STUDIO` still override these for
 * a build that must point at different units. A blank or malformed override
 * falls back to the committed unit rather than disabling the placement — the
 * rules that decide *where* an ad may appear live with the placements
 * themselves (PublicPage excludes the legal and account-flow pages, App gates
 * the studio rails on a signed-in Free member on Setup and Render), not here.
 */
export const ADSENSE_SLOT_WEB = "6497478120"; // AdSense unit "scenering-web"
export const ADSENSE_SLOT_STUDIO = "2346692151"; // AdSense unit "scenering-studio"

/** The ad-unit slot id for a placement: an env override, else the committed unit. */
export function adsenseSlotId(env: Record<string, string | undefined>, kind: AdsenseSlotKind): string {
  const value = (kind === "web" ? env?.VITE_ADSENSE_SLOT_WEB : env?.VITE_ADSENSE_SLOT_STUDIO) || "";
  const trimmed = value.trim();
  if (/^\d{5,}$/.test(trimmed)) return trimmed;
  return kind === "web" ? ADSENSE_SLOT_WEB : ADSENSE_SLOT_STUDIO;
}

/** True only when this placement may render: publisher + slot both configured. */
export function adsensePlacementEnabled(env: Record<string, string | undefined>, kind: AdsenseSlotKind): boolean {
  return Boolean(adsenseClientId(env) && adsenseSlotId(env, kind));
}

/**
 * The studio rails' audience: a signed-in member whose effective plan is
 * Free. `plan` should be the interface plan (see getInterfacePlan), so an
 * owner previewing a paid plan sees the paid, ad-free studio.
 */
export function studioAdsEligible(signedIn: boolean, plan: string | null | undefined): boolean {
  return signedIn && plan === "free";
}

/** The ads.txt line Google requires for this publisher (build writes dist/ads.txt). */
export function adsTxtLine(clientId: string): string | null {
  const match = /^ca-pub-(\d{10,})$/.test(clientId.trim()) ? clientId.trim().slice("ca-".length) : null;
  return match ? `google.com, ${match}, DIRECT, f08c47fec0942fa0` : null;
}
