import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Tiles, Tile, Note } from "../components/blocks";
import { DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { HONESTY } from "../product-facts";

/**
 * Output formats — two small tiles.
 *
 * The two large players (one 16:9, one 9:16) were the widest fixed pair on
 * the page: 640px beside 260px, which cannot exist on a phone at all. Two
 * thumbnails, one wide and one tall, in the same wrapping tile row say the
 * same thing at every width.
 */
export default function Formats() {
  const scene = DEMO_SCENES[4];

  return (
    <Section id="formats" tone="white">
      <SectionHead
        id="formats"
        eyebrow="Output"
        title="Widescreen and vertical, from one project."
        lead="Pick the shape in Setup and render. Same scenes, same narration; framing follows."
      />

      <Tiles min={150}>
        <Tile
          assetId={scene.assetId}
          label="YouTube · 16:9"
          note={`1920 × 1080 · ${formatDuration(DEMO_TOTAL_SECONDS)}`}
          badge="16:9"
        />
        <Tile assetId={scene.assetId} vertical label="Shorts · Reels · TikTok" note="1080 × 1920" badge="9:16" />
      </Tiles>

      <Note>
        <b>The second cut:</b> return to Setup, choose the other destination, render again. Scenering never
        silently re-crops a finished video.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Same demonstration project, two output shapes.</span>
      </FigureNote>
    </Section>
  );
}
