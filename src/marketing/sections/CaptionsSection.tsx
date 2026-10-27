import { useEffect } from "react";
import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Note } from "../components/blocks";
import CaptionLine from "../components/CaptionLine";
import { CAPTION_STYLES, loadCaptionFonts } from "../../data/caption-styles";
import { DEMO_SCENES } from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import { PLAN_CONFIG, isPlanCaptionIncluded } from "../../config/plans";

/**
 * Captions — four facts and four samples.
 *
 * The samples are real: each one is drawn from the same recipe the renderer
 * burns into the video. They are small rows on a dark strip, not a studio
 * window with a preview, two card pairs, a toggle list and the whole
 * catalogue.
 */
const freeStyles = CAPTION_STYLES.filter((style) => isPlanCaptionIncluded("free", style.id));
const freeStyleCount = PLAN_CONFIG.free.limits.captionStyles ?? freeStyles.length;

export default function CaptionsSection() {
  const scene = DEMO_SCENES[3];
  const styles = CAPTION_STYLES.slice(0, 4);

  useEffect(() => {
    loadCaptionFonts();
  }, []);

  return (
    <Section id="captions">
      <SectionHead
        id="captions"
        eyebrow="05 · Captions"
        title={MESSAGES.captions}
        lead={`${LIVE_COUNTS.captionStyles} styles across ${LIVE_COUNTS.captionCategories} families — word by word or a clean line.`}
      />

      <Facts
        items={[
          { term: "Timed to the narration.", text: "Timing comes from the generated audio, not a reading-speed guess." },
          { term: "Word by word or line by line.", text: "Karaoke for social cuts, steady subtitles otherwise." },
          { term: "Per project or per scene.", text: "Switch captions off for a single scene." },
          { term: "Your typeface, your colours.", text: "Each style is a real preset in the renderer." },
        ]}
      />

      <div className="mkt-samples">
        {styles.map((style, index) => (
          <div className="mkt-sample" key={style.id}>
            <span className="mkt-sample-head">
              <b>{style.name}</b>
              {isPlanCaptionIncluded("free", style.id) ? (
                <span className="mkt-pill is-live">Free</span>
              ) : (
                <span className="mkt-pill is-plain">SceneFlow</span>
              )}
            </span>
            <span className="mkt-capstage">
              <CaptionLine text={scene.caption} style={style} size={14} highlightWord={index % 3} />
            </span>
          </div>
        ))}
      </div>

      <Note>
        <b>Free</b> includes {freeStyleCount} styles; paid plans unlock all {LIVE_COUNTS.captionStyles}.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Styles rendered from the app’s caption catalogue.</span>
      </FigureNote>
    </Section>
  );
}
