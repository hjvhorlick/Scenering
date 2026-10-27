import { scrollToSection } from "../../lib/route";
import { MarketingImage, Pill } from "../components/primitives";
import CaptionLine from "../components/CaptionLine";
import {
  DEMO_CAPTION_STYLE,
  DEMO_PROJECT,
  DEMO_SCENES,
  DEMO_TOTAL_SECONDS,
  formatDuration,
} from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import { PROJECT_PHASES } from "../../components/StepNav";

/**
 * The hero: the promise, the two buttons, and one small picture.
 *
 * The copy side is unchanged — it is the part that works: the promise, the
 * sub-line, Start Free and See Plans & Pricing, the four pills and the honest
 * note about where your work lives.
 *
 * What is gone is the workspace that used to sit beside it: an app frame with
 * a six-tab rail, a script sheet, a 16:9 player, four chips, a five-card scene
 * strip, a waveform, a caption stage, a three-lane timeline and another
 * six-button stage rail. That single composition was around 900px tall on a
 * phone and was the widest thing on the page — the one block that kept
 * running past the right edge.
 *
 * In its place: one 16:9 still from the demonstration project with its
 * duration, one caption sample drawn from the real caption catalogue, and the
 * existing honesty line. It is the same on a phone as on a desktop.
 */
export default function Hero() {
  const scene = DEMO_SCENES[3];

  return (
    <header className="mkt-hero" id="top">
      <div className="mkt-container">
        <div className="mkt-hero-grid">
          {/* ------------------------------------------------ the promise */}
          <div>
            <div className="mkt-eyebrow">Script to finished video</div>
            <h1 className="mkt-h1">{MESSAGES.hero}</h1>
            <p className="mkt-lead">{MESSAGES.heroSub}</p>

            {/* No shortcut into the studio here — signing in is a decision
                for the top of the page, not something to trip over. The
                second button goes to the plans further down this page: the
                price is part of the pitch, not a secret for the footer. */}
            <div className="mkt-hero-cta">
              <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="/register">
                Start Free
              </a>
              <a
                className="mkt-btn mkt-btn-lg"
                href="#pricing"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  scrollToSection("pricing");
                }}
              >
                See Plans &amp; Pricing
              </a>
            </div>

            <div className="mkt-hero-note">
              <Pill tone="live">
                <span className="mkt-dot" aria-hidden="true" />
                Free membership · no payment required
              </Pill>
              <Pill>{LIVE_COUNTS.voices} narrators</Pill>
              <Pill>{LIVE_COUNTS.captionStyles} caption styles</Pill>
              <Pill>16:9 and 9:16</Pill>
            </div>
            <p className="mkt-small" style={{ marginTop: 12 }}>
              {HONESTY.localNote}
            </p>
          </div>

          {/* --------------------------------------- one small finished scene */}
          <figure className="mkt-hero-art">
            <MarketingImage
              assetId={scene.assetId}
              sizes="(min-width: 1080px) 420px, 92vw"
              eager
            >
              <span className="mkt-thumb-tag">{formatDuration(DEMO_TOTAL_SECONDS)}</span>
              <span className="mkt-thumb-tag is-right">{DEMO_PROJECT.format}</span>
            </MarketingImage>

            <div className="mkt-capstage" style={{ marginTop: 10 }}>
              <CaptionLine text={scene.caption} style={DEMO_CAPTION_STYLE} size={14} highlightWord={1} />
            </div>

            {/* The six phases, as one small row of chips rather than the
                six-tab rail and the six-button stage rail that used to bracket
                the workspace. Same phases, same order, one line each. */}
            <ul className="mkt-hero-phases" aria-label="The six phases">
              {PROJECT_PHASES.map((entry, index) => (
                <li key={entry.id}>
                  <span className="mkt-opt-no">{String(index + 1).padStart(2, "0")}</span> {entry.tab}
                </li>
              ))}
            </ul>

            <figcaption className="mkt-figcap">
              <Pill>{HONESTY.conceptLabel}</Pill>
              <span>“{DEMO_PROJECT.title}” — a fictional project used across this page.</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </header>
  );
}
