import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Tiles, Note } from "../components/blocks";
import { STUDIO_VOICE_PRESETS } from "../../data/voice-presets";
import { DEMO_VOICE } from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES, NARRATION_CHAIN } from "../product-facts";
import { PLAN_CONFIG, isPlanVoiceIncluded } from "../../config/plans";

/**
 * Voice over — four facts and four small narrator cards.
 *
 * The studio window this section used to draw (tabs, a narrator rail, a
 * visualiser canvas, a preview button and three scene rows) is gone. What
 * remains is what a visitor decides on: how narration is produced, who
 * narrates, what Free includes, and that a key is required.
 */
const freeVoiceCount = PLAN_CONFIG.free.limits.voicePresets ?? LIVE_COUNTS.voices;

export default function VoiceSection() {
  const voices = STUDIO_VOICE_PRESETS.slice(0, 4);

  return (
    <Section id="voice" tone="white">
      <SectionHead
        id="voice"
        eyebrow="04 · Voice Over"
        title={MESSAGES.voice}
        lead={`${LIVE_COUNTS.voices} narrators, each with a preview before you commit.`}
      />

      <Facts
        items={[
          { term: "Your key, your voice.", text: `Narration is generated with your Speechify key using the selected narrator.` },
          { term: "Timed to the word.", text: "Each scene is fitted to its own audio." },
          { term: "Two speakers.", text: "Any single scene can use a different narrator." },
          { term: "No silent fallback.", text: "A failing key shows the real error." },
        ]}
      />

      <Tiles min={130}>
        {voices.map((voice) => (
          <div className="mkt-tile is-plain" key={voice.id}>
            <span className="mkt-tile-text">
              <b>{voice.name}</b>
              <i>{voice.accent}</i>
              <span className={`mkt-pill ${isPlanVoiceIncluded("free", voice.id) ? "is-live" : "is-plain"}`}>
                {isPlanVoiceIncluded("free", voice.id) ? "Free" : "SceneFlow"}
              </span>
            </span>
          </div>
        ))}
      </Tiles>

      <Note>
        <b>Free</b> includes {freeVoiceCount} narrators; paid plans include all {LIVE_COUNTS.voices}.{" "}
        {NARRATION_CHAIN[0].detail}
      </Note>

      <p className="mkt-small">
        The demonstration project narrates with <b>{DEMO_VOICE.name}</b> ({DEMO_VOICE.accent}).
      </p>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Narrators read from the app’s catalogue.</span>
      </FigureNote>
    </Section>
  );
}
