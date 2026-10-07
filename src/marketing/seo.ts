/**
 * Search and link-preview metadata for Scenering's public pages.
 *
 * The small HTML shell contains the homepage metadata for crawlers that do not
 * run JavaScript. PublicPage updates these values per route for browsers and
 * search engines that render the application. Social-card URLs stay absolute.
 */
export interface PageSeo {
  title: string;
  description: string;
  /** Account and token pages should never appear in search results. */
  indexable?: boolean;
}

export const SEO_PAGES: Readonly<Record<string, PageSeo>> = {
  "/": {
    title: "Scenering | Faceless Video Maker from Script to Video",
    description: "Make faceless videos from scripts or audio with Scenering. Plan scenes, research visuals, add voiceover and synced captions, then edit and export.",
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
    description: "Learn why Scenering keeps video creation editable: a guided script-to-video workflow for creators, educators, churches, training teams and organizations.",
  },
  "/faq": {
    title: "Scenering FAQ | Script-to-Video Help",
    description: "Find answers about making faceless videos with Scenering, including scripts, scenes, visuals, voiceover, captions, plans, exports and troubleshooting.",
  },
  "/manual": {
    title: "Scenering Manual | Editing and Export Guide",
    description: "Use the Scenering guide for setup, scenes, visual research, Speechify voiceover, caption timing, Video Studio, final exports and troubleshooting.",
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
};

export function seoForPath(path: string): PageSeo {
  const normalized = (path.replace(/\/+$/, "") || "/").toLowerCase();
  return SEO_PAGES[normalized] || SEO_PAGES["/"];
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

/** Apply route-specific tags without relying on a metadata framework. */
export function applyPageSeo(path: string, canonicalPath = path): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const seo = seoForPath(path);
  const canonicalUrl = new URL(canonicalPath, window.location.origin).toString();
  const imageUrl = new URL("/marketing/og-card.jpg", window.location.origin).toString();

  document.title = seo.title;
  setMeta("name", "description", seo.description);
  setMeta("name", "robots", seo.indexable === false ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  setMeta("property", "og:title", seo.title);
  setMeta("property", "og:description", seo.description);
  setMeta("property", "og:url", canonicalUrl);
  setMeta("property", "og:image", imageUrl);
  setMeta("name", "twitter:title", seo.title);
  setMeta("name", "twitter:description", seo.description);
  setMeta("name", "twitter:image", imageUrl);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
}
