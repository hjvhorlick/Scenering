import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Tiles, Tile, Note } from "../components/blocks";
import { DEMO_SCENES, DEMO_TIMELINE_EXTRAS } from "../demo-project";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";

/**
 * Video Studio — four facts and four small tiles.
 *
 * The preview canvas, the three-lane timeline, the zoom rail, the tool tabs
 * and the visualiser canvas have been removed. Every one of them was a large
 * fixed-width composition that had to be redesigned for a phone. A list of
 * what you can add, with real counts, says the same thing at any width.
 */
export default function VideoStudioSection() {
  return (
    <Section id="video-studio" tone="tinted">
      <SectionHead
        id="video-studio"
        eyebrow="06 · Video Studio"
        title={MESSAGES.studio}
        lead="Filters, text, stickers and sound, on the scenes you already have."
      />

      <Facts
        items={[
          { term: "One timeline.", text: "Scenes, visual effects and sound on the same track set." },
          { term: "Real catalogues.", text: `${CATALOG_COUNTS.filters} filters, ${CATALOG_COUNTS.textTemplates} text templates and ${CATALOG_COUNTS.stickers} stickers.` },
          { term: "Sound underneath.", text: `${CATALOG_COUNTS.musicTracks} music beds and ${CATALOG_COUNTS.soundEffects} effects, ducked under narration.` },
          { term: "Undo anything.", text: "Preview as often as you like before a final export." },
        ]}
      />

      <Tiles min={130}>
        <Tile assetId={DEMO_SCENES[2].assetId} label={DEMO_TIMELINE_EXTRAS.filter.name} note="Filter" />
        <Tile assetId={DEMO_SCENES[1].assetId} label={DEMO_TIMELINE_EXTRAS.lowerThird.name} note="Lower third" />
        <Tile assetId={DEMO_SCENES[4].assetId} label={DEMO_TIMELINE_EXTRAS.sticker.name} note="Sticker" />
        <Tile assetId={DEMO_SCENES[0].assetId} label={DEMO_TIMELINE_EXTRAS.music.name} note="Music bed" />
      </Tiles>

      <Note>
        {LIVE_COUNTS.transitions} transitions, {CATALOG_COUNTS.lowerThirds} lower thirds and{" "}
        {CATALOG_COUNTS.ctaPlatforms} call-to-action badges are in the app today.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Counts read from the app’s catalogues.</span>
      </FigureNote>
    </Section>
  );
}
