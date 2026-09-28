import { useRef } from "react";
import { navigate, STUDIO_PATH } from "../../lib/route";
import { useInView, useStageSequence } from "../hooks";
import { MarketingImage, Pill } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import Waveform from "../components/Waveform";
import CaptionLine from "../components/CaptionLine";
import PlayerFrame from "../components/PlayerFrame";
import TimelineMock from "../components/TimelineMock";
import {
  DEMO_CAPTION_STYLE,
  DEMO_PROJECT,
  DEMO_SCENES,
  DEMO_TOTAL_SECONDS,
  DEMO_VOICE,
  formatDuration,
} from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import type { ProjectPhase } from "../../components/StepNav";

/**
 * The hero: one idea becoming a complete video, in seven stages.
 *
 *   1 script            5 captions
 *   2 scenes            6 Video Studio
 *   3 visuals           7 finished video
 *   4 voice
 *
 * The stages are the product, in order, and the same order the rest of the
 * page follows. The sequence runs only while the hero is on screen, any stage
 * can be selected from the keyboard, and with reduced motion the finished
 * composition is what loads.
 */

const STAGES = [
  { id: "script", label: "Script", phase: "setup" },
  { id: "scenes", label: "Scenes", phase: "scenes" },
  { id: "visuals", label: "Visuals", phase: "scenes" },
  { id: "voice", label: "Voice", phase: "voiceover" },
  { id: "captions", label: "Captions", phase: "captions" },
  { id: "studio", label: "Video Studio", phase: "studio" },
  { id: "video", label: "Finished video", phase: "render" },
] as const;

