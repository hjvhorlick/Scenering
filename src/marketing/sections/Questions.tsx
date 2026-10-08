import { Section, SectionHead } from "../components/primitives";
import { COMMON_QUESTIONS } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * The six worries, at the top of the page.
 *
 * A visitor does not arrive wanting a feature list; they arrive with a
 * specific doubt about whether this is for them — will it cost me credits, do
 * I have to be on camera, do I need a voice, may I use the pictures, will it
 * run on my computer, can I even do this. Each one is answered in a line here and properly by the
 * section it points at, so clicking takes you to the explanation instead of
 * to a marketing page.
 *
 * They are plain anchors: they work with JavaScript switched off, they can be
 * opened in a new tab, and the keyboard reaches them in reading order. The
 * only thing the script adds is a brief highlight on the section that answers
 * the question, so nobody lands mid-page wondering where the answer went.
 */

function jumpTo(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  // A short flash so the eye lands on the answer rather than the whole page.
  target.classList.add("is-answering");
  window.setTimeout(() => target.classList.remove("is-answering"), 2200);
}

export default function Questions() {
  return (
    <Section id="questions" tone="white">
      <SectionHead
        id="questions"
        eyebrow="Before you start"
        title="The six things people ask first."
        lead="Pick the one you were about to ask."
      />

      <ul className="mkt-qs">
        {COMMON_QUESTIONS.map((item) => (
          <li key={item.id}>
            <a
              className="mkt-q"
              href={`#${item.section}`}
              onClick={(event) => {
                // Let modified clicks (new tab, new window) behave normally.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                jumpTo(item.section);
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
