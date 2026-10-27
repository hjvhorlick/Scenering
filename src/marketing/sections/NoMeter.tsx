import { Section, SectionHead } from "../components/primitives";
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
        lead="No per-video billing and no server-owned key. Provider usage follows your own Speechify account."
      />

      <div className="mkt-grid cols-2">
        {NO_METER.points.map((point) => (
          <div className="mkt-panel-flat mkt-point" key={point.label}>
            <b>{point.label}</b>
            <p className="mkt-small">{point.detail}</p>
          </div>
        ))}
      </div>

      <div className="mkt-panel mkt-pad mkt-nometer-note">
        <p className="mkt-small">
          <b>Stated plainly.</b> Generated narration requires your Speechify API key. It stays in this browser and
          goes straight to Speechify — Scenering never receives or stores it. Speechify usage and billing follow
          your Speechify account.
        </p>
        <p className="mkt-small">
          Photos come from free libraries:{" "}
          {openSources.map((source) => source.name).join(", ")}. Two ask for a free key.
        </p>
      </div>
    </Section>
  );
}
