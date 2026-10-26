/**
 * Each public page's own HTML, written at build time.
 *
 * The site is a single-page app: Cloudflare has one HTML file and the page's
 * JavaScript draws everything else. That one file, with the front page's
 * title, description and canonical URL in it and an empty body, used to be
 * what EVERY address returned. A search engine reading /pricing before running
 * any JavaScript was told "this page is the front page", and found no words
 * and no links to follow.
 *
 * vite.config.ts now writes one file per page (dist/pricing.html,
 * dist/faq.html …). Cloudflare's asset layer serves dist/pricing.html at
 * /pricing and redirects /pricing.html and /pricing/ there, so each page
 * answers with:
 *
 *   - its own <title>, description, robots rule and canonical URL;
 *   - link-preview tags (Open Graph and X) carrying the hero image;
 *   - structured data — who publishes the site (Organization, with the logo),
 *     which site it is (WebSite: how Google chooses the name it shows above a
 *     result), which page this is (WebPage, with a breadcrumb below the front
 *     page) and, where the product itself is described, the application and
 *     its plans;
 *   - a short readable summary inside #root — the page's own heading, its
 *     description and a link to every page — for crawlers that read the HTML
 *     without running JavaScript. Visitors never see it: a one-line script in
 *     the head hides it before the first paint, and React replaces everything
 *     inside #root when the app starts.
 *
 * Everything comes from src/marketing/seo.ts (titles, descriptions, canonical
 * rules) and src/config/plans.ts (prices) — the same sources the running page
 * uses — so the HTML and the app cannot disagree. The functions here are pure;
 * writing the files is vite.config.ts's job, which lets tests/seo.test.ts check
 * every page without a build.
 */
import { PLAN_CONFIG, PLAN_ORDER } from "../config/plans";
import { SITE_SECTION_PATHS, isFeatureTourPath } from "../lib/route";
import { adsenseScriptTag } from "../shared/ads";
import { STRUCTURED_DATA_ID } from "../shared/structured-data";
import { LEGAL_DOCUMENTS, LEGAL_ORGANISATION, LEGAL_OWNER } from "./legal-content";
import { INDEXABLE_ROBOTS, NOINDEX_ROBOTS, SEO_PAGES, SHARE_IMAGE, canonicalPathFor, canonicalUrl, seoForPath, siteUrl } from "./seo";

/** The markers in index.html that the generated tags replace. */
export const SEO_HEAD_START = "<!-- seo:start -->";
export const SEO_HEAD_END = "<!-- seo:end -->";
/** The markers inside <div id="root"> that the readable summary replaces. */
export const SEO_PAGE_START = "<!-- seo-page:start -->";
export const SEO_PAGE_END = "<!-- seo-page:end -->";

export const SITE_NAME = "Scenering";

/**
 * The logo search engines read: the owner's "S" icon artwork at 512 px
 * (scripts/make-site-icons.mjs). Square and well over Google's 112 px minimum;
 * the favicons are the same mark at smaller sizes.
 */
export const SITE_LOGO = { path: "/marketing/logo-scenering-512.png", width: 512, height: 512, type: "image/png" } as const;

/** The hero section's key art, as drawn on the front page (square). */
export const HERO_ART = { path: "/marketing/hero-showpiece-1024.webp", width: 1024, height: 1024, type: "image/webp" } as const;

/** A page as the summary describes it: the menu's name for it and its own <h1>. */
export interface ShellPage {
  path: string;
  label: string;
  /** Must be the heading the page itself draws — tests/seo.test.ts compares them with the source. */
  heading: string;
}

/** The pages search engines should list, in menu order. This is also the sitemap (server/platform.ts). */
export const PUBLIC_PAGES: readonly ShellPage[] = [
  { path: "/", label: "Home", heading: "Create videos from your ideas." },
  { path: "/features", label: "Features", heading: "The whole studio, demonstrated." },
  { path: "/how-it-works", label: "How It Works", heading: "A clear workflow, not a mystery box." },
  { path: "/pricing", label: "Pricing", heading: "Start free. Add capability when you need it." },
  { path: "/about", label: "About", heading: "Video creation with meaningful control." },
  { path: "/manual", label: "Manual", heading: "From account setup to downloaded video." },
  { path: "/faq", label: "FAQ", heading: "Every step explained in plain language." },
  { path: "/contact", label: "Contact", heading: "How can we help?" },
  { path: "/privacy", label: "Privacy", heading: LEGAL_DOCUMENTS.privacy.title },
  { path: "/terms", label: "Terms", heading: LEGAL_DOCUMENTS.terms.title },
  { path: "/cookies", label: "Cookies", heading: LEGAL_DOCUMENTS.cookies.title },
  { path: "/refunds", label: "Refunds", heading: LEGAL_DOCUMENTS.refunds.title },
];

