import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Steps, Note } from "../components/blocks";
import { HONESTY, WORKFLOW_STAGES } from "../product-facts";

/**
 * "From idea to video" — the six steps as six small rows.
 *
 * This used to be the biggest thing on the site: a full studio window with a
 * preview, a timeline and a tool rail, plus a second, phone-only animated
 * version of the same window. Two versions of one idea, both large, and the
 * phone one existed only because the desktop one did not fit.
 *
 * Now there is one list. Every step is a number and one sentence, the markup
 * is the same on a phone as on a desktop, and nothing has to be hidden,
 * swapped or scaled to make it work.
 */
export default function IdeaToVideo() {
  return (
    <Section id="workflow" tone="white">
      <SectionHead
        id="workflow"
        eyebrow="From idea to video"
        title={`${WORKFLOW_STAGES.length} steps, one project.`}
        lead="The same six steps as the tabs in the studio."
      />

      <Steps
        steps={WORKFLOW_STAGES.map((stage) => ({
          number: stage.number,
          title: stage.name,
          text: `${stage.message} ${stage.appTab ? `Tab: ${stage.appTab}.` : ""}`.trim(),
        }))}
      />

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>The steps are the studio’s own phases, in order.</span>
      </FigureNote>

      <Note>Nothing renders until you ask for it.</Note>
    </Section>
  );
}
