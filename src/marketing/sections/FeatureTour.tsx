import { Section, SectionHead, MarketingImage } from "../components/primitives";
import { LIVE_COUNTS } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * The features, as a shop window rather than a lecture.
 *
 * The front page used to demonstrate every part of the product in full —
 * eight long interactive sections, one after another — which read like a
 * training course and buried the price. Those demonstrations now live on
 * /features, where someone who wants the detail can take their time. This
 * section is what replaced them on the front page: six cards, one benefit
 * each, a picture from the demonstration project, and a link straight to
 * the full demonstration of that one thing.
 *
 * The photographs are the same stills the demonstration project uses
 * elsewhere on the site — one set of artwork, reused, exactly as a visitor
 * will reuse one set of pictures across their own scenes.
 */

const TOUR = [
  {
    id: "scenes",
    path: "/scenes",
    assetId: "scene.01",
    title: "Your script becomes a storyboard",
    pitch: "Paste a script and it is split into editable scenes — reorder, rewrite and retime every one.",
  },
  {
    id: "visuals",
    path: "/visuals",
    assetId: "search.well",
    title: "The right pictures, found for you",
    pitch: "Every scene searches Pexels, Pixabay and Wikimedia Commons. One click swaps any shot.",
  },
  {
    id: "voice",
    path: "/voice",
    assetId: "scene.02",
    title: "Narration without a microphone",
    pitch: `${LIVE_COUNTS.voices} narrators with previews read your scenes aloud, timed word by word.`,
  },
  {
    id: "captions",
    path: "/captions",
    assetId: "scene.03",
    title: "Captions people actually read",
    pitch: `${LIVE_COUNTS.captionStyles} caption styles, synced to the narration, styled per project or per scene.`,
  },
  {
    id: "video-studio",
    path: "/video-studio",
    assetId: "scene.04",
    title: "Music, motion and polish",
    pitch: "Filters, lower thirds, camera movement, music beds and sound effects — the finishing room.",
  },
  {
    id: "effects",
    path: "/effects",
    assetId: "scene.05",
    title: "Finished videos, 16:9 and 9:16",
    pitch: "Preview as often as you like, then export a finished video for YouTube, Shorts or Reels.",
  },
] as const;

export default function FeatureTour() {
  return (
    <Section id="features" tone="white">
      <SectionHead
        id="features"
        eyebrow="What you get"
        title="Everything a faceless channel needs, in one studio."
        lead="Six stages, each one editable. Pick any card to see that stage demonstrated with a real project."
      />

      <div className="mkt-tour">
        {TOUR.map((card) => (
          <a key={card.id} className="mkt-tour-card" href={card.path}>
            <MarketingImage assetId={card.assetId} sizes="(min-width: 900px) 360px, 92vw" />
            <div className="mkt-tour-body">
              <h3>{card.title}</h3>
              <p>{card.pitch}</p>
              <span className="mkt-tour-cue">
                See it in action <span aria-hidden="true"><Icon glyph="→" /></span>
              </span>
            </div>
          </a>
        ))}
      </div>

      <p style={{ textAlign: "center", marginTop: 22 }}>
        <a className="mkt-btn" href="/features">
          Tour every feature in detail
        </a>
      </p>
    </Section>
  );
}