/** Pages that exist but must never be listed: account and email-link pages. */
export const PRIVATE_PAGES: readonly ShellPage[] = [
  { path: "/verify-email", label: "Verify email", heading: "Email verification" },
  { path: "/reset-password", label: "Reset password", heading: "Choose a new password" },
  { path: "/email-preferences", label: "Email preferences", heading: "Choose what Scenering sends you" },
  { path: "/unsubscribe", label: "Unsubscribe", heading: "Unsubscribe from Scenering marketing email" },
];

const PAGE_BY_PATH = new Map([...PUBLIC_PAGES, ...PRIVATE_PAGES].map((page) => [page.path, page]));

/** The pages that describe the product itself, and so carry the application and its plans. */
const APP_PAGES = new Set(["/", "/features", "/pricing"]);

/** schema.org has a more exact type for two of the pages. */
const PAGE_TYPES: Readonly<Record<string, string>> = { "/about": "AboutPage", "/contact": "ContactPage" };

/**
 * What the application is and does, for its structured data. The features are
 * the ones the website demonstrates; nothing here is a rating, a review or a
 * number the product cannot back up.
 */
const APP_DESCRIPTION =
  "Create scene-based faceless videos from scripts or prepared audio. Research visuals, add narration and synced captions, edit the video, and export for social platforms.";
const APP_FEATURES = [
  "Script-to-scene planning",
  "Visual research and selection",
  "Speechify voiceover with a customer-provided API key",
  "Word-synced captions",
  "Video Studio editing and effects",
  "MP4 and WebM export",
];

/**
 * Every address that gets its own file: the listed pages, the private pages,
 * and the feature-tour shortcuts (/captions, /voice …), whose files are copies
 * of the Features page's — they show that page, so they name it as theirs.
 * The front page's own section shortcuts (/examples, /no-meter) and any
 * unknown address fall back to index.html, which is the front page's file.
 */
export function pageShellPaths(): string[] {
  const shortcuts = Object.keys(SITE_SECTION_PATHS).filter((path) => isFeatureTourPath(path) && !SEO_PAGES[path]);
  return [...PUBLIC_PAGES, ...PRIVATE_PAGES].map((page) => page.path).concat(shortcuts);
}

/** Text for HTML: element content and double-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Json = Record<string, unknown>;

function imageObject(image: { path: string; width: number; height: number }): Json {
  return { "@type": "ImageObject", url: siteUrl(image.path), width: image.width, height: image.height };
}

function organization(home: string): Json {
  return {
    "@type": "Organization",
    "@id": `${home}#organization`,
    name: SITE_NAME,
    legalName: LEGAL_ORGANISATION,
    url: home,
    logo: { ...imageObject(SITE_LOGO), "@id": `${home}#logo`, caption: SITE_NAME },
    image: { "@id": `${home}#logo` },
    founder: { "@type": "Person", name: LEGAL_OWNER },
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: siteUrl("/contact"), availableLanguage: "en" },
    // `sameAs` (the owner's social profiles) is added in the browser from the
    // links saved in the administration panel — src/shared/structured-data.ts.
  };
}

function website(home: string): Json {
  return {
    "@type": "WebSite",
    "@id": `${home}#website`,
    url: home,
    name: SITE_NAME,
    alternateName: ["scenering.com"],
    description: SEO_PAGES["/"].description,
    inLanguage: "en",
    publisher: { "@id": `${home}#organization` },
  };
}

/** Prices come from PLAN_CONFIG, never typed here: a search result must quote what the checkout charges. */
function offers(): Json[] {
  return PLAN_ORDER.flatMap((slug) => {
    const plan = PLAN_CONFIG[slug];
    const terms: [string, number][] = plan.prices.monthly === 0 && plan.prices.yearly === 0
      ? [[plan.name, 0]]
      : [[`${plan.name} monthly`, plan.prices.monthly], [`${plan.name} yearly`, plan.prices.yearly]];
    return terms.map(([name, price]) => ({
      "@type": "Offer",
      name,
      price: String(price),
      priceCurrency: "USD",
      url: siteUrl("/pricing"),
      availability: "https://schema.org/InStock",
    }));
  });
}

/**
 * The application. There is deliberately no aggregateRating and no review:
 * Scenering has no published ratings to quote, and invented stars break
 * Google's rules. Without them Google will not draw the star "app" result, but
 * the description, category and prices are still read.
 */
function application(home: string): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": `${home}#app`,
    name: SITE_NAME,
    url: home,
    description: APP_DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Video editing and script-to-video software",
    operatingSystem: "Web browser",
    image: [imageObject(SHARE_IMAGE), imageObject(HERO_ART)],
    featureList: APP_FEATURES,
    offers: offers(),
    publisher: { "@id": `${home}#organization` },
  };
}

