import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import PlayerFrame from "../components/PlayerFrame";
import { DEMO_CAPTION_STYLE, DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { HONESTY } from "../product-facts";

/**
 * Output formats.
 *
 * The same project, framed two ways. What the page must *not* imply is
 * automatic reframing: choosing a different destination means going back to
 * Setup and rendering that cut, and the section says so.
 */
export default function Formats() {
  const scene = DEMO_SCENES[4];

  return (
    <Section id="formats" tone="white">
      <SectionHead
        id="formats"
        eyebrow="Output"
        title="Widescreen and vertical, from one project."
        lead="Pick the destination in Setup and render. The scenes, narration and captions are the same; the framing and the caption size follow the shape you chose."
      />

      <div className="mkt-formats">
        <figure style={{ margin: 0 }}>
          <PlayerFrame
            assetId={scene.assetId}
            caption={scene.caption}
            captionStyle={DEMO_CAPTION_STYLE}
            highlightWord={2}
            progress={0.6}
            badge="16:9 · 1920 × 1080"
            sizes="(min-width: 720px) 640px, 92vw"
          />
          <figcaption className="mkt-figcap">
            <Pill tone="accent">YouTube · 16:9</Pill>
            <span>Widescreen upload · {formatDuration(DEMO_TOTAL_SECONDS)}</span>
          </figcaption>
        </figure>

        <figure style={{ margin: 0 }}>
          <PlayerFrame
            assetId={scene.assetId}
            caption={scene.caption}
            captionStyle={DEMO_CAPTION_STYLE}
            highlightWord={2}
            progress={0.6}
            badge="9:16 · 1080 × 1920"
            vertical
            captionSize={13}
            sizes="(min-width: 720px) 260px, 60vw"
          />
          <figcaption className="mkt-figcap">
            <Pill tone="accent">Shorts · TikTok · Reels</Pill>
            <span>Vertical upload</span>
          </figcaption>
        </figure>
      </div>

      <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 18 }}>
        <p className="mkt-small">
          <b>How the second cut is made:</b> go back to Setup, choose the other destination and render again.
          Scenering does not silently re-crop a finished video — you decide the shape, then the renderer builds that
          version frame by frame.
        </p>
      </div>

      <FigureNote>
        <Pill>{HONESTY.conceptLabel}</Pill>
        <span>Same demonstration project, two output shapes.</span>
      </FigureNote>
    </Section>
  );
}
