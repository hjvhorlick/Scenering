import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Steps, Tiles, Tile, Note } from "../components/blocks";
import { DEMO_SCENES, DEMO_SEARCH_RESULTS } from "../demo-project";
import { HONESTY, MESSAGES, SEARCH_POLICY } from "../product-facts";

/**
 * Visual research — four steps and three pictures.
 *
 * The search window, the results grid, the rejected thumbnails and the scene
 * preview are gone. What a visitor needs is that the search is built from the
 * scene, that results are filtered, and that any picture can be replaced —
 * which is four short rows and three thumbnails.
 */
export default function VisualResearch() {
  const kept = DEMO_SEARCH_RESULTS.filter((result) => result.accepted && result.assetId).slice(0, 3);

  return (
    <Section id="visuals" tone="tinted">
      <SectionHead
        id="visuals"
        eyebrow="03 · Visuals"
        title={MESSAGES.visuals}
        lead="Each scene writes its own search — and you can overrule the result."
      />

      <Steps steps={SEARCH_POLICY.map((step) => ({ title: step.step, text: step.detail }))} />

      <Tiles min={130}>
        {kept.map((result) => (
          <Tile
            key={result.label}
            assetId={result.assetId}
            label={result.source}
            note={result.size}
            badge={result === kept[0] ? "In use" : undefined}
          />
        ))}
      </Tiles>

      <Note>
        Anything not a 16:9 photo of at least 1920 × 1080 is skipped. Only the chosen picture is downloaded.
      </Note>

      <p className="mkt-small">
        <b>Don’t like it? Replace it.</b> Another result, a fresh search or your own file — the text,
        narration and timing stay as they were. Scene {DEMO_SCENES[2].number} here searches for
        “{DEMO_SCENES[2].query}”.
      </p>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Photographs from the free libraries the app searches.</span>
      </FigureNote>
    </Section>
  );
}
