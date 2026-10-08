import { useEffect, useState, type CSSProperties } from "react";

/**
 * The social icons for the public website and the app.
 *
 * Each glyph is the platform's original mark drawn as a single official-path
 * SVG — the recognisable YouTube play button, the Facebook "f", the LinkedIn
 * "in" tile, and the monochrome X wordmark and TikTok note — rather than a
 * generic icon-font lookalike.
 *
 * Colour follows the surface. The three marks that have a brand colour keep
 * it everywhere (YouTube red, Facebook blue, LinkedIn blue). X and TikTok are
 * black marks in their own brand books, so they are drawn with
 * `currentColor`: they take the ink of whatever surface they sit on — black
 * on the light themes' near-white header, white on the dark corner menu and
 * the dark themes — and can therefore never be grey-on-grey, which is what a
 * fixed pale grey becomes on a light header.
 *
 * Which profiles exist is not hard-coded: the owner saves the URLs in the
 * administration panel, the server stores them with the rest of the platform
 * settings, and this strip renders only the links that are actually
 * configured. No links saved → nothing rendered, on any surface.
 */

export type SocialLinkSet = { youtube: string; facebook: string; linkedin: string; x: string; tiktok: string };

/** Every platform present and empty — the shape the server, the admin form and the strip all start from. */
export const EMPTY_SOCIAL_LINKS: SocialLinkSet = { youtube: "", facebook: "", linkedin: "", x: "", tiktok: "" };

const EMPTY_LINKS: SocialLinkSet = EMPTY_SOCIAL_LINKS;

/**
 * Original brand marks. Paths are the platforms' official single-path logos on
 * a 24×24 grid. `adaptive` means the mark is monochrome in its own brand book
 * and must take the surface's ink (currentColor) rather than a fixed colour.
 */
export const SOCIAL_ICONS: { id: keyof SocialLinkSet; label: string; color: string; adaptive?: boolean; placeholder: string; path: string }[] = [
  { id: "youtube", label: "YouTube", color: "#FF0000", placeholder: "https://www.youtube.com/@yourchannel", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { id: "facebook", label: "Facebook", color: "#1877F2", placeholder: "https://www.facebook.com/yourpage", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", placeholder: "https://www.linkedin.com/company/yourcompany", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
  { id: "x", label: "X", color: "currentColor", adaptive: true, placeholder: "https://x.com/yourhandle", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { id: "tiktok", label: "TikTok", color: "currentColor", adaptive: true, placeholder: "https://www.tiktok.com/@yourhandle", path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
];

/**
 * One brand mark. Coloured marks keep their brand colour on every surface;
 * the monochrome ones (X, TikTok) follow the surface's ink so they are black
 * on light and white on dark. `tone` is kept for the callers that still pass
 * it, but it no longer decides those two marks — the surface does.
 */
export function SocialIcon({ id, size = 20, tone = "dark" }: { id: keyof SocialLinkSet; size?: number; tone?: "dark" | "light" }) {
  const icon = SOCIAL_ICONS.find((entry) => entry.id === id);
  if (!icon) return null;
  const fill = icon.adaptive ? "currentColor" : icon.color;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-hidden="true" focusable="false" data-tone={tone}>
      <path d={icon.path} fill={fill} />
    </svg>
  );
}

/* One fetch per page load, shared by every strip on the page. */
let cachedLinks: SocialLinkSet | null = null;
let pendingLinks: Promise<SocialLinkSet> | null = null;

async function loadSocialLinks(): Promise<SocialLinkSet> {
  if (cachedLinks) return cachedLinks;
  if (!pendingLinks) {
    pendingLinks = fetch("/api/social-links")
      .then((response) => (response.ok ? response.json() : { links: EMPTY_LINKS }))
      .then((data) => { const next: SocialLinkSet = { ...EMPTY_LINKS, ...(data?.links || {}) }; cachedLinks = next; return next; })
      .catch(() => { pendingLinks = null; return EMPTY_LINKS; });
  }
  return pendingLinks;
}

/** Drop the cached copy so the admin panel's save is visible without a reload. */
export function invalidateSocialLinks() { cachedLinks = null; pendingLinks = null; }

export function useSocialLinks(): SocialLinkSet {
  const [links, setLinks] = useState<SocialLinkSet>(cachedLinks || EMPTY_LINKS);
  useEffect(() => {
    let alive = true;
    const refresh = () => { if (typeof fetch === "function") void loadSocialLinks().then((next) => { if (alive) setLinks(next); }); };
    refresh();
    /* A tab opened before the owner saved their links would otherwise show
       no icons until a manual reload. Re-check whenever the tab regains
       focus, so saving in the studio shows up on an already-open page. */
    const revalidate = () => { invalidateSocialLinks(); refresh(); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { alive = false; window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, []);
  return links;
}

/**
 * The row of configured social profiles. Renders nothing when the owner has
 * not saved any links, so empty marks never appear on any surface. The
 * glyphs sit directly on the page — no boxes or borders. The monochrome X and
 * TikTok marks take the surrounding ink, so they stay legible on the light
 * themes' header and the dark menu without either surface passing a flag.
 */
export default function SocialLinksRow({ size = 24, tone = "dark", className, style }: { size?: number; tone?: "dark" | "light"; className?: string; style?: CSSProperties }) {
  const links = useSocialLinks();
  const active = SOCIAL_ICONS.filter((icon) => links[icon.id]);
  if (active.length === 0) return null;
  return (
    <nav aria-label="Scenering on social media" className={className} style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.55), ...style }}>
      {active.map((icon) => (
        <a
          key={icon.id}
          href={links[icon.id]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Scenering on ${icon.label} (opens in a new tab)`}
          title={icon.label}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 4, lineHeight: 0 }}
        >
          <SocialIcon id={icon.id} size={size} tone={tone} />
        </a>
      ))}
    </nav>
  );
}
