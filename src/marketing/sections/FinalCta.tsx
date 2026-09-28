import { Section, Pill } from "../components/primitives";
import { HONESTY, MESSAGES, WORKFLOW_STAGES } from "../product-facts";

/**
 * The close: the whole story in one line, then the door into the studio.
 * No guarantees, no "go viral" — just what happens next.
 */
export default function FinalCta() {
  return (
    <Section id="start" tone="tinted">
      <div className="mkt-panel mkt-panel-big mkt-pad" style={{ textAlign: "center", padding: "38px 22px" }}>
        <div className="mkt-eyebrow" style={{ justifyContent: "center" }}>
          {MESSAGES.render}
        </div>
        <h2 className="mkt-h2" id="start-title">
          Start with a script. Finish with a video.
        </h2>
        <p className="mkt-lead" style={{ maxWidth: 620, margin: "14px auto 0" }}>
          Sign in, paste something you have already written, and watch it become scenes. Nothing to install, and
          your projects stay on your own machine.
        </p>

        <div className="mkt-hero-cta" style={{ justifyContent: "center" }}>
          <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="#workflow">
            Walk through it again
          </a>
          <a className="mkt-btn mkt-btn-lg" href="#pricing">
            What is in the free plan
          </a>
        </div>

        <div className="mkt-flow" style={{ justifyContent: "center", marginTop: 22 }}>
          {WORKFLOW_STAGES.map((stage, index) => (
            <span key={stage.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="mkt-chip">
                {stage.number} {stage.name}
              </span>
              {index < WORKFLOW_STAGES.length - 1 && (
                <span className="mkt-flow-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </span>
          ))}
        </div>

        <p className="mkt-small" style={{ marginTop: 18 }}>
          <Pill>{HONESTY.localNote}</Pill>
        </p>
      </div>
    </Section>
  );
}