export default function Hero() {
  const figureRef = useRef<HTMLElement>(null);
  const inView = useInView(figureRef);
  // Plays through once and rests on the finished video — a hero that
  // restarts every thirteen seconds is a distraction, and the seven chips
  // below let anyone step back through it by hand.
  const { stage, goTo, reached } = useStageSequence(STAGES.length, {
    intervalMs: 1900,
    active: inView,
    loop: false,
  });

  const phase = STAGES[stage].phase as ProjectPhase;
  const playing = stage === STAGES.length - 1;

  return (
    <header className="mkt-hero" id="top">
      <div className="mkt-container">
        <div className="mkt-hero-grid">
          {/* ------------------------------------------------ the promise */}
          <div>
            <div className="mkt-eyebrow">Script to finished video</div>
            <h1 className="mkt-h1">{MESSAGES.hero}</h1>
            <p className="mkt-lead">{MESSAGES.heroSub}</p>

            <div className="mkt-hero-cta">
              <button
                type="button"
                className="mkt-btn mkt-btn-primary mkt-btn-lg"
                onClick={() => navigate(STUDIO_PATH)}
              >
                Open the studio
              </button>
              <a className="mkt-btn mkt-btn-lg" href="#workflow">
                See how it works
              </a>
            </div>

            <div className="mkt-hero-note">
              <Pill tone="live">
                <span className="mkt-dot" aria-hidden="true" />
                No account needed
              </Pill>
              <Pill>{LIVE_COUNTS.voices} narrators</Pill>
              <Pill>{LIVE_COUNTS.captionStyles} caption styles</Pill>
              <Pill>16:9 and 9:16</Pill>
            </div>
            <p className="mkt-small" style={{ marginTop: 12 }}>
              {HONESTY.localNote}
            </p>
          </div>

          {/* --------------------------------------------- the workspace */}
          <figure ref={figureRef} style={{ margin: 0 }}>
            <AppFrame
              title={`${DEMO_PROJECT.title} · ${DEMO_PROJECT.format} · ${DEMO_PROJECT.resolution}`}
              phase={phase}
            >
              <div className="mkt-work">
                {/* script + preview */}
                <div className="mkt-work-top">
                  <div className="mkt-script">
                    <div className="mkt-strip-label">
                      <span aria-hidden="true">📝</span> Script
                    </div>
                    {DEMO_PROJECT.script.map((line, index) => (
                      <p
                        key={line}
                        className={`mkt-script-line${reached(1) ? " is-split" : ""}`}
                        style={{ transitionDelay: `${index * 70}ms` }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  <div>
                    <PlayerFrame
                      assetId={DEMO_SCENES[3].assetId}
                      caption={reached(4) ? DEMO_SCENES[3].caption : undefined}
                      captionStyle={DEMO_CAPTION_STYLE}
                      highlightWord={playing ? 1 : undefined}
                      progress={playing ? 0.62 : 0.24}
                      badge={
                        playing
                          ? `Playing · ${formatDuration(DEMO_TOTAL_SECONDS)}`
                          : `Preview · ${formatDuration(DEMO_TOTAL_SECONDS)}`
                      }
                      sizes="(min-width: 1080px) 420px, 92vw"
                      eager
                    />
                    <div className={`mkt-chiprow mkt-stage${reached(5) ? " is-in" : ""}`} style={{ marginTop: 8 }}>
                      <span className="mkt-chip is-on">◑ Warm &amp; Gold Glow</span>
                      <span className="mkt-chip">♪ Music</span>
                      <span className="mkt-chip">✱ Sticker</span>
                      <span className="mkt-chip">▶ Subscribe</span>
                    </div>
                  </div>
                </div>

                {/* scenes */}
                <div className={`mkt-stage${reached(1) ? " is-in" : ""}`}>
                  <div className="mkt-strip">
                    {DEMO_SCENES.map((scene, index) => (
                      <div key={scene.number} className="mkt-mini" style={{ transitionDelay: `${index * 60}ms` }}>
                        {reached(2) ? (
                          <MarketingImage assetId={scene.assetId} sizes="120px">
                            <span className="mkt-thumb-tag">{scene.duration.toFixed(1)}s</span>
                          </MarketingImage>
                        ) : (
                          <span className="mkt-thumb is-pending" role="img" aria-label="Searching for a visual">
                            Searching…
                          </span>
                        )}
                        <div className="mkt-mini-top">
                          <span className="mkt-scene-no">{scene.number}</span>
                          {reached(3) && (
                            <span className="mkt-pill is-accent" style={{ padding: "1px 6px", fontSize: 10 }}>
                              🎙
                            </span>
                          )}
                        </div>
                        <p className="mkt-mini-text">{scene.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* narration */}
                <div className={`mkt-stage${reached(3) ? " is-in" : ""}`}>
                  <div className="mkt-strip-row">
                    <span className="mkt-strip-label">
                      <span aria-hidden="true">🎙</span> {DEMO_VOICE.name} · {DEMO_VOICE.accent}
                    </span>
                    <Waveform seed="hero-narration" bars={72} height={26} live={playing} />
                  </div>
                </div>

                {/* captions */}
                <div className={`mkt-stage${reached(4) ? " is-in" : ""}`}>
                  <div className="mkt-strip-row">
                    <span className="mkt-strip-label">
                      <span aria-hidden="true">💬</span> {DEMO_CAPTION_STYLE.name}
                    </span>
                    <div className="mkt-capstage">
                      <CaptionLine
                        text={DEMO_SCENES[3].caption}
                        style={DEMO_CAPTION_STYLE}
                        size={14}
                        highlightWord={1}
                      />
                    </div>
                  </div>
                </div>

                {/* timeline */}
                <div className={`mkt-stage${reached(5) ? " is-in" : ""}`}>
                  <TimelineMock
                    tracks={["scenes", "voice", "music", "captions", "effects"]}
                    playheadAt={playing ? 0.62 : 0.24}
                    showRuler={false}
                    height={22}
                  />
                </div>
              </div>
            </AppFrame>

            {/* stage control — also the caption for the whole figure */}
            <div className="mkt-optrow" style={{ marginTop: 12 }} role="tablist" aria-label="Workflow stage shown">
              {STAGES.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  className="mkt-opt"
                  aria-selected={stage === index}
                  tabIndex={stage === index ? 0 : -1}
                  onClick={() => goTo(index)}
                >
                  <span className="mkt-opt-no">{String(index + 1).padStart(2, "0")}</span>
                  {entry.label}
                </button>
              ))}
            </div>

            <figcaption className="mkt-figcap">
              <Pill>{HONESTY.conceptLabel}</Pill>
              <span>
                “{DEMO_PROJECT.title}” — a fictional {formatDuration(DEMO_TOTAL_SECONDS)} project used across this
                page.
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </header>
  );
}
