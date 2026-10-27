import { useEffect } from "react";
import "./marketing.css";
import { navigate, scrollToSection, sectionForPath } from "../lib/route";
import { BrandMark, Stat } from "./components/primitives";
import BackToTop from "./components/BackToTop";
import HeaderLegalMenu from "./components/HeaderLegalMenu";
import Hero from "./sections/Hero";
import Showpiece from "./sections/Showpiece";
import FeatureTour from "./sections/FeatureTour";
import EffectsLibrary from "./sections/EffectsLibrary";
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
import AdSlot from "../shared/AdSlot";
import StoreNoticeBanner from "../shared/StoreNotice";
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
 *   (six compact cards, each linking to its full demonstration) → what it
 *   costs to run (nothing metered) → the plans → finished examples → start
 *
 * The single advertising unit sits directly under the hero, where a visitor
 * who is not ready to choose a plan can still be served one — and never in
 * the hero itself, beside the price list, or over a demonstration.
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

          {/* The owner's configured social profiles, in the header as well as
              the footer, directly right of the wordmark. They used to sit past
              the flex spacer, which parked them at the far edge of the bar
              where the fixed corner menu covers them. Hidden on narrow screens
              by .mkt-nav-social. */}
          <SocialLinksRow size={13} tone="light" className="mkt-nav-social" />

          <span className="mkt-nav-spacer" />

          <div className="mkt-nav-links">
            {NAV.map((item) => (
              <a key={item.href} className="mkt-nav-link" href={item.href}>
                {item.label}
              </a>
            ))}
            <HeaderLegalMenu currentPath={publicPath} />
          </div>

          {/* The shared corner menu owns public navigation and account actions
              on every Scenering surface. This spacer keeps the fixed button
              clear of the wordmark and desktop link rail. */}
          <span className="sc-corner-reserve" aria-hidden="true" />
        </div>
      </nav>

      <StoreNoticeBanner />

      <main id="main" tabIndex={-1}>
        <Showpiece />
        <Hero />

        {/* The one advertising unit on the public site: directly below the
            hero, the first quiet pause on the page, and never in the hero,
            beside the pricing decision or over a demonstration. Renders
            nothing until AdSense is configured (src/shared/ads.ts). */}
        <AdSlot kind="web" className="mkt-ad" testId="adsense-web" />

        {/* what the numbers actually are */}
        <div className="mkt-container mkt-stats-band">
          <div className="mkt-stats">
            <Stat value={`${LIVE_COUNTS.voices}`} label="narrators" />
            <Stat value={`${LIVE_COUNTS.captionStyles}`} label="caption styles" />
            <Stat value={`${CATALOG_COUNTS.filters}`} label="video filters" />
            <Stat value={`${CATALOG_COUNTS.musicTracks + CATALOG_COUNTS.soundEffects}`} label="music & effects" />
          </div>
        </div>

        {/* What can go on a scene — the effects library, lifted off the tour
            and placed high up here, because "what can I actually put on the
            picture?" is a question this page should answer before it asks for
            a plan. One block, six small cards, four names each. */}
        <EffectsLibrary />

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
              <SocialLinksRow size={24} style={{ marginTop: 14 }} />
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

            {/* The legal documents every approver, and every buyer at
                checkout, needs to reach from the front page: terms of
                service, privacy policy and refund & cancellation policy,
                plus cookie information. The same four sit in the corner
                menu, the bottom legal bar and the standalone-page footer. */}
            <div>
              <h4>Legal &amp; Policies</h4>
              <ul className="mkt-footer-legal-list">
                <li>
                  <a href="/terms" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/terms"); } }}>
                    Terms of Service
                  </a>
                  <span>Rules, plans &amp; billing</span>
                </li>
                <li>
                  <a href="/privacy" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/privacy"); } }}>
                    Privacy Policy
                  </a>
                  <span>Account &amp; browser data</span>
                </li>
                <li>
                  <a href="/refunds" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/refunds"); } }}>
                    Refund &amp; Cancellation Policy
                  </a>
                  <span>Cancelling &amp; FastSpring refunds</span>
                </li>
                <li>
                  <a href="/cookies" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/cookies"); } }}>
                    Cookie Information
                  </a>
                  <span>Session cookie &amp; storage</span>
                </li>
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

          <div className="mkt-footer-legal-bar" aria-label="Legal documents">
            <span className="mkt-footer-legal-label">Legal documents</span>
            <div className="mkt-footer-legal-pills">
              <a href="/terms" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/terms"); } }}>Terms of Service</a>
              <a href="/privacy" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/privacy"); } }}>Privacy Policy</a>
              <a href="/refunds" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/refunds"); } }}>Refund &amp; Cancellation Policy</a>
              <a href="/cookies" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/cookies"); } }}>Cookie Information</a>
            </div>
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: "#98a1b8" }}>
            Every interface on this page is the real Scenering workflow shown with example content. Where something
            is planned rather than built, it says so. Nothing here promises views, subscribers or results.<br />
            © 2026 Henry John Vincent Horlick · Horlick Group. Scenering. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
