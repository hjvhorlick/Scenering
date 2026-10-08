import { useEffect, useState } from "react";

/**
 * Three-surface routing.
 *
 * Scenering ships one bundle with three front doors:
 *
 *   /        the public website — what Scenering is, shown by demonstrating
 *            the real workflow (src/marketing/**)
 *   /app     the studio itself — the application (src/App.tsx)
 *   /admin   the owner's admin surfaces — currently the Email Centre
 *            (src/admin/**), mounted only for signed-in administrators
 *
 * They remain separate render surfaces, but main.tsx starts both downloads on
 * the public page. The website stays in front while the studio is prepared in
 * the background, making the hand-off after sign-in immediate.
 *
 * There is deliberately no router dependency: the site is a single scrolling
 * page, so "routing" is one path check plus a popstate listener.
 */

export type SiteRoute = "site" | "studio" | "admin";

/** Where the application lives. */
export const STUDIO_PATH = "/app";
/** Where the public website lives. */
export const SITE_PATH = "/";
/** Where the owner's admin surfaces live (the Email Centre today). */
export const ADMIN_PATH = "/admin";

/**
 * The areas of the front page, in the order they appear on it.
 *
 * This is the one list behind three things: the friendly deep-link paths
 * below, the shortcut list in the corner menu, and the scrolling that happens
 * when either is used. The menu used to carry its own hand-written list of
 * "features" whose links went to separate marketing pages instead of to the
 * areas they named, which is why a shortcut never took anyone to the thing
 * they clicked.
 */
export interface SiteSection {
  /** The element id rendered by MarketingSite. */
  id: string;
  /** What the menu calls it. */
  label: string;
  /** Its friendly URL. */
  path: string;
}

export const SITE_SECTIONS: readonly SiteSection[] = [
  { id: "workflow", label: "How it works", path: "/workflow" },
  { id: "scenes", label: "Scenes", path: "/scenes" },
  { id: "visuals", label: "Visuals", path: "/visuals" },
  { id: "voice", label: "Voice over", path: "/voice" },
  { id: "captions", label: "Captions", path: "/captions" },
  { id: "video-studio", label: "Video Studio", path: "/video-studio" },
  { id: "effects", label: "Effects library", path: "/effects" },
  { id: "control", label: "You stay in control", path: "/control" },
  { id: "no-meter", label: "No credits or tokens", path: "/no-meter" },
  { id: "examples", label: "Examples", path: "/examples" },
  { id: "formats", label: "Formats & devices", path: "/formats" },
  { id: "sources", label: "Visual sources", path: "/sources" },
  { id: "pricing", label: "Pricing", path: "/pricing" },
];

/**
 * Friendly URLs that deep-link into a section of the public website.
 * Keys are paths, values are the section id rendered by MarketingSite.
 */
export const SITE_SECTION_PATHS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(SITE_SECTIONS.map((section) => [section.path, section.id])),
  "/questions": "questions",
  // kept from the original launch URLs
  "/product": "workflow",
};

/**
 * The areas that live on the /features tour rather than on the front page.
 *
 * The front page used to demonstrate everything; it is now a sales page and
 * the full demonstrations moved to /features. A deep link like /captions has
 * to open the page that actually renders #captions, so the router needs to
 * know which page that is. Everything not in this list (no-meter, examples,
 * pricing) still lives on the front page.
 */
export const FEATURE_TOUR_SECTION_IDS: readonly string[] = [
  "questions",
  "workflow",
  "scenes",
  "visuals",
  "voice",
  "captions",
  "video-studio",
  "effects",
  "before-after",
  "control",
  "formats",
  "devices",
  "sources",
];

/** True when a path deep-links to an area of the /features tour. */
export function isFeatureTourPath(pathname: string): boolean {
  const id = sectionForPath(pathname);
  return id !== null && FEATURE_TOUR_SECTION_IDS.includes(id);
}

/** Lower-cased, trailing-slash-free path. `""` and `"/"` both become `"/"`. */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return (trimmed === "" ? "/" : trimmed).toLowerCase();
}

/** Which surface a path belongs to. Unknown paths fall back to the website. */
export function routeForPath(pathname: string): SiteRoute {
  const path = normalizePath(pathname);
  if (path === ADMIN_PATH || path.startsWith(`${ADMIN_PATH}/`)) return "admin";
  return path === STUDIO_PATH || path.startsWith(`${STUDIO_PATH}/`) || ["/login", "/register", "/forgot-password"].includes(path) ? "studio" : "site";
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

/**
 * Scroll an area of the front page into view, exactly the way the question
 * band at the top does it: reduced motion is honoured, and the area flashes
 * briefly so the eye lands on the answer rather than on a wall of page.
 *
 * Returns false when the element is not on screen — the caller then has to
 * go to the front page first.
 */
export function scrollToSection(id: string): boolean {
  if (typeof document === "undefined") return false;
  const target = document.getElementById(id);
  if (!target) return false;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  target.classList.add("is-answering");
  window.setTimeout(() => target.classList.remove("is-answering"), 2200);

  /*
   * Re-aim once the page has settled.
   *
   * The front page skips the layout of off-screen sections until they are
   * approached (`content-visibility: auto`), and images below the fold arrive
   * late, so at the moment of the jump the target may still be standing at its
   * estimated height rather than its real one — a section that measured 900px
   * can grow by several hundred once its pictures have decoded, leaving the
   * jump short of the heading it promised to land on.
   *
   * So: after a frame AND after a slightly longer grace period, re-measure the
   * target and correct if the page has moved it. The correction is a plain
   * scroll (never another jump), so it cannot fight the browser's own scroll.
   */
  const settle = (behavior: ScrollBehavior) => {
    const top = target.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(window.scrollY - top) > 12) window.scrollTo({ top, behavior });
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => settle("auto")));
  window.setTimeout(() => settle("auto"), 320);
  return true;
}

/**
 * Take the visitor to an area of the front page from anywhere.
 *
 * On the front page it simply scrolls. From /pricing, /faq or the studio it
 * navigates home first and scrolls once the page has rendered — the whole
 * point being that the shortcut always ends at the area it names.
 */
export function goToSection(id: string): void {
  if (typeof window === "undefined") return;
  if (scrollToSection(id)) {
    const section = SITE_SECTIONS.find((entry) => entry.id === id);
    if (section) window.history?.replaceState?.({}, "", section.path);
    return;
  }
  const section = SITE_SECTIONS.find((entry) => entry.id === id);
  navigate(section?.path ?? "/");
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
