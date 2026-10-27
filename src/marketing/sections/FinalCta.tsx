import { Section, Pill } from "../components/primitives";
import { HONESTY, MESSAGES } from "../product-facts";

/**
 * The close: the whole story in one line, then the door into the studio.
 * No guarantees, no "go viral" — just what happens next.
 */
export default function FinalCta() {
  return (
    <Section id="start" tone="tinted">
      <div className="mkt-panel mkt-panel-big mkt-pad" style={{ textAlign: "center", padding: "28px 18px" }}>
        <div className="mkt-eyebrow" style={{ justifyContent: "center" }}>
          {MESSAGES.render}
        </div>
        <h2 className="mkt-h2" id="start-title">
          Start creating with Scenering.
        </h2>
        <p className="mkt-lead" style={{ maxWidth: 620, margin: "14px auto 0" }}>
          Bring a script or prepared audio. Leave with an editable video. No payment details needed.
        </p>

        <div className="mkt-hero-cta" style={{ justifyContent: "center" }}>
          <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="/register">
            Get Started Free
          </a>
          <a className="mkt-btn mkt-btn-lg" href="/pricing">
            Compare plans
          </a>
        </div>

        <p className="mkt-small" style={{ marginTop: 18 }}>
          <Pill>{HONESTY.localNote}</Pill>
        </p>
      </div>
    </Section>
  );
}
