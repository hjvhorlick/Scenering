import { useEffect } from "react";
import "./marketing.css";
import { navigate, scrollToSection, sectionForPath } from "../lib/route";
import { BrandMark, Stat } from "./components/primitives";
import BackToTop from "./components/BackToTop";
import Hero from "./sections/Hero";
import Showpiece from "./sections/Showpiece";
import Questions from "./sections/Questions";
import IdeaToVideo from "./sections/IdeaToVideo";
import ScenesSection from "./sections/ScenesSection";
import VisualResearch from "./sections/VisualResearch";
import VoiceSection from "./sections/VoiceSection";
import CaptionsSection from "./sections/CaptionsSection";
import VideoStudioSection from "./sections/VideoStudioSection";
import EffectsLibrary from "./sections/EffectsLibrary";
import BeforeAfter from "./sections/BeforeAfter";
import Control from "./sections/Control";
import NoMeter from "./sections/NoMeter";
import Examples from "./sections/Examples";
import Formats from "./sections/Formats";
import Devices from "./sections/Devices";
import Sources from "./sections/Sources";
import Pricing from "./sections/Pricing";
import FinalCta from "./sections/FinalCta";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES } from "./product-facts";
import { MARKETING_ASSETS } from "./assets";
import IconSprite from "../components/icons/IconSprite";
import PublicPage, { isStandalonePublicPath } from "./PublicPage";
import SiteCornerMenu from "../shared/SiteCornerMenu";
import SocialLinksRow from "../shared/SocialLinks";

/**
 * The public website.
 *
 * It is one page, and the page is the product story in the order a visitor
 * lives it (spec §34):
 *
 *   hero → the five questions → workflow → scenes → visuals → voice →
 *   captions → Video Studio → effects → before/after → control → no meter →
 *   examples → formats → devices → sources → pricing → start
 *
 * The questions band sits directly under the hero on purpose: a visitor
 * arrives with a doubt, not with an interest in features, and each question
 * jumps to the section that settles it.
 *
 * Everything below is composed from the same demonstration project and the
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

  const conceptCount = MARKETING_ASSETS.filter((asset) => asset.status === "concept").length;
  const renderedCount = MARKETING_ASSETS.filter((asset) => asset.status === "rendered").length;
  const publicPath = typeof window === "undefined" ? "/" : (window.location.pathname.replace(/\/+$/, "") || "/");

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

        <Questions />

        <IdeaToVideo />
        <ScenesSection />
        <VisualResearch />
        <VoiceSection />
        <CaptionsSection />
        <VideoStudioSection />
        <EffectsLibrary />
        <BeforeAfter />
        <Control />
        <NoMeter />
        <Examples />
        <Formats />
        <Devices />
        <Sources />
        <Pricing />
        <section className="mkt-section" id="about"><div className="mkt-container pub-callout"><div><h2>Built for creators who want control without filming.</h2><p>Scenering brings scene planning, visual research, narration, captions and finishing into one guided workflow for education, storytelling, organizations, training, travel, business and social content.</p></div><a className="mkt-btn mkt-btn-primary" href="/about">About Scenering</a></div></section>
        <section className="mkt-section" id="faq"><div className="mkt-container"><div className="mkt-section-head"><span className="mkt-eyebrow">FAQ</span><h2>Preview freely. Export when it is right.</h2><p>Free creates real finished videos. Paid plans add more creative capability and production capacity, and cancelling never automatically deletes projects.</p></div><p><a href="/faq">Read all frequently asked questions →</a></p></div></section>
        <section className="mkt-section" id="contact"><div className="mkt-container pub-callout"><div><h2>Questions about the product, account or billing?</h2><p>Send a validated support request and choose the category that fits your question.</p></div><a className="mkt-btn mkt-btn-primary" href="/contact">Contact Scenering</a></div></section>
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
              <SocialLinksRow size={18} style={{ marginTop: 14 }} />
            </div>

            <div>
              <h4>The workflow</h4>
              <ul>
                {NAV.slice(0, 6).map((item) => (
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
