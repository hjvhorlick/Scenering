import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Tiles, Tile, Note } from "../components/blocks";
import { DEMO_PROJECT, DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { HONESTY, MESSAGES } from "../product-facts";

/**
 * Scenes — three facts and three thumbnails.
 *
 * The old section carried an app window with every scene card in it, each
 * one expandable, beside three paragraphs of explanation. Three small
 * pictures and three one-line facts say the same thing and fit on a phone
 * without a second layout.
 */
export default function ScenesSection() {
  const shortest = Math.min(...DEMO_SCENES.map((scene) => scene.duration)).toFixed(1);
  const longest = Math.max(...DEMO_SCENES.map((scene) => scene.duration)).toFixed(1);

  return (
    <Section id="scenes">
      <SectionHead
        id="scenes"
        eyebrow="02 · Scenes"
        title={MESSAGES.scenes}
        lead="Each scene lasts as long as its own narration."
      />

      <Facts
        items={[
          { term: "Divided by meaning.", text: `Scenes run from ${shortest}s to ${longest}s — no fixed interval.` },
          { term: "Narration sets the timing.", text: "Rewording a line re-times it." },
          { term: "Every card is editable.", text: "Rewrite, swap the picture, crop or change the motion." },
        ]}
      />

      <Tiles min={150}>
        {DEMO_SCENES.slice(0, 3).map((scene) => (
          <Tile
            key={scene.number}
            assetId={scene.assetId}
            label={`Scene ${scene.number}`}
            note={`${scene.duration.toFixed(1)}s`}
            badge={`${scene.duration.toFixed(1)}s`}
          />
        ))}
      </Tiles>

      <Note>
        {DEMO_SCENES.length} scenes · {formatDuration(DEMO_TOTAL_SECONDS)} in total.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>“{DEMO_PROJECT.title}” is fictional.</span>
      </FigureNote>
    </Section>
  );
}
