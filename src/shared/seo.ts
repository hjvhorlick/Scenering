/**
 * What search engines are told about Scenering.
 *
 * WHY THIS EXISTS
 * ---------------
 * Scenering is one page rendered in the browser: every URL the site publishes
 * is answered with the same `index.html`. Until now that shell carried one set
 * of tags — the home page's — so `/pricing`, `/faq` and `/captions` introduced
 * themselves to Google, Bing and every link-preview bot as the front page. The
 * structured data in the shell was a single `SoftwareApplication` block with
 * hand-typed prices and no logo, which is why a search result shows a title and
 * nothing else: no site name, no icon, no price.
 *
 * This module is the one place that describes the public site:
 *
 *   for every public URL   its title, description and canonical
 *   for the site itself    name, owner, logo, image and the plans and prices
 *
 * From it come the tags the Worker injects into the shell before serving it
 * (`server/platform.ts`), the tags `index.html` carries for a static deploy,
 * the `sitemap.xml` and `robots.txt` bodies, and the client-side updates that
 * keep the tab honest while somebody moves around without a page load.
 *
 * It is imported by the Worker, so it must stay free of React, of the DOM and
 * of anything else the edge cannot run. It is also imported by the client, so
 * it must stay free of Node built-ins. The plan prices are read from the live
 * catalogue in `src/config/plans.ts` rather than typed out, because a price in
 * a search result has to be the price the checkout will charge.
 */

import { PLAN_CONFIG, PLAN_ORDER } from "../config/plans";

/* -------------------------------------------------------------- identity */

export const SITE_NAME = "Scenering";
export const SITE_TAGLINE = "From idea to video";
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;
/** The description search engines and link previews show for the front page. */
export const SITE_DESCRIPTION =
  "Scenering turns a script into scenes, finds a visual for each one, gives them a voice, adds captions and finishes the video in Video Studio. Runs on your own machine.";
/** What the application itself is, for the SoftwareApplication block. */
export const APP_DESCRIPTION =
  "Create scene-based faceless videos from scripts and audio with visual research, voice-over, captions and creative finishing tools.";
export const SITE_THEME_COLOR = "#faf7f2";
export const SITE_LANGUAGE = "en";

/**
 * Owner and organisation. These are also in `src/marketing/legal-content.ts`
 * (the privacy and terms pages name the same person and company); that file is
 * the wording of the legal documents rather than a data module, so the two are
 * kept in step by `tests/seo.test.ts` instead of by an import that would pull
 * the whole legal text into the Worker bundle.
 */
export const SITE_OWNER = "Henry John Vincent Horlick";
export const SITE_ORGANISATION = "Horlick Group";
export const SITE_ORGANISATION_DESCRIPTION =
  "Scenering is a browser-based studio that turns scripts and audio into scene-based faceless videos, with visual research, narration, captions and finishing tools the creator controls.";

/** The link-preview card. Built by `scripts/make-og-card.mjs`. */
export const OG_IMAGE = {
  path: "/marketing/og-card.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Scenering — from idea to video. A script becomes scenes, visuals, voice and captions.",
} as const;

/**
 * The square brand tile: the "S" of the wordmark on the site's porcelain
 * background. Built by `scripts/make-site-icons.mjs`.
 *
 * Google's logo guidance asks for at least 112×112 px, square, legible on a
 * white background and crawlable — this is that image, and the favicon, the
 * Apple touch icon and the web-app manifest icons are the same mark at other
 * sizes, so the icon beside a search result is the one in the browser tab.
 */
export const SITE_LOGO = { path: "/marketing/logo-scenering-512.png", width: 512, height: 512 } as const;

/* ------------------------------------------------------------ page table */

export interface SeoPage {
  /** The URL path, exactly as it appears in the address bar ("/" for home). */
  path: string;
  /** What the URL is for: something to be found, or a door that must not be. */
  kind: "marketing" | "private";
  /** The page's own name, and what the browser tab shows. */
  title: string;
  /** One honest sentence. Shown under the title in a search result. */
  description: string;
  /** The short name the site's own navigation uses for this URL. */
  label: string;
  /**
   * Where a crawler should attribute this page's content, when that is not the
   * page itself. The front page's areas (/captions, /examples, /sources, …)
   * are deep links into the one page the site is, so they point at "/": one
   * page must not compete with itself as thirteen URLs. A page with content of
   * its own leaves this empty and is its own canonical. Giving a section real
   * content of its own is therefore a one-line change here.
   */
  canonicalPath?: string;
  /** Listed in sitemap.xml. */
  inSitemap: boolean;
  /** Carry the SoftwareApplication block — the pages that describe the product. */
  app?: boolean;
}

