import { Section, SectionHead, FigureNote, Pill } from "../components/primitives";
import { Facts, Note } from "../components/blocks";
import { HONESTY } from "../product-facts";
import { DEVICE_PERFORMANCE } from "../device-guidance";

/**
 * Devices — three facts, no device mockups.
 *
 * The three framed screenshots (desktop, tablet, phone) were the clearest
 * example of the problem: three separate compositions, one of which existed
 * only to show that a phone could show something smaller. The answer is a
 * short statement of what each screen is for, and the performance guidance
 * people actually ask about.
 */
export default function Devices() {
  return (
    <Section id="devices">
      <SectionHead
        id="devices"
        eyebrow="Anywhere you work"
        title="Desktop, tablet and phone."
        lead="It runs in the browser, and the project is the same on every screen."
      />

      <Facts
        items={[
          { term: "Wide screens", text: "get the full timeline and the tool rails." },
          { term: "Phones and tablets", text: "review scenes, swap pictures and adjust text." },
          { term: "Projects sync", text: "to every device you sign in to." },
        ]}
      />

      <div className="mkt-panel mkt-pad" style={{ marginTop: 14 }}>
        <b style={{ fontSize: 13.5 }}>{DEVICE_PERFORMANCE.testedSystem}</b>
        <p className="mkt-small" style={{ marginTop: 6 }}>
          {DEVICE_PERFORMANCE.lowerSpecExpectation}
        </p>
        <p className="mkt-small" style={{ marginTop: 6 }}>
          {DEVICE_PERFORMANCE.persistentRender}
        </p>
        <p className="mkt-small" style={{ marginTop: 6 }}>
          <b>Recommended:</b> {DEVICE_PERFORMANCE.recommendation}
        </p>
      </div>

      <Note>{HONESTY.localNote}</Note>

      <FigureNote>
        <Pill>Rendering on your machine</Pill>
        <span>Rendering happens on your machine, not on a server queue.</span>
      </FigureNote>
    </Section>
  );
}
