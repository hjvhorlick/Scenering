import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Note } from "../components/blocks";
import { CONTROL_POINTS, HONESTY, MESSAGES } from "../product-facts";

/**
 * "You stay in control." — four facts, no illustration.
 *
 * The step-through scene transformation that used to sit beside this was a
 * fixed-size composite of four frames. The claim is made by the list.
 */
export default function Control() {
  return (
    <Section id="control" tone="tinted">
      <SectionHead
        id="control"
        eyebrow="You stay in control"
        title="Automatic doesn’t mean uncontrollable."
        lead="What Scenering makes is a first version. Every decision is a control you can reach."
      />

      <Facts items={CONTROL_POINTS.slice(0, 4).map((point) => ({ term: point.label, text: point.detail }))} />

      <Note>
        <b>{MESSAGES.control}</b> Nothing renders until you ask for it. The <a href="/manual">manual</a>{" "}
        documents the rest.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>A first version you can change, not a locked export.</span>
      </FigureNote>
    </Section>
  );
}
