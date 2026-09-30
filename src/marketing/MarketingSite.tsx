import { useEffect, useRef, useState } from "react";
import "./marketing.css";
import { navigate, sectionForPath, STUDIO_PATH } from "../lib/route";
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
import { iconify } from "../components/icons/Icon";

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
  { id: "workflow", label: "How it works" },
  { id: "scenes", label: "Scenes" },
  { id: "visuals", label: "Visuals" },
  { id: "voice", label: "Voice" },
  { id: "captions", label: "Captions" },
  { id: "video-studio", label: "Video Studio" },
  { id: "examples", label: "Examples" },
  { id: "pricing", label: "Plans" },
];

export default function MarketingSite() {
  // Below 1000px the link rail does not fit beside the wordmark, so it
  // collapses into this panel rather than disappearing — on a page this long,
  // a phone without navigation is a phone with a scrollbar and nothing else.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The studio themes paint the document dark; the website is its own light
  // surface, and this flag lets the stylesheet claim <html> while it is open.
  useEffect(() => {
    document.documentElement.setAttribute("data-mkt", "1");
    return () => document.documentElement.removeAttribute("data-mkt");
  }, []);

  // /pricing, /scenes and friends open the page at that section.
  useEffect(() => {
    const section = sectionForPath(window.location.pathname);
    if (!section) return;
    const target = document.getElementById(section);
    if (!target) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  // Escape closes it, and so does a click anywhere else on the page.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  const conceptCount = MARKETING_ASSETS.filter((asset) => asset.status === "concept").length;
  const renderedCount = MARKETING_ASSETS.filter((asset) => asset.status === "rendered").length;

  return (
    <div className="mkt-root">
      <IconSprite />
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
              <a key={item.id} className="mkt-nav-link" href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
          </div>

          <span className="mkt-nav-spacer" />

          {/* The same links, for screens the rail does not fit on. */}
          <div className="mkt-nav-menu" ref={menuRef}>
            <button
              type="button"
              className="mkt-btn mkt-btn-quiet mkt-nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="mkt-nav-panel"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{iconify(menuOpen ? "✕" : "☰")}</span>
              <span>Sections</span>
            </button>

            {menuOpen && (
              <div className="mkt-nav-panel" id="mkt-nav-panel">
                {NAV.map((item) => (
                  <a
                    key={item.id}
                    className="mkt-nav-panel-link"
                    href={`#${item.id}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* The only way into the studio anywhere on this site. There are
              no shortcuts past it: the sign-in screen is the door. */}
          <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => navigate(STUDIO_PATH)}>
            Sign in
          </button>
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
            </div>

            <div>
              <h4>The workflow</h4>
              <ul>
                {NAV.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
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
            is planned rather than built, it says so. Nothing here promises views, subscribers or results.
          </p>
        </div>
      </footer>
    </div>
  );
}
