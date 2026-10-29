import { Section, SectionHead } from "../components/primitives";
import { NO_METER, VISUAL_SOURCES } from "../product-facts";

/**
 * Browser-local voice narration, first-use requirements and voice-data terms
 * are stated here rather than hidden in a help page.
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
          <b>Stated plainly.</b> Voice narration is generated in your browser. First use loads the speech runtime and selected voice files; your browser may cache them for reuse.
        </p>
        <p className="mkt-small">
          Photos come from free libraries:{" "}
          {openSources.map((source) => source.name).join(", ")}. Two ask for a free key.
        </p>
      </div>
    </Section>
  );
}