/**
 * The areas of the front page that have a friendly URL (`SITE_SECTIONS` in
 * `src/lib/route.ts` names the same set, with the same labels — the test holds
 * the two lists together). They render the front page, so none of them is in
 * the sitemap and all of them canonicalise to "/".
 */
const SECTION_PAGES: readonly [path: string, label: string, description: string][] = [
  ["/workflow", "How it works", "A script or an audio file becomes scenes, researched visuals, narration, captions and a finished video — in the order the work actually happens."],
  ["/scenes", "Scenes", "How a script is divided into scenes you can reorder, retime, rewrite and re-narrate before anything is rendered."],
  ["/visuals", "Visuals", "Search the configured image sources, check each result for quality and replace any visual, scene by scene."],
  ["/voice", "Voice over", "Preview narrators, generate scene narration and work with word-level timing so captions land on the words."],
  ["/captions", "Captions", "Readable caption styles with project-wide and per-scene control over wording, timing and placement."],
  ["/video-studio", "Video Studio", "Filters, text, lower thirds, calls to action, camera movement, music and effects — the finishing stage."],
  ["/effects", "Effects library", "The filters, special effects, sound visualisers and animated elements available in Video Studio."],
  ["/control", "You stay in control", "Every important decision stays visible and reversible: nothing about your video is generated behind your back."],
  ["/no-meter", "No credits or tokens", "There is no credit meter and no token budget: previews are free to repeat and only a final download counts."],
  ["/examples", "Examples", "Example videos across information, education, business, storytelling, travel and social topics."],
  ["/formats", "Formats & devices", "Horizontal 16:9 and vertical 9:16 output, and the players and platforms each format suits."],
  ["/sources", "Visual sources", "Which sources the visual research searches — Pexels, Pixabay and Wikimedia Commons — and the bundled fallbacks."],
];

/** The pages with content of their own. These are the sitemap. */
const STANDALONE_PAGES: SeoPage[] = [
  {
    path: "/",
    kind: "marketing",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    label: "Home",
    inSitemap: true,
    app: true,
  },
  {
    path: "/features",
    kind: "marketing",
    title: `Features — ${SITE_NAME}`,
    description: "Scenes, visual research, voice over, captions, Video Studio and final export: what each stage of Scenering does, and which plan includes it.",
    label: "Features",
    inSitemap: true,
  },
  {
    path: "/how-it-works",
    kind: "marketing",
    title: `How It Works — ${SITE_NAME}`,
    description: "The steps from script or audio to a finished video, with the corrections you can make at every stage and preview renders that never use your export allowance.",
    label: "How It Works",
    inSitemap: true,
  },
  {
    path: "/pricing",
    kind: "marketing",
    title: `Pricing — ${SITE_NAME}`,
    description: "Three plans — Free, SceneFlow and SceneForge — with the complete feature comparison, monthly and yearly billing, and no credits to buy.",
    label: "Pricing",
    inSitemap: true,
    app: true,
  },
  {
    path: "/about",
    kind: "marketing",
    title: `About — ${SITE_NAME}`,
    description: "Why Scenering exists: video creation for people who have something to say but do not want filming — and do not want a black box making every decision.",
    label: "About",
    inSitemap: true,
  },
  {
    path: "/manual",
    kind: "marketing",
    title: `Manual — ${SITE_NAME}`,
    description: "The complete reference manual: every stage, control, caption style, effect and export setting explained in plain language.",
    label: "Manual",
    inSitemap: true,
  },
  {
    path: "/faq",
    kind: "marketing",
    title: `FAQ — ${SITE_NAME}`,
    description: "A searchable knowledge base covering the workflow, accounts and billing, visual research, editing terminology, audio, motion, captions, rendering and formats.",
    label: "FAQ",
    inSitemap: true,
  },
  {
    path: "/contact",
    kind: "marketing",
    title: `Contact — ${SITE_NAME}`,
    description: "Send a product, technical, billing or account question. Messages are validated, rate-limited and stored for review.",
    label: "Contact",
    inSitemap: true,
  },
  {
    path: "/privacy",
    kind: "marketing",
    title: `Privacy — ${SITE_NAME}`,
    description: "What Scenering stores on the server, what never leaves your browser, which outside services a feature may use, and how to ask about your information.",
    label: "Privacy",
    inSitemap: true,
  },
  {
    path: "/terms",
    kind: "marketing",
    title: `Terms — ${SITE_NAME}`,
    description: "The rules for using Scenering: plans and allowances, VIP features, your content, stock media licences, billing, availability and liability.",
    label: "Terms",
    inSitemap: true,
  },
  {
    path: "/cookies",
    kind: "marketing",
    title: `Cookies — ${SITE_NAME}`,
    description: "Which cookies and browser storage Scenering uses, what each one is for, and how to clear them.",
    label: "Cookies",
    inSitemap: true,
  },
];

