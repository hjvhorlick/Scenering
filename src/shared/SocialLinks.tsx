import { useEffect, useState, type CSSProperties } from "react";

/**
 * The social icons for the public website and the app.
 *
 * Each glyph is the platform's original mark drawn as a single official-path
 * SVG in the platform's own brand color — the recognisable YouTube play
 * button, the Facebook "f", the LinkedIn "in" tile and the X wordmark —
 * rather than a generic icon-font lookalike.
 *
 * Which profiles exist is not hard-coded: the owner saves the URLs in the
 * administration panel, the server stores them with the rest of the platform
 * settings, and this strip renders only the links that are actually
 * configured. No links saved → nothing rendered, on any surface.
 */

export type SocialLinkSet = { youtube: string; facebook: string; linkedin: string; x: string };

const EMPTY_LINKS: SocialLinkSet = { youtube: "", facebook: "", linkedin: "", x: "" };

/** Original brand marks. Paths are the platforms' official single-path logos on a 24×24 grid. */
export const SOCIAL_ICONS: { id: keyof SocialLinkSet; label: string; color: string; colorOnLight?: string; path: string }[] = [
  { id: "youtube", label: "YouTube", color: "#FF0000", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { id: "facebook", label: "Facebook", color: "#1877F2", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
  { id: "x", label: "X", color: "#E7E9EA", colorOnLight: "#0F1419", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
];

/** One brand mark, drawn with its original path in its brand color. */
export function SocialIcon({ id, size = 20, tone = "dark" }: { id: keyof SocialLinkSet; size?: number; tone?: "dark" | "light" }) {
  const icon = SOCIAL_ICONS.find((entry) => entry.id === id);
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-hidden="true" focusable="false">
      <path d={icon.path} fill={tone === "light" ? icon.colorOnLight || icon.color : icon.color} />
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
 * glyphs sit directly on the page — no boxes or borders — and `tone="light"`
 * switches the X mark to its dark-on-light form for light backgrounds like
 * the site header and the sign-in page.
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
