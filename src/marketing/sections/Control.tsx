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
        lead="Scenering helps create the video. What it produces is a starting point you can take apart — scene by scene, layer by layer — until it is the video you meant to make."
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

          <div className="mkt-panel mkt-pad" style={{ marginTop: 16 }}>
            <h3 className="mkt-h3">{MESSAGES.control}</h3>
            <p className="mkt-small" style={{ marginTop: 8 }}>
              Scenering helps create the video, but you remain in control of the result. Nothing renders until you
              ask for it, and you can render again as many times as you like.
            </p>
          </div>
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