/**
 * URLs kept from earlier launches that still deep-link somewhere real. They are
 * not published (no sitemap, canonical at the front page) but they must keep
 * working: a link that has been shared once should not start 404ing.
 */
const LEGACY_PAGES: SeoPage[] = [
  {
    path: "/questions",
    kind: "marketing",
    title: `Questions — ${SITE_NAME}`,
    description: "The five worries most visitors arrive with — cost, effort, quality, rights and control — and the section that settles each one.",
    label: "Questions",
    canonicalPath: "/",
    inSitemap: false,
  },
  {
    path: "/product",
    kind: "marketing",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    label: "Product",
    canonicalPath: "/",
    inSitemap: false,
  },
];

/**
 * Doors that must never appear in a search result. `/app` and the account
 * screens are not secret (they are rate-limited and authenticated), but there
 * is nothing on them to index, and a crawl of `/login` is a crawl of a form.
 */
const PRIVATE_PAGES: SeoPage[] = [
  {
    path: "/app",
    kind: "private",
    title: `Studio — ${SITE_NAME}`,
    description: "The Scenering studio: scenes, visuals, voice, captions and Video Studio inside your own account.",
    label: "Studio",
    inSitemap: false,
  },
  {
    path: "/login",
    kind: "private",
    title: `Sign in — ${SITE_NAME}`,
    description: "Sign in to open the Scenering studio.",
    label: "Login",
    inSitemap: false,
  },
  {
    path: "/register",
    kind: "private",
    title: `Create your account — ${SITE_NAME}`,
    description: "Create a Scenering account and start from the free plan.",
    label: "Register",
    inSitemap: false,
  },
  {
    path: "/forgot-password",
    kind: "private",
    title: `Reset your password — ${SITE_NAME}`,
    description: "Request a password reset link for your Scenering account.",
    label: "Forgot password",
    inSitemap: false,
  },
  {
    path: "/verify-email",
    kind: "private",
    title: `Verify your email — ${SITE_NAME}`,
    description: "Confirm the email address on your Scenering account.",
    label: "Verify email",
    inSitemap: false,
  },
  {
    path: "/reset-password",
    kind: "private",
    title: `Choose a new password — ${SITE_NAME}`,
    description: "Set a new password for your Scenering account. Reset links expire after one hour and can only be used once.",
    label: "New password",
    inSitemap: false,
  },
];

/** Deep links into the front page, then everything with content of its own. */
const SECTION_ROUTES: SeoPage[] = SECTION_PAGES.map(([path, label, description]) => ({
  path,
  kind: "marketing" as const,
  title: `${label} — ${SITE_NAME}`,
  description,
  label,
  canonicalPath: "/",
  inSitemap: false,
}));

/** Every URL this module knows. `/pricing` appears once, as the real page. */
export const SEO_PAGES: readonly SeoPage[] = [
  ...STANDALONE_PAGES,
  ...SECTION_ROUTES.filter((page) => !STANDALONE_PAGES.some((standalone) => standalone.path === page.path)),
  ...LEGACY_PAGES,
  ...PRIVATE_PAGES,
];

/** The sitemap: real pages, front page first. Nothing private, nothing legacy. */
export const SITEMAP_PATHS: readonly string[] = [
  ...SEO_PAGES.filter((page) => page.inSitemap).map((page) => page.path),
];

