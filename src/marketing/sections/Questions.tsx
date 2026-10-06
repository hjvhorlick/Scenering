import { Section, SectionHead } from "../components/primitives";
import { COMMON_QUESTIONS } from "../product-facts";
import { goToSection, SITE_SECTIONS } from "../../lib/route";
import Icon from "../../components/icons/Icon";

/**
 * The five worries, at the top of the features tour.
 *
 * A visitor does not arrive wanting a feature list; they arrive with a
 * specific doubt about whether this is for them — will it cost me credits, do
 * I have to be on camera, do I need a voice, may I use the pictures, can I
 * even do this. Each one is answered in a line here and properly by the
 * area it points at, so clicking takes you to the explanation instead of
 * to a marketing page.
 *
 * They are plain anchors to each area's friendly URL (/voice, /no-meter and
 * so on), so they work with JavaScript switched off, can be opened in a new
 * tab, and the keyboard reaches them in reading order. The script only makes
 * the trip smoother: `goToSection` scrolls when the answer is on this page
 * (honouring prefers-reduced-motion) and navigates when it lives on another,
 * then flashes the area so nobody lands mid-page wondering where the answer
 * went. Since the band moved to the features tour, some answers (what it
 * costs, the examples) live on the front page — the cross-page jump is the
 * point.
 */

/** The friendly URL for a section id, for clicks the script never sees. */
function pathFor(sectionId: string): string {
  return SITE_SECTIONS.find((section) => section.id === sectionId)?.path ?? `/${sectionId}`;
}

export default function Questions() {
  return (
    <Section id="questions" tone="white">
      <SectionHead
        id="questions"
        eyebrow="Before you start"
        title="The five things people ask first."
        lead="Pick the one you were about to ask."
      />

      <ul className="mkt-qs">
        {COMMON_QUESTIONS.map((item) => (
          <li key={item.id}>
            <a
              className="mkt-q"
              href={pathFor(item.section)}
              onClick={(event) => {
                // Let modified clicks (new tab, new window) behave normally.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                goToSection(item.section);
              }}
            >
              <span className="mkt-q-ask">{item.question}</span>
              <span className="mkt-q-answer">{item.answer}</span>
              <span className="mkt-q-cue">
                {item.cue}
                <span aria-hidden="true"><Icon glyph="↓" /></span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
