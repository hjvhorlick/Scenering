import { useEffect } from "react";
import "./marketing.css";
import { navigate, sectionForPath, STUDIO_PATH } from "../lib/route";
import { BrandMark, Stat } from "./components/primitives";
import Hero from "./sections/Hero";
import IdeaToVideo from "./sections/IdeaToVideo";
import ScenesSection from "./sections/ScenesSection";
import VisualResearch from "./sections/VisualResearch";
import VoiceSection from "./sections/VoiceSection";
import CaptionsSection from "./sections/CaptionsSection";
import VideoStudioSection from "./sections/VideoStudioSection";
import EffectsLibrary from "./sections/EffectsLibrary";
import BeforeAfter from "./sections/BeforeAfter";
import Control from "./sections/Control";
import Examples from "./sections/Examples";
import Formats from "./sections/Formats";
import Devices from "./sections/Devices";
import Sources from "./sections/Sources";
import Pricing from "./sections/Pricing";
import FinalCta from "./sections/FinalCta";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES } from "./product-facts";
import { MARKETING_ASSETS } from "./assets";

/**
 * The public website.
 *
 * It is one page, and the page is the product story in the order a visitor
 * lives it (spec §34):
 *
 *   hero → workflow → scenes → visuals → voice → captions → Video Studio →
 *   effects → before/after → control → examples → formats → devices →
 *   sources → pricing → start
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

  const conceptCount = MARKETING_ASSETS.filter((asset) => asset.status === "concept").length;
  const renderedCount = MARKETING_ASSETS.filter((asset) => asset.status === "rendered").length;

  return (
    <div className="mkt-root">
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

          <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => navigate(STUDIO_PATH)}>
            Open the studio
          </button>
        </div>
      </nav>

      <main id="main" tabIndex={-1}>
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

        <IdeaToVideo />
        <ScenesSection />
        <VisualResearch />
        <VoiceSection />
        <CaptionsSection />
        <VideoStudioSection />
        <EffectsLibrary />
        <BeforeAfter />
        <Control />
        <Examples />
        <Formats />
        <Devices />
        <Sources />
        <Pricing />
        <FinalCta />
      </main>

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