/**
 * The paths `wrangler.jsonc` must hand to the Worker before the static asset
 * layer answers them.
 *
 * Without this list the asset layer serves its own copy of the shell for every
 * marketing URL — with the home page's tags on it — which is the whole problem
 * this module exists to fix. `tests/seo.test.ts` compares this array with the
 * deployed configuration, so a new page cannot quietly be added to the site and
 * forgotten here.
 */
export const WORKER_FIRST_PATHS: readonly string[] = [
  ...SEO_PAGES.map((page) => page.path),
  // Deep studio routes (/app/project/7) are the studio; the asset layer would
  // answer them with the unmodified shell.
  "/app/*",
  "/api/*",
  "/functions/v1/*",
  "/robots.txt",
  "/sitemap.xml",
];

/* ------------------------------------------------------------- page head */

/** Marks the region of index.html that carries search-engine tags. */
export const SEO_HEAD_START = "<!-- seo:start -->";
export const SEO_HEAD_END = "<!-- seo:end -->";
/** How far the block is indented inside index.html's <head>. */
export const SEO_HEAD_INDENT = "    ";

export interface SeoContext {
  /** The site's own origin, e.g. `https://scenering.com`. No trailing slash. */
  baseUrl: string;
  /**
   * The owner's saved social profiles, in any order. These become `sameAs` —
   * the property that ties this site to the same organisation elsewhere, which
   * is what lets a search engine build a knowledge panel instead of guessing.
   * Empty (or a deployment with nothing configured) simply omits the property.
   */
  social?: readonly string[];
}

/** Lower-cased, query-free, trailing-slash-free path. `""` means `"/"`. */
export function normalizeSeoPath(pathname: string): string {
  const withoutQuery = String(pathname || "/").split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "").toLowerCase();
  return trimmed === "" ? "/" : trimmed;
}

/** The page record for a URL, or null when the site does not publish it. */
export function seoPageForPath(pathname: string): SeoPage | null {
  const path = normalizeSeoPath(pathname);
  const exact = SEO_PAGES.find((page) => page.path === path);
  if (exact) return exact;
  // A deeper path belongs to the section it starts with (/app/project/7 is the
  // studio). Unknown top-level paths stay unknown: the site does not invent a
  // page for them.
  return SEO_PAGES.find((page) => page.path !== "/" && path.startsWith(`${page.path}/`)) ?? null;
}

/** The absolute URL a page points crawlers at (its canonical). */
function seoPagePath(page: SeoPage, baseUrl: string): string {
  const root = stripTrailingSlash(baseUrl);
  const path = page.canonicalPath ?? page.path;
  return path === "/" ? `${root}/` : `${root}${path}`;
}

export function stripTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

/** Resolve a site path against an origin. Always absolute, never "//". */
export function absoluteUrl(baseUrl: string, path: string): string {
  const root = stripTrailingSlash(baseUrl);
  if (!path || path === "/") return `${root}/`;
  return `${root}${path.startsWith("/") ? path : `/${path}`}`;
}

/* --------------------------------------------------------- structured data */

/** A small subset of schema.org, in the shape Google reads it. */
type Json = Record<string, unknown>;

function organizationNode(base: string, ctx: SeoContext): Json {
  const node: Json = {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE_NAME,
    legalName: SITE_ORGANISATION,
    url: `${base}/`,
    description: SITE_ORGANISATION_DESCRIPTION,
    founder: { "@type": "Person", name: SITE_OWNER },
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(base, SITE_LOGO.path),
      width: SITE_LOGO.width,
      height: SITE_LOGO.height,
      caption: SITE_NAME,
    },
    image: {
      "@type": "ImageObject",
      url: absoluteUrl(base, OG_IMAGE.path),
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: absoluteUrl(base, "/contact"),
        availableLanguage: [SITE_LANGUAGE],
        areaServed: "Worldwide",
      },
    ],
  };
  const sameAs = (ctx.social ?? []).filter((href) => /^https:\/\//i.test(href));
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

function websiteNode(base: string): Json {
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    publisher: { "@id": `${base}/#organization` },
  };
}

/**
 * The application itself, with the plans the checkout will actually charge.
 *
 * Prices are read from `PLAN_CONFIG`, never typed here: a search result that
 * quotes a price has to be the price on the pricing page. There is deliberately
 * no `aggregateRating` — Scenering has no published ratings to quote, and a
 * rich result built on invented stars is a lie with a schema.org label on it.
 */
