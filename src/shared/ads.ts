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

/** `ca-pub-123…` from the build env, or "" when advertising is not configured. */
export function adsenseClientId(env: Record<string, string | undefined>): string {
  return validClientId(env?.VITE_ADSENSE_CLIENT_ID);
}

/**
 * Google's site-verification snippet, for inside every page's <head>: the
 * loader tag AdSense asks the publisher to paste into each page. Returns ""
 * when no publisher id is configured, so an unconfigured build writes no tag
 * and loads nothing from Google.
 *
 * Written by the build rather than typed into index.html so all of the site's
 * pages get it — the front page, every standalone page, and the app shell —
 * and so the id still lives in one place (VITE_ADSENSE_CLIENT_ID).
 */
export function adsenseScriptTag(clientId: string): string {
  const id = validClientId(clientId);
  if (!id) return "";
  return (
    `<script async id="${ADSENSE_SCRIPT_ID}" ` +
    `src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(id)}" ` +
    `crossorigin="anonymous"></script>`
  );
}

/** The ad-unit slot id for a placement, or "" when that placement is off. */
export function adsenseSlotId(env: Record<string, string | undefined>, kind: AdsenseSlotKind): string {
  const value = (kind === "web" ? env?.VITE_ADSENSE_SLOT_WEB : env?.VITE_ADSENSE_SLOT_STUDIO) || "";
  const trimmed = value.trim();
  return /^\d{5,}$/.test(trimmed) ? trimmed : "";
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
