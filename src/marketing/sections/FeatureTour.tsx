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
    title: "Script to storyboard",
    pitch: "Your script splits into editable scenes.",
  },
  {
    id: "visuals",
    path: "/visuals",
    assetId: "search.well",
    title: "Visuals found for you",
    pitch: "Free photo libraries, one click to swap.",
  },
  {
    id: "voice",
    path: "/voice",
    assetId: "scene.02",
    title: "Narration, no microphone",
    pitch: `${LIVE_COUNTS.voices} narrators, timed to the word.`,
  },
  {
    id: "captions",
    path: "/captions",
    assetId: "scene.03",
    title: "Captions people read",
    pitch: `${LIVE_COUNTS.captionStyles} styles, synced to the voice.`,
  },
  {
    id: "video-studio",
    path: "/video-studio",
    assetId: "scene.04",
    title: "Music, motion, polish",
    pitch: "Filters, lower thirds, music and effects.",
  },
  {
    id: "effects",
    path: "/effects",
    assetId: "scene.05",
    title: "16:9 and 9:16",
    pitch: "Preview freely, then export the finished cut.",
  },
] as const;

export default function FeatureTour() {
  return (
    <Section id="features" tone="white">
      <SectionHead
        id="features"
        eyebrow="What you get"
        title="Everything a faceless channel needs."
        lead="Six stages, each one editable. Pick one to see it demonstrated."
      />

      <div className="mkt-tour">
        {TOUR.map((card) => (
          <a key={card.id} className="mkt-tour-card" href={card.path}>
            <MarketingImage assetId={card.assetId} sizes="(min-width: 720px) 300px, 44vw" />
            <div className="mkt-tour-body">
              <h3>{card.title}</h3>
              <p>{card.pitch}</p>
              <span className="mkt-tour-cue">
                See it <span aria-hidden="true"><Icon glyph="→" /></span>
              </span>
            </div>
          </a>
        ))}
      </div>

      <p style={{ textAlign: "center", marginTop: 22 }}>
        <a className="mkt-btn" href="/features">
          See every feature
        </a>
      </p>
    </Section>
  );
}
