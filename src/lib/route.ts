import { useEffect, useState } from "react";

/**
 * Two-surface routing.
 *
 * Scenering ships one bundle with two front doors:
 *
 *   /        the public website — what Scenering is, shown by demonstrating
 *            the real workflow (src/marketing/**)
 *   /app     the studio itself — the application (src/App.tsx)
 *
 * Both are lazy-loaded in main.tsx, so a visitor reading the website never
 * downloads the renderer, and someone opening the studio never downloads the
 * marketing artwork.
 *
 * There is deliberately no router dependency: the site is a single scrolling
 * page, so "routing" is one path check plus a popstate listener.
 */

export type SiteRoute = "site" | "studio";

/** Where the application lives. */
export const STUDIO_PATH = "/app";
/** Where the public website lives. */
export const SITE_PATH = "/";

/**
 * Friendly URLs that deep-link into a section of the public website.
 * Keys are paths, values are the section id rendered by MarketingSite.
 */
export const SITE_SECTION_PATHS: Readonly<Record<string, string>> = {
  "/questions": "questions",
  "/no-meter": "no-meter",
  "/workflow": "workflow",
  "/product": "workflow",
  "/scenes": "scenes",
  "/visuals": "visuals",
  "/voice": "voice",
  "/captions": "captions",
  "/video-studio": "video-studio",
  "/effects": "effects",
  "/control": "control",
  "/examples": "examples",
  "/formats": "formats",
  "/sources": "sources",
  "/pricing": "pricing",
};

/** Lower-cased, trailing-slash-free path. `""` and `"/"` both become `"/"`. */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return (trimmed === "" ? "/" : trimmed).toLowerCase();
}

/** Which surface a path belongs to. Unknown paths fall back to the website. */
export function routeForPath(pathname: string): SiteRoute {
  const path = normalizePath(pathname);
  return path === STUDIO_PATH || path.startsWith(`${STUDIO_PATH}/`) ? "studio" : "site";
}

/** The website section a path deep-links to, if any. */
export function sectionForPath(pathname: string): string | null {
  return SITE_SECTION_PATHS[normalizePath(pathname)] ?? null;
}

/**
 * Client-side navigation. Falls back to a full page load when the History API
 * is unavailable, so the links keep working in any environment.
 */
export function navigate(path: string): void {
  if (typeof window === "undefined") return;
  if (!window.history?.pushState) {
    window.location.href = path;
    return;
  }
  if (normalizePath(window.location.pathname) === normalizePath(path)) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Current surface + path, kept in sync with Back/Forward. */
export function useRoute(): { route: SiteRoute; path: string } {
  const read = () => {
    const path = typeof window === "undefined" ? "/" : window.location.pathname;
    return { route: routeForPath(path), path: normalizePath(path) };
  };
  const [state, setState] = useState(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return state;
}