/** The structured data for a page, or null for a page that must not be listed. */
export function structuredData(path: string): Json | null {
  const seo = seoForPath(path);
  if (seo.indexable === false) return null;
  const home = siteUrl("/");
  const canonicalPath = canonicalPathFor(path);
  const url = canonicalUrl(path);
  const page: Json = {
    "@type": PAGE_TYPES[canonicalPath] ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: seo.title,
    description: seo.description,
    inLanguage: "en",
    isPartOf: { "@id": `${home}#website` },
    primaryImageOfPage: imageObject(SHARE_IMAGE),
  };
  const graph: Json[] = [organization(home), website(home), page];
  if (canonicalPath !== "/") {
    page.breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: home },
        { "@type": "ListItem", position: 2, name: PAGE_BY_PATH.get(canonicalPath)?.label ?? seo.title, item: url },
      ],
    });
  }
  if (APP_PAGES.has(canonicalPath)) {
    page.about = { "@id": `${home}#app` };
    graph.push(application(home));
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON for inside a <script> element: "<" is escaped so no text can close the element early. */
function jsonForScript(data: Json, indent: string): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, "\\u003c")
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}

const INDENT = "\n    ";

/**
 * The tags between the seo markers in <head>, markers included.
 *
 * `adsenseClientId` is the publisher id from the build env
 * (VITE_ADSENSE_CLIENT_ID). When it is set, Google's AdSense loader goes into
 * this page's head — the snippet AdSense asks a publisher to paste into every
 * page of the site, which is also how Google verifies the site for ads. When it
 * is not set, no tag is written and nothing is loaded from Google.
 */
export function renderSeoHead(path: string, adsenseClientId = ""): string {
  const seo = seoForPath(path);
  const indexable = seo.indexable !== false;
  const lines: string[] = [];
  const adScript = adsenseScriptTag(adsenseClientId);
  if (adScript) lines.push(adScript);
  lines.push(
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="robots" content="${indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS}" />`,
  );
  if (indexable) {
    const url = canonicalUrl(path);
    const image = siteUrl(SHARE_IMAGE.path);
    lines.push(
      `<link rel="canonical" href="${url}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:locale" content="en_US" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:type" content="${SHARE_IMAGE.type}" />`,
      `<meta property="og:image:width" content="${SHARE_IMAGE.width}" />`,
      `<meta property="og:image:height" content="${SHARE_IMAGE.height}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(SHARE_IMAGE.alt)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`,
      `<meta name="twitter:image" content="${image}" />`,
      `<meta name="twitter:image:alt" content="${escapeHtml(SHARE_IMAGE.alt)}" />`,
    );
  }
  // The readable summary is for crawlers that do not run JavaScript. Anything
  // that does run it hides the summary before the first paint (so a visitor
  // never sees it flash), and React then replaces it with the real page.
  lines.push(
    `<style>.seo-js #seo-page{display:none}#seo-page{max-width:46rem;margin:2rem auto;padding:0 1rem;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}</style>`,
    `<script>document.documentElement.classList.add("seo-js")</script>`,
  );
  const data = structuredData(path);
  if (data) lines.push(`<script type="application/ld+json" id="${STRUCTURED_DATA_ID}">\n${jsonForScript(data, "      ")}\n    </script>`);
  return [SEO_HEAD_START, ...lines, SEO_HEAD_END].join(INDENT);
}

/** The readable summary inside <div id="root">, markers included. */
export function renderSeoPage(path: string): string {
  const seo = seoForPath(path);
  const page = PAGE_BY_PATH.get(canonicalPathFor(path)) ?? PUBLIC_PAGES[0];
  const links = PUBLIC_PAGES.map((entry) => `<li><a href="${entry.path}">${escapeHtml(entry.label)}</a></li>`).join("");
  return (
    SEO_PAGE_START +
    `<div id="seo-page">` +
    `<header><a href="/">${SITE_NAME}</a></header>` +
    `<main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(seo.description)}</p></main>` +
    `<nav aria-label="${SITE_NAME}"><ul>${links}</ul></nav>` +
    `</div>` +
    SEO_PAGE_END
  );
}

/** Replaces the text from `start` to `end` (markers included) with `block`. Loud when the markers are missing. */
function replaceBlock(html: string, start: string, end: string, block: string): string {
  const from = html.indexOf(start);
  const to = from < 0 ? -1 : html.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`[seo] index.html is missing the ${start} … ${end} markers`);
  if (html.indexOf(start, from + start.length) >= 0) throw new Error(`[seo] index.html has the ${start} marker twice`);
  return html.slice(0, from) + block + html.slice(to + end.length);
}

/**
 * index.html (source or built) with a page's tags and summary in place.
 * Re-applying it to its own output is safe — the whole generated block is
 * replaced, so a page never ends up with Google's loader tag twice.
 */
export function applyPageShell(html: string, path: string, adsenseClientId = ""): string {
  return replaceBlock(
    replaceBlock(html, SEO_HEAD_START, SEO_HEAD_END, renderSeoHead(path, adsenseClientId)),
    SEO_PAGE_START,
    SEO_PAGE_END,
    renderSeoPage(path),
  );
}

/** The extra files a build writes next to index.html: one per page except the front page. */
export function pageShellFiles(indexHtml: string, adsenseClientId = ""): { file: string; html: string }[] {
  return pageShellPaths()
    .filter((path) => path !== "/")
    .map((path) => ({ file: `${path.slice(1)}.html`, html: applyPageShell(indexHtml, path, adsenseClientId) }));
}
