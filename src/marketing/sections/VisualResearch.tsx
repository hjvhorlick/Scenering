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
 * And then the message that matters most to a creator: don't like the image?
 * Replace it. This demonstration really does swap, so the visitor feels it.
 */
export default function VisualResearch() {
  const scene = DEMO_SCENES[2];
  const accepted = DEMO_SEARCH_RESULTS.filter((result) => result.accepted && result.assetId);
  const [chosen, setChosen] = useState(0);
  const current = accepted[chosen];

  return (
    <Section id="visuals" tone="tinted">
      <SectionHead
        id="visuals"
        eyebrow="03 · Visuals"
        title={MESSAGES.visuals}
        lead="Each scene writes its own search from its own words, checks what comes back, and keeps the one that fits. You can overrule it at any point."
      />

      {/* the flow, spelled out */}
      <div className="mkt-panel mkt-pad" style={{ marginBottom: 18 }}>
        <div className="mkt-flow">
          {SEARCH_POLICY.map((step, index) => (
            <span key={step.step} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="mkt-chip is-on">
                {index + 1}. {step.step}
              </span>
              <span className="mkt-small">{step.detail}</span>
              {index < SEARCH_POLICY.length - 1 && (
                <span className="mkt-flow-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <figure style={{ margin: 0 }}>
        <AppFrame title="Where Cities Begin · Scene 03 · Visual search" phase="scenes">
          <div className="mkt-work">
            <div className="mkt-search">
              <span aria-hidden="true">🔍</span>
              <span>{scene.query}</span>
              <span className="mkt-pill is-plain" style={{ marginLeft: "auto" }}>
                built from the scene text
              </span>
            </div>

            <div className="mkt-work-top">
              {/* results */}
              <div>
                <p className="mkt-strip-label" style={{ marginBottom: 8 }}>
                  Results — {DEMO_SEARCH_RESULTS.filter((r) => r.accepted).length} usable of{" "}
                  {DEMO_SEARCH_RESULTS.length}
                </p>
                <div className="mkt-results">
                  {DEMO_SEARCH_RESULTS.map((result) => {
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
                  Results that are not photographs, not 16:9 or under 1920×1080 are skipped before you see them — a
                  1080p render never has to upscale its footage.
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
                    <Icon glyph="⬆" /> Use my own file
                  </button>
                  <button type="button" className="mkt-mini-btn">
                    ⤢ Crop &amp; reposition
                  </button>
                </div>
                <p className="mkt-small" style={{ marginTop: 10 }}>
                  <b>Don’t like the image? Replace it.</b> Pick another result, search again, or bring your own
                  photo or clip. The scene text, narration and timing stay exactly as they were.
                </p>
              </div>
            </div>
          </div>
        </AppFrame>

        <FigureNote>
          <Pill>{HONESTY.conceptLabel}</Pill>
          <span>Try it — choosing a result really does change the scene preview.</span>
        </FigureNote>
      </figure>
    </Section>
  );
}