function applicationNode(base: string, ctx: SeoContext): Json {
  const node: Json = {
    "@type": "SoftwareApplication",
    "@id": `${base}/#app`,
    name: SITE_NAME,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: `${base}/`,
    description: APP_DESCRIPTION,
    image: {
      "@type": "ImageObject",
      url: absoluteUrl(base, OG_IMAGE.path),
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
    },
    isAccessibleForFree: true,
    featureList: [
      "Script to scenes",
      "Visual research with replaceable results",
      "Voice over with word-level timing",
      "Caption styles",
      "Video Studio finishing tools",
      "Horizontal and vertical export",
    ],
    offers: PLAN_ORDER.map((slug) => {
      const plan = PLAN_CONFIG[slug];
      return {
        "@type": "Offer",
        name: `${plan.name} plan`,
        description: plan.description,
        price: String(plan.prices.monthly),
        priceCurrency: "USD",
        url: absoluteUrl(base, "/pricing"),
        availability: "https://schema.org/InStock",
      };
    }),
    publisher: { "@id": `${base}/#organization` },
  };
  // Real screenshots would go here (`screenshot`, 320 px wide minimum). The
  // website's interface panels are drawn live in the browser rather than
  // captured, so until genuine captures exist the application is described by
  // its logo and link-preview image, which is honest and still eligible.
  const sameAs = (ctx.social ?? []).filter((href) => /^https:\/\//i.test(href));
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

/**
 * The JSON-LD document for a page: who publishes this site, which site it is,
 * which page this is, and — where the product is being described — what the
 * application costs.
 */
export function structuredDataForPage(page: SeoPage, ctx: SeoContext): Json | null {
  if (page.kind === "private") return null;
  const base = stripTrailingSlash(ctx.baseUrl);
  const url = seoPagePath(page, base);
  const graph: Json[] = [organizationNode(base, ctx), websiteNode(base)];
  if (!page.canonicalPath) {
    graph.push({
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${base}/#website` },
      ...(page.app ? { about: { "@id": `${base}/#app` } } : {}),
    });
  }
  if (page.app) graph.push(applicationNode(base, ctx));
  return { "@context": "https://schema.org", "@graph": graph };
}

/* --------------------------------------------------------------- the tags */

function escapeAttribute(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON inside a <script> tag must not be able to close it. */
function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

/**
 * The complete set of head tags for one URL: title, description, canonical,
 * robots, the Open Graph and Twitter cards a link preview needs, and the
 * structured data above.
 *
 * Relative URLs are never emitted. A crawler that has been redirected, or a
 * link unfurler running somewhere else entirely, resolves a relative `og:image`
 * against its own idea of the page and shows nothing; the canonical URL has to
 * be absolute for the same reason.
 */
export function renderSeoHead(pathname: string, ctx: SeoContext): string {
  const page = seoPageForPath(pathname);
  if (!page) return "";
  const base = stripTrailingSlash(ctx.baseUrl);
  const pageUrl = absoluteUrl(base, page.path);
  const canonical = seoPagePath(page, base);
  const image = absoluteUrl(base, OG_IMAGE.path);
  const lines: string[] = [];

  lines.push(`<title>${escapeAttribute(page.title)}</title>`);
  lines.push(`<meta name="description" content="${escapeAttribute(page.description)}" />`);
  lines.push("");
  if (page.kind === "private") {
    // Nothing here is for a search result. The studio and the account screens
    // are behind a sign-in; an index of a sign-in form helps nobody.
    lines.push(`<meta name="robots" content="noindex,nofollow" />`);
  } else {
    lines.push(`<link rel="canonical" href="${escapeAttribute(canonical)}" />`);
  }
  lines.push("");
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:site_name" content="${escapeAttribute(SITE_NAME)}" />`);
  lines.push(`<meta property="og:locale" content="${SITE_LANGUAGE}" />`);
  if (page.kind === "marketing") {
    lines.push(`<meta property="og:url" content="${escapeAttribute(canonical)}" />`);
  }
  lines.push(`<meta property="og:title" content="${escapeAttribute(page.title)}" />`);
  lines.push(`<meta property="og:description" content="${escapeAttribute(page.description)}" />`);
  lines.push(`<meta property="og:image" content="${escapeAttribute(image)}" />`);
  lines.push(`<meta property="og:image:type" content="${OG_IMAGE.type}" />`);
  lines.push(`<meta property="og:image:width" content="${OG_IMAGE.width}" />`);
  lines.push(`<meta property="og:image:height" content="${OG_IMAGE.height}" />`);
  lines.push(`<meta property="og:image:alt" content="${escapeAttribute(OG_IMAGE.alt)}" />`);
  lines.push("");
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttribute(page.title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeAttribute(page.description)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeAttribute(image)}" />`);

  const data = structuredDataForPage(page, ctx);
  if (data) {
    lines.push("");
    lines.push(`<script type="application/ld+json">`);
    lines.push(indent(safeJson(data), "  "));
    lines.push(`</script>`);
  }
  // Unused by crawlers, and the reason a stale tag is obvious in view-source.
  lines.push("");
  lines.push(`<!-- ${SITE_NAME} · ${pageUrl} -->`);
  return lines.join("\n");
}

/**
 * Replace the marked region of an HTML shell with the tags for one URL.
 *
 * The shell keeps a copy of the front page's tags between the markers so a
 * deployment served without the Worker (a static `dist/`) is still described
 * correctly; this swaps that copy for the requested page's. A shell without the
 * markers, or a URL the site does not publish, is returned untouched — never
 * half-rewritten.
 */
export function applySeoHead(shell: string, pathname: string, ctx: SeoContext): string {
  const start = shell.indexOf(SEO_HEAD_START);
  const end = shell.indexOf(SEO_HEAD_END);
  if (start === -1 || end === -1 || end < start) return shell;
  const head = renderSeoHead(pathname, ctx);
  if (!head) return shell;
  const before = shell.slice(0, start + SEO_HEAD_START.length);
  const after = shell.slice(end);
  const body = head.split("\n").map((line) => (line ? SEO_HEAD_INDENT + line : line)).join("\n");
  return `${before}\n${body}\n${SEO_HEAD_INDENT}${after}`;
}

/**
 * The front page's block as `index.html` holds it: the same tags, with relative
 * URLs and the file's own indentation.
 *
 * Written by `scripts/generate-seo-head.ts` (`npm run seo:head`) and compared
 * with the file by `tests/seo.test.ts`, so the copy in the shell cannot drift
 * from this table. Relative URLs are correct here rather than a compromise: a
 * crawler resolves them against the page it fetched, and this is the block a
 * deployment that serves `dist/` with no Worker at all depends on.
 */
export function staticSeoHeadBlock(): string {
  return renderSeoHead("/", { baseUrl: "" })
    // Vite reads `<link href>` as a reference to a file it must bundle — and
    // the canonical href is "/", which is a directory. `vite-ignore` tells it
    // to leave the tag alone; Vite removes the attribute on the way out, so it
    // never reaches a browser. The Worker-injected head needs none of this: it
    // is written after the build, with absolute URLs, and Vite never sees it.
    .replace('<link rel="canonical" ', '<link rel="canonical" vite-ignore ')
    .split("\n")
    .map((line) => (line ? SEO_HEAD_INDENT + line : line))
    .join("\n");
}

/* ----------------------------------------------------- crawler house files */

/** Absolute URLs of every published page, front page first. */
export function sitemapPaths(baseUrl: string): string[] {
  return SITEMAP_PATHS.map((path) => absoluteUrl(baseUrl, path));
}

export function sitemapXml(baseUrl: string): string {
  const urls = sitemapPaths(baseUrl)
    .map((url) => `<url><loc>${escapeAttribute(url)}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/**
 * The house rules for crawlers.
 *
 * `/app` and the account screens are already noindex in their own markup; the
 * Disallow lines are the belt to that pair of braces, and they keep the crawl
 * off the JSON API entirely (an API path is not a page, and a crawler that
 * spends its budget on `/api/tts` finds nothing it can index).
 */
export function robotsTxt(baseUrl: string): string {
  const disallow = ["/app", "/login", "/register", "/forgot-password", "/api/", "/functions/v1/"];
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.map((path) => `Disallow: ${path}`),
    `Sitemap: ${absoluteUrl(baseUrl, "/sitemap.xml")}`,
    "",
  ].join("\n");
}
