import { Section, SectionHead, FigureNote, Pill, MarketingImage } from "../components/primitives";
import { Note } from "../components/blocks";
import CaptionLine from "../components/CaptionLine";
import { DEMO_CAPTION_STYLE, DEMO_PROJECT, DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { HONESTY } from "../product-facts";

/**
 * Before and after — two small panels.
 *
 * It used to be two full panels with a player, a caption stage, a narration
 * row and a timeline inside the second one, plus a range slider that faded
 * between them. The comparison only needs the words on one side and a small
 * picture with a caption on the other, and that fits anywhere.
 */
export default function BeforeAfter() {
  return (
    <Section id="before-after">
      <SectionHead
        id="before-after"
        eyebrow="Before · after"
        title="The same words, twice."
        lead="Everything on the right came from the text on the left."
      />

      <div className="mkt-ba">
        <div className="mkt-panel mkt-pad">
          <div className="mkt-scene-top" style={{ marginBottom: 10 }}>
            <Pill tone="plain">Before</Pill>
            <span className="mkt-small">A text file</span>
          </div>
          <div className="mkt-script">
            {DEMO_PROJECT.script.slice(0, 3).map((line) => (
              <p key={line} className="mkt-script-line">
                {line}
              </p>
            ))}
          </div>
          <Note>
            {DEMO_PROJECT.script.join(" ").split(/\s+/).length} words. No pictures, voice or timing.
          </Note>
        </div>

        <div className="mkt-panel mkt-pad">
          <div className="mkt-scene-top" style={{ marginBottom: 10 }}>
            <Pill tone="accent">After</Pill>
            <span className="mkt-small">
              {DEMO_SCENES.length} scenes · {formatDuration(DEMO_TOTAL_SECONDS)} · MP4 1080p
            </span>
          </div>
          <MarketingImage assetId={DEMO_SCENES[4].assetId} sizes="(min-width: 860px) 380px, 92vw" />
          <div className="mkt-capstage" style={{ marginTop: 10 }}>
            <CaptionLine text={DEMO_SCENES[4].caption} style={DEMO_CAPTION_STYLE} size={13} highlightWord={3} />
          </div>
          <Note>Narrated, captioned, graded and cut — from those three lines.</Note>
        </div>
      </div>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>“{DEMO_PROJECT.title}” is fictional, written for this page.</span>
      </FigureNote>
    </Section>
  );
}
