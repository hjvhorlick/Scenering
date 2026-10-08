import { Section, SectionHead, Pill, MarketingImage, FigureNote } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import TimelineMock from "../components/TimelineMock";
import SceneCard from "../components/SceneCard";
import { DEMO_SCENES } from "../demo-project";
import { HONESTY } from "../product-facts";
import { DEVICE_PERFORMANCE } from "../device-guidance";

/**
 * Desktop, tablet, phone.
 *
 * Scenering is responsive, and the layout genuinely recomposes rather than
 * shrinking: the timeline is a desktop and tablet surface, a phone gets the
 * scene list and the previews. The caption under the illustration says that
 * out loud instead of implying every control is identical everywhere.
 */
export default function Devices() {
  return (
    <Section id="devices">
      <SectionHead
        id="devices"
        eyebrow="Anywhere you work"
        title="Desktop, tablet and phone."
        lead="It runs in the browser. Wide screens get the full timeline; smaller ones recompose around the same project."
      />

      <div className="mkt-devices">
        {/* desktop */}
        <div className="mkt-device">
          <div className="mkt-device-screen">
            <AppFrame title="Where Cities Begin · Video Studio" phase="studio">
              <div style={{ display: "grid", gap: 9 }}>
                <MarketingImage assetId={DEMO_SCENES[1].assetId} sizes="(min-width: 820px) 520px, 90vw" />
                <TimelineMock
                  showHeader={false}
                  playheadAt={0.45}
                  showRuler={false}
                  height={18}
                />
              </div>
            </AppFrame>
          </div>
          <p className="mkt-device-foot">Desktop — full timeline and tool rails</p>
        </div>

        {/* tablet */}
        <div className="mkt-device">
          <div className="mkt-device-screen">
            <AppFrame title="Scenes" phase="scenes" compact>
              <div style={{ display: "grid", gap: 8 }}>
                {DEMO_SCENES.slice(0, 2).map((scene) => (
                  <SceneCard key={scene.number} scene={scene} showActions={false} compact />
                ))}
              </div>
            </AppFrame>
          </div>
          <p className="mkt-device-foot">Tablet — scene board and previews</p>
        </div>

        {/* phone */}
        <div className="mkt-device is-phone">
          <div className="mkt-device-screen">
            <AppFrame title="Scene 01" phase="scenes" compact>
              <div style={{ display: "grid", gap: 8 }}>
                <MarketingImage assetId={DEMO_SCENES[0].assetId} sizes="200px" />
                <p className="mkt-mini-text">{DEMO_SCENES[0].text}</p>
                <span className="mkt-pill is-accent" style={{ justifySelf: "start" }}>
                  {DEMO_SCENES[0].duration.toFixed(1)}s
                </span>
              </div>
            </AppFrame>
          </div>
          <p className="mkt-device-foot">Phone — review and edit scenes</p>
        </div>
      </div>

      <FigureNote>
        <Pill>{HONESTY.conceptLabel}</Pill>
        <span>
          Layouts differ by screen size on purpose — the timeline and the heavier studio controls belong on a wide
          screen, and the phone layout is built for reviewing and adjusting scenes.
        </span>
      </FigureNote>

      <aside className="mkt-device-performance mkt-panel mkt-pad" aria-labelledby="device-performance-title">
        <div>
          <Pill>Performance guidance</Pill>
          <h3 id="device-performance-title">Start with the PC you have.</h3>
          <p>
            <strong>{DEVICE_PERFORMANCE.testedSystem}</strong> {DEVICE_PERFORMANCE.lowerSpecExpectation}
          </p>
        </div>
        <div className="mkt-device-performance-details">
          <p>{DEVICE_PERFORMANCE.persistentRender}</p>
          <p><strong>Recommended:</strong> {DEVICE_PERFORMANCE.recommendation}</p>
        </div>
      </aside>
    </Section>
  );
}
