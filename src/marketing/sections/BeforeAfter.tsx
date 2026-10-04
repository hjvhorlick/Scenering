import { useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import PlayerFrame from "../components/PlayerFrame";
import TimelineMock from "../components/TimelineMock";
import CaptionLine from "../components/CaptionLine";
import {
  DEMO_CAPTION_STYLE,
  DEMO_PROJECT,
  DEMO_SCENES,
  DEMO_TIMELINE_EXTRAS,
  DEMO_TOTAL_SECONDS,
  DEMO_VOICE,
  formatDuration,
} from "../demo-project";
import { HONESTY } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * Before and after.
 *
 * Left: the script, as it arrives — text, nothing else.
 * Right: the same words as a finished project.
 *
 * The slider is a plain range input on purpose: it is keyboard-operable for
 * free, it works with animation switched off, and on a phone both states are
 * simply stacked.
 */
export default function BeforeAfter() {
  const [after, setAfter] = useState(100);
  const strength = after / 100;

  return (
    <Section id="before-after">
      <SectionHead
        id="before-after"
        eyebrow="Before · after"
        title="The same words, twice."
        lead="Everything on the right came out of the text on the left."
      />

      <div className="mkt-ba">
        {/* before */}
        <div className="mkt-panel mkt-pad">
          <div className="mkt-scene-top" style={{ marginBottom: 12 }}>
            <Pill tone="plain">Before</Pill>
            <span className="mkt-small">A text file</span>
          </div>
          <div className="mkt-script">
            {DEMO_PROJECT.script.map((line) => (
              <p key={line} className="mkt-script-line">
                {line}
              </p>
            ))}
          </div>
          <p className="mkt-small" style={{ marginTop: 12 }}>
            {DEMO_PROJECT.script.join(" ").split(/\s+/).length} words. No pictures, no voice, no timing, nothing to
            upload.
          </p>
        </div>

        {/* after */}
        <div className="mkt-panel mkt-pad" style={{ opacity: 0.35 + strength * 0.65 }}>
          <div className="mkt-scene-top" style={{ marginBottom: 12 }}>
            <Pill tone="accent">After</Pill>
            <span className="mkt-small">
              {DEMO_SCENES.length} scenes · {formatDuration(DEMO_TOTAL_SECONDS)} · MP4 1080p
            </span>
          </div>

          <PlayerFrame
            assetId={DEMO_SCENES[4].assetId}
            caption={DEMO_SCENES[4].caption}
            captionStyle={DEMO_CAPTION_STYLE}
            highlightWord={3}
            progress={0.78}
            badge={`${DEMO_VOICE.name} · ${DEMO_TIMELINE_EXTRAS.filter.name}`}
            grade={DEMO_TIMELINE_EXTRAS.filter.css}
            sizes="(min-width: 860px) 520px, 92vw"
          />

          <div className="mkt-strip-row" style={{ marginTop: 10 }}>
            <span className="mkt-strip-label"><Icon glyph="🎙" /> Narration</span>
            <span className="mkt-small">
              {DEMO_VOICE.name} · {DEMO_VOICE.accent} · {formatDuration(DEMO_TOTAL_SECONDS)}
            </span>
          </div>

          <div className="mkt-strip-row" style={{ marginTop: 8 }}>
            <span className="mkt-strip-label"><Icon glyph="💬" /> Captions</span>
            <span className="mkt-capstage">
              <CaptionLine text={DEMO_SCENES[4].caption} style={DEMO_CAPTION_STYLE} size={14} highlightWord={3} />
            </span>
          </div>

          <div style={{ marginTop: 10 }}>
            <TimelineMock playheadAt={0.78} showRuler={false} showHeader={false} height={20} />
          </div>
        </div>
      </div>

      <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 16 }}>
        <label htmlFor="ba-range" className="mkt-strip-label" style={{ marginBottom: 8 }}>
          Fade the finished project in and out
        </label>
        <input
          id="ba-range"
          className="mkt-range"
          type="range"
          min={0}
          max={100}
          value={after}
          onChange={(event) => setAfter(Number(event.target.value))}
          aria-valuetext={`${after}% finished project`}
        />
      </div>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>“{DEMO_PROJECT.title}” is fictional — written for this page, not a customer project.</span>
      </FigureNote>
    </Section>
  );
}
