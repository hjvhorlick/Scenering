import { Suspense, lazy, useRef, useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import { useInView, useStageSequence } from "../hooks";
import AppFrame from "../components/AppFrame";
import PlayerFrame from "../components/PlayerFrame";
import TimelineMock, { type TimelineTrack } from "../components/TimelineMock";

/** The studio's own visualiser renderer — a separate chunk, loaded on sight. */
const RealVisualiser = lazy(() =>
  import("../components/RealEffects").then((m) => ({ default: m.RealVisualiser }))
);
import {
  DEMO_CAPTION_STYLE,
  DEMO_SCENES,
  DEMO_TIMELINE_EXTRAS,
  DEMO_TOTAL_SECONDS,
  formatDuration,
} from "../demo-project";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * Video Studio — the largest demonstration on the page, because it is the
 * part of Scenering that makes a video yours rather than generated.
 *
 * The preview, the timeline and the tool rails are all here, with the
 * playhead moving through the demonstration project while the section is on
 * screen. Every tool named in the rail exists in the studio; the counts
 * beside them come from product-facts.ts, which the test suite checks
 * against the real catalogues.
 */

const TOOL_TABS = [
  {
    id: "look",
    label: "Look",
    tools: [
      { name: "Filters", count: CATALOG_COUNTS.filters, on: true },
      { name: "Transitions", count: LIVE_COUNTS.transitions },
      { name: "Camera movement", count: CATALOG_COUNTS.sceneMotions },
      { name: "Intro", count: CATALOG_COUNTS.introClips },
      { name: "Outro", count: CATALOG_COUNTS.outroClips },
    ],
  },
  {
    id: "overlays",
    label: "Overlays",
    tools: [
      { name: "Text templates", count: CATALOG_COUNTS.textTemplates, on: true },
      { name: "Lower thirds", count: CATALOG_COUNTS.lowerThirds },
      { name: "Stickers", count: CATALOG_COUNTS.stickers },
      { name: "Call to action", count: CATALOG_COUNTS.ctaPlatforms },
      { name: "Logo", count: 1 },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    tools: [
      { name: "Background music", count: CATALOG_COUNTS.musicTracks, on: true },
      { name: "Sound effects", count: CATALOG_COUNTS.soundEffects },
      { name: "Sound visualisers", count: CATALOG_COUNTS.visualisers },
      { name: "Narration ambience", count: 1 },
    ],
  },
] as const;

const TRACK_SETS: TimelineTrack[][] = [
  ["scenes"],
  ["scenes", "voice"],
  ["scenes", "voice", "captions"],
  ["scenes", "voice", "music", "sfx", "captions"],
  ["scenes", "voice", "music", "sfx", "captions", "effects"],
];

export default function VideoStudioSection() {
  const figureRef = useRef<HTMLElement>(null);
  const inView = useInView(figureRef);
  // Builds the timeline up one track at a time and then holds the finished
  // arrangement, rather than looping while someone is reading it.
  const { stage } = useStageSequence(TRACK_SETS.length, {
    intervalMs: 1600,
    active: inView,
    loop: false,
  });
  const [tab, setTab] = useState(0);
  const playhead = 0.18 + stage * 0.16;
  const scene = DEMO_SCENES[Math.min(DEMO_SCENES.length - 1, Math.floor(playhead * DEMO_SCENES.length))];

  return (
    <Section id="video-studio" tone="tinted">
      <SectionHead
        id="video-studio"
        eyebrow="06 · Video Studio"
        title={MESSAGES.studio}
        lead="A preview, a timeline and every layer that sits on top of it: filters, music, sound effects, captions, stickers, lower thirds, calls to action, intro and outro — arranged against the scenes you already have."
      />

      <figure ref={figureRef} style={{ margin: 0 }}>
        <AppFrame title={`Where Cities Begin · Video Studio · ${formatDuration(DEMO_TOTAL_SECONDS)}`} phase="studio">
          <div className="mkt-work">
            <div className="mkt-work-top">
              <div>
                <PlayerFrame
                  assetId={scene.assetId}
                  caption={scene.caption}
                  captionStyle={DEMO_CAPTION_STYLE}
                  highlightWord={1}
                  progress={playhead}
                  badge={`Scene ${scene.number} · ${DEMO_TIMELINE_EXTRAS.filter.name}`}
            grade={DEMO_TIMELINE_EXTRAS.filter.css}
                  sizes="(min-width: 950px) 520px, 92vw"
                >
                  <span
                    className="mkt-chip"
                    style={{ position: "absolute", right: 9, top: 9, fontSize: 10 }}
                  >
                    <Icon glyph="▶" /> Subscribe
                  </span>
                </PlayerFrame>
                <div className="mkt-chiprow" style={{ marginTop: 9 }}>
                  <span className="mkt-chip is-on">◑ {DEMO_TIMELINE_EXTRAS.filter.name}</span>
                  <span className="mkt-chip is-on">⇄ {DEMO_TIMELINE_EXTRAS.transition.name}</span>
                  <span className="mkt-chip">▭ {DEMO_TIMELINE_EXTRAS.lowerThird.name}</span>
                  <span className="mkt-chip">✱ {DEMO_TIMELINE_EXTRAS.sticker.name}</span>
                </div>
              </div>

              {/* tool rail */}
              <div>
                <div className="mkt-optrow" role="tablist" aria-label="Studio tools">
                  {TOOL_TABS.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      className="mkt-opt"
                      aria-selected={tab === index}
                      tabIndex={tab === index ? 0 : -1}
                      onClick={() => setTab(index)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                  {TOOL_TABS[tab].tools.map((tool) => (
                    <div
                      className="mkt-strip-row"
                      key={tool.name}
                      style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}
                    >
                      <span className="mkt-strip-label">
                        {"on" in tool && tool.on ? "● " : "○ "}
                        {tool.name}
                      </span>
                      <span className="mkt-pill is-plain">{tool.count}</span>
                    </div>
                  ))}
                </div>

                {/* The real visualiser, drawn by the render engine rather than
                    a decorative squiggle. Loaded with the effects gallery. */}
                <div style={{ marginTop: 10 }}>
                  <div className="mkt-strip-row" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
                    <span className="mkt-strip-label"><Icon glyph="◎" /> Sound visualiser</span>
                    <span className="mkt-pill is-plain">{CATALOG_COUNTS.visualisers}</span>
                  </div>
                  <Suspense fallback={<div className="mkt-real-loading is-small">Loading…</div>}>
                    {inView && <RealVisualiser type="minimal_voice" />}
                  </Suspense>
                </div>
              </div>
            </div>

            <TimelineMock tracks={TRACK_SETS[stage]} playheadAt={playhead} />

            <div className="mkt-chiprow">
              <span className="mkt-chip">↶ Undo</span>
              <span className="mkt-chip"><Icon glyph="▶" /> Preview timeline</span>
              <span className="mkt-chip is-on">⤓ Render · MP4 1080p</span>
            </div>
          </div>
        </AppFrame>

        <FigureNote>
          <Pill>{HONESTY.conceptLabel}</Pill>
          <span>
            Track widths are the real scene durations of the demonstration project — {formatDuration(DEMO_TOTAL_SECONDS)}{" "}
            in total.
          </span>
        </FigureNote>
      </figure>
    </Section>
  );
}
