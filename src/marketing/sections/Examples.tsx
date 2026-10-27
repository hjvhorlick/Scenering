import { Section, SectionHead, Pill, MarketingImage, FigureNote } from "../components/primitives";
import { EXAMPLE_VIDEOS, HONESTY } from "../product-facts";

/**
 * "What can you create?"
 *
 * Four of the eight fictional projects — one per kind of video Scenering
 * suits — rather than the whole catalogue. Eight full cards made the section
 * long enough to lose the point on a phone; four show the range and the link
 * to /features carries the rest. They are all faceless, all labelled as a
 * demonstration, and none of them is customer work.
 */
const SHOWN = EXAMPLE_VIDEOS.slice(0, 4);

export default function Examples() {
  return (
    <Section id="examples">
      <SectionHead
        id="examples"
        eyebrow="What can you create?"
        title="Faceless videos, four kinds of story."
        lead="Projects written for this page, to show the range of the workflow."
      />

      <div className="mkt-grid cols-4">
        {SHOWN.map((example) => (
          <article className="mkt-example" key={example.id}>
            <MarketingImage
              assetId={example.assetId}
              sizes="(min-width: 1000px) 280px, (min-width: 700px) 45vw, 44vw"
            >
              <span className="mkt-thumb-tag">{example.duration}</span>
              <span className="mkt-thumb-tag is-right">{example.format}</span>
            </MarketingImage>
            <div style={{ display: "grid", gap: 6, padding: "2px 4px 6px" }}>
              <span className="mkt-eyebrow" style={{ margin: 0, fontSize: 10.5 }}>
                {example.category}
              </span>
              <b style={{ fontSize: 14.5, lineHeight: 1.25 }}>{example.title}</b>
              <p className="mkt-small">“{example.line}”</p>
              <p className="mkt-small" style={{ color: "var(--mkt-ink-4)" }}>
                {example.scenes} scenes · {HONESTY.demoLabel.toLowerCase()}
              </p>
            </div>
          </article>
        ))}
      </div>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Fictional concepts, faceless by design. No customer projects, no claim about views.</span>
      </FigureNote>
    </Section>
  );
}
