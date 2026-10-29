/**
 * Search and link-preview metadata for Scenering's public pages.
 *
 * One table, two readers. At build time src/marketing/seo-head.ts writes each
 * page's tags into that page's own HTML file (vite.config.ts), so a crawler
 * reads the right title, description, canonical URL and share image from the
 * first byte, before any JavaScript runs. In the browser, applyPageSeo() sets
 * the same values again as the visitor moves between pages without a reload.
 * Both read this table and SITE_ORIGIN, so the HTML and the running page can
 * never disagree: Google reads the canonical URL before and after rendering,
 * and two different answers is the one thing it asks sites not to give it.
 */
import { isFeatureTourPath } from "../lib/route";

export interface PageSeo {
  title: string;
  description: string;
  /** Account and token pages should never appear in search results. */
  indexable?: boolean;
}

/**
 * The address search engines should list, whatever address the page was
 * opened on. www.scenering.com, the Worker's workers.dev address and local
 * previews all serve the same pages, and every one of them names
 * https://scenering.com as the real one — never the address in the browser.
 */
export const SITE_ORIGIN = "https://scenering.com";

/**
 * The picture search results and link previews show: the hero section's key
 * art, widened to the 1200×630 link-preview shape with its own navy
 * (scripts/make-og-card.mjs). The owner chose it.
 */
export const SHARE_IMAGE = {
  path: "/marketing/og-hero.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "The Scenering key art: the SCENERING name under a gold ring, with photographs, a clapperboard, a play button, a microphone and a film strip.",
} as const;

/** What an indexable page tells crawlers, in the HTML and from JavaScript alike. */
export const INDEXABLE_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const NOINDEX_ROBOTS = "noindex, nofollow";

export const SEO_PAGES: Readonly<Record<string, PageSeo>> = {
  "/": {
    title: "Scenering | Faceless Video Maker from Script to Video",
    description: "Browser-based script-to-video workflow for creators. Plan scenes, research visuals, add voice narration and synced captions, edit, and export.",
  },
  "/features": {
    title: "Faceless Video Maker Features | Scenering",
    description: "Explore Scenering's script-to-video tools: scene planning, visual research, voiceover, synced captions, timeline editing, effects and MP4 or WebM export.",
  },
  "/how-it-works": {
    title: "How to Make a Faceless Video | Scenering",
    description: "See how Scenering turns scripts or audio into faceless videos: plan scenes, research visuals, add narration and captions, refine the edit, and export.",
  },
  "/pricing": {
    title: "Scenering Pricing | Free Script-to-Video Plans",
    description: "Compare Scenering's Free, SceneFlow and SceneForge plans. Preview the creative workflow, see weekly export limits and choose the tools that fit your videos.",
  },
  "/about": {
    title: "About Scenering | Video Creation for Creators",
    description: "Learn how Scenering keeps video creation editable for creators, educators, churches, training teams and organizations.",
  },
  "/faq": {
    title: "Scenering FAQ | Script-to-Video Help",
    description: "Find answers about making faceless videos with Scenering, including scripts, scenes, visuals, voiceover, captions, plans, exports and troubleshooting.",
  },
  "/manual": {
    title: "Scenering Manual | Editing and Export Guide",
    description: "Use the Scenering guide for setup, scenes, visual research, voice narration, caption timing, Video Studio, final exports and troubleshooting.",
  },
  "/contact": {
    title: "Contact Scenering | Product Support",
    description: "Contact Scenering about your account, billing, script-to-video workflow, voiceover, captions, rendering or a product feature request.",
  },
  "/privacy": {
    title: "Scenering Privacy Policy",
    description: "Learn how Scenering handles account, project, billing, analytics and customer-provided API-key data when you use the video creation application.",
  },
  "/terms": {
    title: "Scenering Terms of Service",
    description: "Review the terms for using Scenering's video creation application, including accounts, content, subscriptions, exports and third-party services.",
  },
  "/refunds": {
    title: "Scenering Refund and Cancellation Policy",
    description: "Cancel a Scenering subscription any time and see when a refund is possible, who processes it, and how long a refund takes to reach you.",
  },
  "/cookies": {
    title: "Scenering Cookie Policy",
    description: "See how Scenering uses essential, analytics and preference cookies to support account access and the operation of its video creation application.",
  },
  "/verify-email": {
    title: "Verify Email | Scenering",
    description: "Verify your Scenering account email address.",
    indexable: false,
  },
  "/reset-password": {
    title: "Reset Password | Scenering",
    description: "Choose a new password for your Scenering account.",
    indexable: false,
  },
  /* The two email-link pages open with a personal token in the address. They
     used to fall back to the front page's title, as indexable pages. */
  "/email-preferences": {
    title: "Email Preferences | Scenering",
    description: "Choose which emails Scenering sends to your account.",
    indexable: false,
  },
  "/unsubscribe": {
    title: "Unsubscribe | Scenering",
    description: "Stop Scenering marketing email for your address.",
    indexable: false,
  },
};

/**
 * The page a path is a copy of — the one its canonical URL names.
 *
 * - A page in the table is its own page.
 * - The feature-tour shortcuts (/captions, /voice, /scenes …) open the
 *   /features page at that area, so they are /features. They used to carry the
 *   front page's title and call themselves separate pages: a dozen copies of
 *   Features, each titled like the front page, competing with both.
 * - Everything else — the front page's own section shortcuts (/examples,
 *   /no-meter) and any unknown address — shows the front page.
 */
export function canonicalPathFor(path: string): string {
  const normalized = (path.replace(/\/+$/, "") || "/").toLowerCase();
  if (SEO_PAGES[normalized]) return normalized;
  if (isFeatureTourPath(normalized)) return "/features";
  return "/";
}

/** An absolute URL on the production site. */
export function siteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

/** The canonical URL for a path, always on https://scenering.com. */
export function canonicalUrl(path: string): string {
  return siteUrl(canonicalPathFor(path));
}

export function seoForPath(path: string): PageSeo {
  return SEO_PAGES[canonicalPathFor(path)] || SEO_PAGES["/"];
}

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let node = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  node.content = content;
}

/**
 * Apply route-specific tags without relying on a metadata framework.
 *
 * On a page's first load these are the values its HTML already has; this
 * matters when the visitor moves to another page without a reload.
 */
export function applyPageSeo(path: string, canonicalPath = canonicalPathFor(path)): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const seo = seoForPath(path);
  const pageUrl = siteUrl(canonicalPath);
  const imageUrl = siteUrl(SHARE_IMAGE.path);

  document.title = seo.title;
  setMeta("name", "description", seo.description);
  setMeta("name", "robots", seo.indexable === false ? NOINDEX_ROBOTS : INDEXABLE_ROBOTS);
  setMeta("property", "og:title", seo.title);
  setMeta("property", "og:description", seo.description);
  setMeta("property", "og:url", pageUrl);
  setMeta("property", "og:image", imageUrl);
  setMeta("property", "og:image:alt", SHARE_IMAGE.alt);
  setMeta("name", "twitter:title", seo.title);
  setMeta("name", "twitter:description", seo.description);
  setMeta("name", "twitter:image", imageUrl);
  setMeta("name", "twitter:image:alt", SHARE_IMAGE.alt);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  // A page that must not be listed has no canonical URL in its HTML either.
  if (seo.indexable === false) {
    canonical?.remove();
    return;
  }
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = pageUrl;
}
