import { Section, SectionHead } from "../components/primitives";
import { NO_METER, VISUAL_SOURCES } from "../product-facts";

/**
 * Piper's browser-local narration model, first-download requirements and
 * model-license caveat are stated here rather than hidden in a help page.
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
          <div className="mkt-panel-flat mkt-point" key={point.label}>
            <b>{point.label}</b>
            <p className="mkt-small">{point.detail}</p>
          </div>
        ))}
      </div>

      <div className="mkt-panel mkt-pad mkt-nometer-note">
        <p className="mkt-small">
          <b>Stated plainly.</b> Neural text-to-speech models generate narration locally in your browser, without a cloud speech service or per-request voice charge. First use requires an internet download; the browser may cache it for later. Voice model license and attribution terms apply.
        </p>
        <p className="mkt-small">
          Photos come from free libraries:{" "}
          {openSources.map((source) => source.name).join(", ")}. Two ask for a free key.
        </p>
      </div>
    </Section>
  );
}
