import { useState } from "react";
import { Section, SectionHead, Pill, ComingSoon, FigureNote } from "../components/primitives";
import { useRovingTabs } from "../hooks";
import AppFrame from "../components/AppFrame";
import PlayerFrame from "../components/PlayerFrame";
import TimelineMock, { type TimelineTrack } from "../components/TimelineMock";
import { DEMO_CAPTION_STYLE, DEMO_SCENES } from "../demo-project";
import { HONESTY, PLANS, type PlanId } from "../product-facts";

/**
 * Plans.
 *
 * Two rules, and they pull in opposite directions until you look closely:
 *
 *  - Free must not look broken. It is the complete route from script to
 *    exported file, drawn as a working workspace, not a workspace with
 *    holes in it.
 *  - Paid must not be vapour. Accounts and billing are not live, so the
 *    paid tiers carry a "Coming soon" badge and the section says plainly
 *    that nothing can be bought today.
 *
 * Switching plans changes the workspace beside the cards — you see what you
 * would gain, rather than the page greying itself out.
 */

const TRACKS_BY_PLAN: Record<PlanId, TimelineTrack[]> = {
  free: ["scenes", "voice", "captions"],
  sceneflow: ["scenes", "voice", "music", "sfx", "captions", "effects"],
  sceneforge: ["scenes", "voice", "music", "sfx", "captions", "effects"],
};

export default function Pricing() {
  const [active, setActive] = useState(0);
  const { setRef, onKeyDown } = useRovingTabs(PLANS.length, active, setActive);
  const plan = PLANS[active];

  return (
    <Section id="pricing" tone="white">
      <SectionHead
        id="pricing"
        eyebrow="Plans"
        title="Start free. The whole workflow is in the free plan."
        lead="Free is not a trailer for the product — it is the product, from script to exported file. The paid tiers widen the creative library and the capacity around that same workflow."
      />

      <div className="mkt-optrow" role="tablist" aria-label="Plans" onKeyDown={onKeyDown} style={{ marginBottom: 18 }}>
        {PLANS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            ref={setRef(index)}
            className="mkt-opt"
            aria-selected={active === index}
            aria-controls="plan-workspace"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
          >
            {entry.name}
            {entry.availability === "soon" && <span className="mkt-opt-no">soon</span>}
          </button>
        ))}
      </div>

      <div className="mkt-grid cols-3">
        {PLANS.map((entry, index) => (
          <div className={`mkt-plan${active === index ? " is-on" : ""}`} key={entry.id}>
            <div>
              <div className="mkt-scene-top">
                <h3 className="mkt-h3">{entry.name}</h3>
                {entry.availability === "live" ? (
                  <Pill tone="live">
                    <span className="mkt-dot" aria-hidden="true" />
                    Available now
                  </Pill>
                ) : (
                  <ComingSoon />
                )}
              </div>
              <p className="mkt-small" style={{ marginTop: 6 }}>
                {entry.tagline}
              </p>
            </div>

            <div>
              <div className="mkt-plan-price">{entry.priceLabel}</div>
              <p className="mkt-small">{entry.priceNote}</p>
            </div>

            <ul className="mkt-list">
              {entry.includes.map((line) => (
                <li key={line}>
                  <span className={`mkt-tick${entry.availability === "soon" ? " is-lock" : ""}`} aria-hidden="true">
                    {entry.availability === "soon" ? "+" : "✓"}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: "auto" }}>
              {entry.availability === "live" ? (
                <button
                  type="button"
                  className="mkt-btn"
                  style={{ width: "100%" }}
                  onClick={() => setActive(index)}
                >
                  See what is included
                </button>
              ) : (
                <button
                  type="button"
                  className="mkt-btn"
                  style={{ width: "100%" }}
                  onClick={() => setActive(index)}
                >
                  See what it adds
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* the workspace changes with the plan */}
      <figure style={{ margin: "22px 0 0" }}>
        <div id="plan-workspace" role="tabpanel" aria-label={`${plan.name} workspace`}>
          <AppFrame title={`Where Cities Begin · ${plan.name} workspace`} phase="studio">
            <div className="mkt-work">
              <div className="mkt-work-top">
                <PlayerFrame
                  assetId={DEMO_SCENES[1].assetId}
                  caption={DEMO_SCENES[1].caption}
                  captionStyle={DEMO_CAPTION_STYLE}
                  progress={0.5}
                  badge={`${plan.name} · ${plan.workspace.exports}`}
                  sizes="(min-width: 950px) 460px, 92vw"
                />
                <div>
                  <div className="mkt-strip-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <span className="mkt-strip-label">🎙 Narrators</span>
                    <Pill tone="accent">{plan.workspace.voices}</Pill>
                  </div>
                  <div className="mkt-strip-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 8 }}>
                    <span className="mkt-strip-label">💬 Captions</span>
                    <Pill tone="accent">{plan.workspace.captions}</Pill>
                  </div>
                  <div className="mkt-chiprow" style={{ marginTop: 10 }}>
                    {PLANS[PLANS.length - 1].workspace.studio.map((tool) => {
                      const included = plan.workspace.studio.includes(tool);
                      return (
                        <span key={tool} className={`mkt-chip${included ? " is-on" : " is-locked"}`}>
                          {included ? "●" : "🔒"} {tool}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <TimelineMock tracks={TRACKS_BY_PLAN[plan.id]} playheadAt={0.5} showRuler={false} height={20} />

              {plan.id === "sceneforge" && (
                <div className="mkt-chiprow">
                  <span className="mkt-chip is-on">⏭ Batch queue</span>
                  <span className="mkt-chip is-on">⚡ Priority processing</span>
                  <span className="mkt-chip is-on">📦 High-volume exports</span>
                </div>
              )}
            </div>
          </AppFrame>
        </div>

        <FigureNote>
          <Pill>{HONESTY.conceptLabel}</Pill>
          <span>
            Switching plan reveals what the tier adds — the workspace is never disabled, only widened.
          </span>
        </FigureNote>
      </figure>

      <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 18 }}>
        <p className="mkt-small">
          <b>{HONESTY.planLabel}.</b> Scenering runs on your own machine today, and the complete workflow shown on
          this page is what you get when you open the studio. The tiers above describe how the hosted service will
          be packaged; no plan can be purchased yet, and prices will be published when accounts open.
        </p>
      </div>
    </Section>
  );
}
