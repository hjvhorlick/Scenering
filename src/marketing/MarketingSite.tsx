import { useEffect } from "react";
import "./marketing.css";
import { navigate, scrollToSection, sectionForPath } from "../lib/route";
import { BrandMark, Stat } from "./components/primitives";
import BackToTop from "./components/BackToTop";
import Hero from "./sections/Hero";
import Showpiece from "./sections/Showpiece";
import FeatureTour from "./sections/FeatureTour";
import NoMeter from "./sections/NoMeter";
import Examples from "./sections/Examples";
import Pricing from "./sections/Pricing";
import FinalCta from "./sections/FinalCta";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES } from "./product-facts";
import { MARKETING_ASSETS } from "./assets";
import IconSprite from "../components/icons/IconSprite";
import PublicPage, { isStandalonePublicPath } from "./PublicPage";
import SiteCornerMenu from "../shared/SiteCornerMenu";
import SocialLinksRow from "../shared/SocialLinks";
import { applyPageSeo } from "./seo";

/**
 * The public website's front page — a sales page, not a manual.
 *
 * It used to demonstrate the entire product in sequence: sixteen sections,
 * most of them long interactive walkthroughs. Thorough, but it read like a
 * training course, and the pricing — the thing a convinced visitor needs
 * next — sat below three thousand pixels of tutorial. The walkthroughs have
 * moved to /features, where the corner menu's shortcuts and the Features
 * button lead, and the front page now makes the case the way a salesperson
 * would:
 *
 *   key art → the promise (hero) → proof in numbers → what you get
 *   (six cards, each linking to its full demonstration) → what it costs
 *   to run (nothing metered) → the plans → finished examples → start
 *
 * Everything is still composed from the same demonstration project and the
 * app's own catalogues, so improving Scenering improves this page.
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/manual", label: "Manual" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export default function MarketingSite() {
  const publicPath = typeof window === "undefined" ? "/" : (window.location.pathname.replace(/\/+$/, "") || "/");

  // The studio themes paint the document dark; the website is its own light
  // surface, and this flag lets the stylesheet claim <html> while it is open.
  useEffect(() => {
    document.documentElement.setAttribute("data-mkt", "1");
    return () => document.documentElement.removeAttribute("data-mkt");
  }, []);

  /**
   * /scenes, /captions, /pricing and friends open the page at that area.
   *
   * It listens for navigation as well as running once: the corner menu's
   * section shortcuts and the Back button both change the path without
   * reloading, and a shortcut that only worked on a cold load was a shortcut
   * that appeared to do nothing. The first run waits a frame so the lazy
   * parts of the page have laid out before anything is scrolled to.
   */
  useEffect(() => {
    let timer = 0;
    const jump = () => {
      const section = sectionForPath(window.location.pathname);
      if (!section) return;
      timer = window.setTimeout(() => scrollToSection(section), 60);
    };
    jump();
    window.addEventListener("popstate", jump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", jump);
    };
  }, []);

  // Section aliases such as /voice and /captions are anchors on the homepage,
  // not separate documents. Give them the homepage metadata and canonical URL.
  useEffect(() => {
    if (!isStandalonePublicPath(publicPath)) applyPageSeo("/", "/");
  }, [publicPath]);

  const conceptCount = MARKETING_ASSETS.filter((asset) => asset.status === "concept").length;
  const renderedCount = MARKETING_ASSETS.filter((asset) => asset.status === "rendered").length;

  if (isStandalonePublicPath(publicPath)) return <PublicPage path={publicPath} />;

  return (
    <div className="mkt-root">
      <IconSprite />
      <SiteCornerMenu />
      <a className="mkt-skip" href="#main">
        Skip to content
      </a>

      <nav className="mkt-nav" aria-label="Main">
        <div className="mkt-container mkt-nav-inner">
          <button type="button" className="mkt-nav-logo" onClick={() => navigate("/")} aria-label="Scenering — home">
            <BrandMark height={26} />
          </button>

          <div className="mkt-nav-links">
            {NAV.map((item) => (
              <a key={item.href} className="mkt-nav-link" href={item.href}>
                {item.label}
              </a>
            ))}
          </div>

          <span className="mkt-nav-spacer" />

          {/* The owner's configured social profiles, in the header as well as
              the footer. Hidden on narrow screens by .mkt-nav-social. */}
          <SocialLinksRow size={36} tone="light" className="mkt-nav-social" />

          {/* The shared corner menu owns public navigation and account actions
              on every Scenering surface. This spacer keeps the fixed button
              clear of the wordmark and desktop link rail. */}
          <span style={{ width: 92 }} aria-hidden="true" />
        </div>
      </nav>

      <main id="main" tabIndex={-1}>
        <Showpiece />
        <Hero />

        {/* what the numbers actually are */}
        <div className="mkt-container" style={{ paddingBottom: 8 }}>
          <div className="mkt-stats">
            <Stat value={`${LIVE_COUNTS.voices}`} label="narrators, with previews" />
            <Stat value={`${LIVE_COUNTS.captionStyles}`} label="caption styles" />
            <Stat value={`${CATALOG_COUNTS.filters}`} label="video filters" />
            <Stat value={`${CATALOG_COUNTS.musicTracks + CATALOG_COUNTS.soundEffects}`} label="music & sound effects" />
          </div>
        </div>

        {/* What you get — six cards, one benefit each, every one linking to
            its full demonstration on /features. The demonstrations
            themselves live there now, not here. */}
        <FeatureTour />

        {/* The cost objection, answered before the price is shown… */}
        <NoMeter />

        {/* …and then the plans, high on the page where the decision is
            made — not at the bottom of a tour. */}
        <Pricing />

        {/* Proof: the kinds of videos it makes. */}
        <Examples />

        <FinalCta />
      </main>

      <BackToTop />

      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-grid">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <BrandMark height={30} />
              </div>
              <p style={{ marginTop: 10, fontSize: 13.5, maxWidth: 380, color: "#98a1b8" }}>
                {MESSAGES.hero} {HONESTY.localNote}
              </p>
              <SocialLinksRow size={48} style={{ marginTop: 14 }} />
            </div>

            <div>
              <h4>Explore</h4>
              <ul>
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4>About these visuals</h4>
              <ul>
                <li>{renderedCount} interfaces drawn from the app’s own data</li>
                <li>{conceptCount} photographs made for this page</li>
                <li>Demonstration project is fictional</li>
                <li>Planned features are labelled “Coming soon”</li>
              </ul>
            </div>
          </div>

          <p style={{ marginTop: 26, fontSize: 12, color: "#7a8399" }}>
            Every interface on this page is the real Scenering workflow shown with example content. Where something
            is planned rather than built, it says so. Nothing here promises views, subscribers or results.<br />
            © 2026 Henry John Vincent Horlick. Scenering. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
