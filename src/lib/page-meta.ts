import { useEffect } from "react";
import { SITE_TITLE, absoluteUrl, seoPageForPath } from "../shared/seo";

/**
 * Keeps the document in step with the URL.
 *
 * Every page of this app is served from one shell, and the Worker writes the
 * shell's title, description, canonical and robots tag for the URL that was
 * requested (src/shared/seo.ts, server/platform.ts). This is the client half of
 * that: once the visitor starts moving around without a page load — a corner
 * menu shortcut to /captions, Back out of the studio — nothing re-fetches the
 * shell, so the tab title and the canonical tag have to be corrected here or
 * they keep describing the page the visitor arrived on.
 *
 * The values come from the same table the Worker uses, so a page cannot have one
 * title in a search result and another in the tab. Pages the site does not
 * publish get the site's own title and no canonical at all: an address that
 * matches no page should not advertise itself as one.
 */
export function usePageMeta(path: string): void {
  useEffect(() => {
    applyPageMeta(path);
  }, [path]);
}

export function applyPageMeta(pathname: string): void {
  if (typeof document === "undefined") return;
  const page = seoPageForPath(pathname);
  const canonicalPath = page ? page.canonicalPath ?? page.path : null;

  document.title = page ? page.title : SITE_TITLE;
  setMeta("description", page ? page.description : undefined);

  // `location.origin` is the string "null" in a sandboxed frame or on a
  // file:// page; a canonical of "null/captions" is worse than none at all.
  const origin = /^https?:\/\//.test(document.location.origin) ? document.location.origin : "";

  if (canonicalPath && origin) {
    setCanonical(absoluteUrl(origin, canonicalPath));
    // Anything the site publishes may be indexed; only the doors into the
    // account are excluded, and the Worker has already said so in the shell.
    removeMeta("robots");
  } else if (page) {
    setCanonical("");
    setMeta("robots", "noindex,nofollow");
  } else {
    setCanonical("");
    removeMeta("robots");
  }
}

function setMeta(name: string, content: string | undefined): void {
  const existing = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!content) {
    existing?.remove();
    return;
  }
  if (existing) existing.setAttribute("content", content);
  else {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }
}

function removeMeta(name: string): void {
  document.querySelector(`meta[name="${name}"]`)?.remove();
}

function setCanonical(href: string): void {
  const existing = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing) existing.setAttribute("href", href);
  else {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    document.head.appendChild(link);
  }
}
