import { useState } from "react";
import { Section, SectionHead, Pill, FigureNote, MarketingImage } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import PlayerFrame from "../components/PlayerFrame";
import { DEMO_CAPTION_STYLE, DEMO_SCENES, DEMO_SEARCH_RESULTS } from "../demo-project";
import { HONESTY, MESSAGES, SEARCH_POLICY } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * Visual research, and the replace control.
 *
 * Two things this section has to be straight about:
 *
 *  1. Scenering *searches for existing photographs* through the sources you
 *     connect. It is not generating a picture for every scene and calling it
 *     research.
 *
 *  2. Results are filtered before you ever see them — photographic, 16:9, at
 *     least 1920×1080 — and only the picture a scene actually uses gets
 *     downloaded.
 *
 * Four results are shown — three usable and one the filter threw out — not the
 * whole list: the point is the decision, and a phone cannot read a contact
 * sheet. The replace button still really swaps the preview.
 */
const SHOWN_RESULTS = [
  ...DEMO_SEARCH_RESULTS.filter((result) => result.accepted).slice(0, 3),
  ...DEMO_SEARCH_RESULTS.filter((result) => !result.accepted).slice(0, 1),
];

export default function VisualResearch() {
  const scene = DEMO_SCENES[2];
  const accepted = SHOWN_RESULTS.filter((result) => result.accepted && result.assetId);
  const [chosen, setChosen] = useState(0);
  const current = accepted[chosen];

  return (
    <Section id="visuals" tone="tinted">
      <SectionHead
        id="visuals"
        eyebrow="03 · Visuals"
        title={MESSAGES.visuals}
        lead="Each scene writes its own search and keeps the picture that fits — and you can overrule it."
      />

      {/* the rules, in one line each */}
      <ul className="mkt-list mkt-list-tight">
        {SEARCH_POLICY.map((step) => (
          <li key={step.step}>
            <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
            <span>
              <b>{step.step}.</b> {step.detail}
            </span>
          </li>
        ))}
      </ul>

      <figure className="mkt-figure" style={{ margin: "16px 0 0" }}>
        <AppFrame title="Where Cities Begin · Scene 03 · Visual search" phase="scenes">
          <div className="mkt-work">
            <div className="mkt-search">
              <span aria-hidden="true"><Icon glyph="🔍" /></span>
              <span className="mkt-search-query">{scene.query}</span>
              <span className="mkt-pill is-plain">from the scene</span>
            </div>

            <div className="mkt-work-top">
              {/* results */}
              <div>
                <p className="mkt-strip-label" style={{ marginBottom: 8 }}>
                  Results — {accepted.length} usable of {SHOWN_RESULTS.length}
                </p>
                <div className="mkt-results">
                  {SHOWN_RESULTS.map((result) => {
                    const index = accepted.findIndex((entry) => entry.label === result.label);
                    const isChosen = index === chosen && index >= 0;
                    const selectable = result.accepted && result.assetId;
                    return (
                      <button
                        key={result.label}
                        type="button"
                        className={`mkt-result${isChosen ? " is-selected" : ""}${result.accepted ? "" : " is-rejected"}`}
                        onClick={() => selectable && setChosen(index)}
                        disabled={!selectable}
                        aria-pressed={isChosen}
                        aria-label={
                          result.accepted
                            ? `Use ${result.label} for scene ${scene.number}`
                            : `${result.label} — rejected: ${result.reason}`
                        }
                        style={{ textAlign: "left", cursor: selectable ? "pointer" : "default" }}
                      >
                        {result.assetId ? (
                          <MarketingImage assetId={result.assetId} sizes="(min-width: 950px) 150px, 42vw" />
                        ) : (
                          <span className="mkt-thumb is-pending" role="img" aria-label={result.label}>
                            {result.reason}
                          </span>
                        )}
                        <span className="mkt-result-meta">
                          <span>{result.source}</span>
                          <span>{isChosen ? "In use" : result.accepted ? result.size : "Skipped"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mkt-small" style={{ marginTop: 8 }}>
                  Anything not a 16:9 photo of 1920&nbsp;×&nbsp;1080 is skipped before you see it.
                </p>
              </div>

              {/* the scene as it stands */}
              <div>
                <p className="mkt-strip-label" style={{ marginBottom: 8 }}>
                  Scene {scene.number} preview
                </p>
                <PlayerFrame
                  assetId={current?.assetId ?? scene.assetId}
                  caption={scene.caption}
                  captionStyle={DEMO_CAPTION_STYLE}
                  progress={0.4}
                  badge={`${scene.duration.toFixed(1)}s · ${current?.source ?? scene.source}`}
                  sizes="(min-width: 950px) 420px, 92vw"
                />
                <div className="mkt-scene-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="mkt-mini-btn is-primary"
                    onClick={() => setChosen((chosen + 1) % Math.max(1, accepted.length))}
                  >
                    ⟳ Replace
                  </button>
                  <button type="button" className="mkt-mini-btn">
                    <Icon glyph="⬆" /> My own file
                  </button>
                </div>
                <p className="mkt-small" style={{ marginTop: 10 }}>
                  <b>Don’t like it? Replace it.</b> Text, narration and timing stay as they were.
                </p>
              </div>
            </div>
          </div>
        </AppFrame>

        <FigureNote>
          <Pill>{HONESTY.conceptLabel}</Pill>
          <span>Choosing a result really does change the preview.</span>
        </FigureNote>
      </figure>
    </Section>
  );
}
