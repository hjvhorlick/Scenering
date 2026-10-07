import { Section, SectionHead, Pill } from "../components/primitives";
import { NO_METER, VISUAL_SOURCES } from "../product-facts";

/**
 * "Your Speechify account. No Scenering TTS meter."
 *
 * The answer to the first question on the page, and the one claim most worth
 * getting exactly right. Every line is a statement about how the app is
 * built, and `tests/marketing.test.ts` checks the code still matches — the
 * script is split arithmetically, the search terms are extracted structurally,
 * the pictures are photographs from the libraries listed below and the render
 * runs on the visitor's own machine.
 *
 * Speechify BYOK pricing and failure behavior are printed here rather than
 * buried, because a promise with a hidden exception is worse than no promise.
 */
export default function NoMeter() {
  const openSources = VISUAL_SOURCES.filter((source) => source.access !== "bundled");

  return (
    <Section id="no-meter" tone="white">
      <SectionHead
        id="no-meter"
        eyebrow="What it costs to make one"
        title={NO_METER.message}
        lead={NO_METER.lead}
      />

      <div className="mkt-grid cols-2">
        {NO_METER.points.map((point) => (
          <div className="mkt-panel-flat" key={point.label} style={{ padding: 16 }}>
            <b style={{ fontSize: 14 }}>{point.label}</b>
            <p className="mkt-small" style={{ marginTop: 6 }}>
              {point.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="mkt-panel mkt-pad" style={{ marginTop: 16 }}>
        <div className="mkt-scene-top">
          <Pill tone="plain">Stated plainly</Pill>
        </div>
        <p className="mkt-small" style={{ marginTop: 8 }}>
          {NO_METER.caveat}
        </p>
        <p className="mkt-small" style={{ marginTop: 8 }}>
          The photo libraries are free to search:{" "}
          {openSources.map((source, index) => (
            <span key={source.id}>
              <b>{source.name}</b>
              {index < openSources.length - 2 ? ", " : index === openSources.length - 2 ? " and " : ""}
            </span>
          ))}
          . Two of them ask you to bring your own key, which is free to get and takes a minute —
          Scenering tells you where to put it.
        </p>
        <p className="mkt-small" style={{ marginTop: 8 }}>
          Narration works the same way: it is spoken by Google's Gemini voices using{" "}
          <b>your own free Google AI Studio key</b>. Creating one takes about a minute and costs
          nothing, and Scenering puts no counter on top of it — paste the key once under API Keys and
          every narrator, preview and export speaks.
        </p>
      </div>
    </Section>
  );
}
