import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Note } from "../components/blocks";
import { HONESTY, SEARCH_POLICY, VISUAL_SOURCES } from "../product-facts";

/**
 * Where the visuals come from — a list and three facts.
 *
 * Only the sources the app really searches, in its order, and the three
 * rules that matter. No panels, no illustrations.
 */
export default function Sources() {
  return (
    <Section id="sources" tone="tinted">
      <SectionHead
        id="sources"
        eyebrow="Visual sources"
        title="Where do the visuals come from?"
        lead="Scenering searches the sources you connect for existing photographs. It never invents one."
      />

      <ul className="mkt-facts">
        {VISUAL_SOURCES.map((source, index) => (
          <li key={source.id}>
            <span className="mkt-tick" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <b>{source.name}</b> {source.role}{" "}
              <span className="mkt-pill is-plain">
                {source.access === "key" ? "Needs a key" : source.access === "open" ? "No key" : "Built in"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <Facts
        items={[
          { term: "Search first, download once.", text: SEARCH_POLICY[2].detail },
          { term: "Quality gate.", text: "Photographic, 16:9, at least 1920 × 1080 — so a 1080p render never upscales." },
          { term: "Keys are optional.", text: "Wikimedia Commons and the built-in library always work." },
        ]}
      />

      <Note>{HONESTY.localNote}</Note>

      <FigureNote>
        <Pill>Source list generated from the app’s configured providers</Pill>
        <span>Names only — no provider marks are used.</span>
      </FigureNote>
    </Section>
  );
}
