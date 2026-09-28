import { useRef } from "react";
import { useInView, useStageSequence } from "../hooks";
import { MarketingImage } from "./primitives";
import Waveform from "./Waveform";
import CaptionLine from "./CaptionLine";
import PlayerFrame from "./PlayerFrame";
import { DEMO_CAPTION_STYLE, DEMO_VOICE, type DemoScene } from "../demo-project";
import Icon from "../../components/icons/Icon";

/**
 * One scene becoming a finished scene — script, visual, voice, caption, shot.
 *
 * Reused wherever the page needs to say "this is what Scenering does to a
 * line of text" without repeating the whole workspace. The sequence advances
 * only while it is on screen, stops on interaction, and shows the finished
 * state immediately under reduced motion.
 */

const STEPS = ["Script", "Visual", "Voice", "Caption", "Finished scene"];

export default function SceneTransformation({ scene }: { scene: DemoScene }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInView(hostRef);
  const { stage, goTo, reached } = useStageSequence(STEPS.length, {
    intervalMs: 1700,
    active: inView,
  });

  return (
    <div className="mkt-panel mkt-pad" ref={hostRef}>
      <div className="mkt-optrow" role="tablist" aria-label="Scene transformation steps">
        {STEPS.map((step, index) => (
          <button
            key={step}
            type="button"
            role="tab"
            className="mkt-opt"
            aria-selected={stage === index}
            tabIndex={stage === index ? 0 : -1}
            onClick={() => goTo(index)}
          >
            <span className="mkt-opt-no">{index + 1}</span>
            {step}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <div className={`mkt-script mkt-soft${reached(0) ? " is-in" : ""}`}>
          <p className="mkt-script-line is-split">{scene.text}</p>
        </div>

        <div className={`mkt-stage${reached(1) ? " is-in" : ""}`}>
          {reached(4) ? (
            <PlayerFrame
              assetId={scene.assetId}
              caption={scene.caption}
              captionStyle={DEMO_CAPTION_STYLE}
              highlightWord={2}
              progress={0.55}
              badge={`Scene ${scene.number} · ${scene.duration.toFixed(1)}s`}
              sizes="(min-width: 950px) 460px, 92vw"
            />
          ) : (
            <MarketingImage assetId={scene.assetId} sizes="(min-width: 950px) 460px, 92vw">
              <span className="mkt-thumb-tag">{scene.query}</span>
              <span className="mkt-thumb-tag is-right">{scene.source}</span>
            </MarketingImage>
          )}
        </div>

        <div className={`mkt-stage${reached(2) ? " is-in" : ""}`}>
          <div className="mkt-panel-flat" style={{ padding: 10, display: "grid", gap: 6 }}>
            <div className="mkt-scene-top">
              <span className="mkt-pill is-accent"><Icon glyph="🎙" /> {DEMO_VOICE.name}</span>
              <span className="mkt-small">{DEMO_VOICE.accent}</span>
              <span className="mkt-small">· {scene.duration.toFixed(1)}s of narration</span>
            </div>
            <Waveform seed={`transform-${scene.number}`} variant="dots" height={26} live={stage === 2} />
          </div>
        </div>

        <div className={`mkt-stage${reached(3) ? " is-in" : ""}`}>
          <div
            className="mkt-panel-flat"
            style={{ padding: 12, display: "flex", justifyContent: "center", background: "#141827" }}
          >
            <CaptionLine text={scene.caption} style={DEMO_CAPTION_STYLE} size={15} highlightWord={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
