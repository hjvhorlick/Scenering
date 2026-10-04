import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import SceneTransformation from "../components/SceneTransformation";
import { CONTROL_POINTS, HONESTY, MESSAGES } from "../product-facts";
import { DEMO_SCENES } from "../demo-project";

/**
 * "You stay in control."
 *
 * The honest counterweight to everything automatic on this page: Scenering
 * makes the first version, and then every decision it made is a control you
 * can reach. Twelve of them are listed, each one a thing the studio can
 * actually do.
 */
export default function Control() {
  return (
    <Section id="control" tone="tinted">
      <SectionHead
        id="control"
        eyebrow="You stay in control"
        title="Automatic doesn’t mean uncontrollable."
        lead="What Scenering makes is a first version. Every decision it took is a control you can reach."
      />

      <div className="mkt-split">
        <div>
          <div className="mkt-grid cols-2">
            {CONTROL_POINTS.map((point) => (
              <div className="mkt-panel-flat" key={point.label} style={{ padding: 14 }}>
                <b style={{ fontSize: 14 }}>{point.label}</b>
                <p className="mkt-small" style={{ marginTop: 5 }}>
                  {point.detail}
                </p>
              </div>
            ))}
          </div>

          <p className="mkt-small" style={{ marginTop: 14 }}>
            <b>{MESSAGES.control}</b> Nothing renders until you ask for it.
          </p>
        </div>

        <figure style={{ margin: 0 }}>
          <SceneTransformation scene={DEMO_SCENES[3]} />
          <FigureNote>
            <Pill>{HONESTY.conceptLabel}</Pill>
            <span>One scene, from script to finished shot — step through it yourself.</span>
          </FigureNote>
        </figure>
      </div>
    </Section>
  );
}
