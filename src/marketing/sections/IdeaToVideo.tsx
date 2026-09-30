import { useState } from "react";
import { Section, SectionHead, Pill, MarketingImage, FigureNote } from "../components/primitives";
import { useRovingTabs } from "../hooks";
import AppFrame from "../components/AppFrame";
import SceneCard from "../components/SceneCard";
import Waveform from "../components/Waveform";
import CaptionLine from "../components/CaptionLine";
import PlayerFrame from "../components/PlayerFrame";
import TimelineMock from "../components/TimelineMock";
import {
  DEMO_CAPTION_STYLE,
  DEMO_TIMELINE_EXTRAS,
  DEMO_PROJECT,
  DEMO_SCENES,
  DEMO_SEARCH_RESULTS,
  DEMO_TOTAL_SECONDS,
  DEMO_VOICE,
  formatDuration,
} from "../demo-project";
import { HONESTY, WORKFLOW_STAGES } from "../product-facts";
import { CAPTION_STYLES } from "../../data/caption-styles";
import type { ProjectPhase } from "../../components/StepNav";
import Icon from "../../components/icons/Icon";

/**
 * "From Idea to Video" — the workflow, one step at a time.
 *
 * Selecting a step changes the interface beside it: Scenes shows the scene
 * board and the visual search, Video Studio shows the timeline. It is a
 * marketing demonstration of real screens, not a pretend application — none
 * of these controls claim to do anything.
 *
 * The steps are the studio's own phases, so a step id *is* a phase id and the
 * frame beside it opens on the matching tab. There is no seventh step here
 * because there is no seventh tab in the app: choosing the visuals happens
 * inside Scenes, which is what this shows.
 */

function StagePanel({ id }: { id: string }) {
  switch (id) {
    case "setup":
      return (
        <div className="mkt-work">
          <div className="mkt-script">
            <div className="mkt-strip-label">
              <span aria-hidden="true"><Icon glyph="📝" /></span> Script
            </div>
            {DEMO_PROJECT.script.map((line) => (
              <p key={line} className="mkt-script-line">
                {line}
              </p>
            ))}
          </div>
          <div className="mkt-chiprow">
            <span className="mkt-chip is-on">16:9 widescreen</span>
            <span className="mkt-chip">9:16 vertical</span>
            <span className="mkt-chip is-on">1080p</span>
            <span className="mkt-chip">{DEMO_PROJECT.pacing}</span>
          </div>
        </div>
      );

    // Scenes and their visuals are one step, because they are one tab.
    case "scenes":
      return (
        <div className="mkt-work">
          {DEMO_SCENES.slice(0, 2).map((scene) => (
            <SceneCard key={scene.number} scene={scene} showActions={false} />
          ))}
          <p className="mkt-small">
            {DEMO_SCENES.length} scenes · {formatDuration(DEMO_TOTAL_SECONDS)} · each one as long as
            its own narration
          </p>

          <div className="mkt-search">
            <span aria-hidden="true"><Icon glyph="🔍" /></span>
            <span>{DEMO_SCENES[2].query}</span>
            <span className="mkt-pill is-plain" style={{ marginLeft: "auto" }}>
              Scene 03
            </span>
          </div>
          <div className="mkt-results">
            {DEMO_SEARCH_RESULTS.slice(0, 3).map((result) => (
              <div
                key={result.label}
                className={`mkt-result${result.selected ? " is-selected" : ""}`}
              >
                {result.assetId ? (
                  <MarketingImage assetId={result.assetId} sizes="160px" />
                ) : (
                  <span className="mkt-thumb is-pending" role="img" aria-label={result.label} />
                )}
                <div className="mkt-result-meta">
                  <span>{result.source}</span>
                  <span>{result.selected ? "Selected" : result.size}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mkt-small">Only the selected visual is downloaded into the project.</p>
        </div>
      );

    case "voiceover":
      return (
        <div className="mkt-work">
          <div className="mkt-chiprow">
            <span className="mkt-chip is-on"><Icon glyph="🎙" /> {DEMO_VOICE.name}</span>
            <span className="mkt-chip">{DEMO_VOICE.accent}</span>
            <span className="mkt-chip"><Icon glyph="▶" /> Preview</span>
          </div>
          {DEMO_SCENES.slice(0, 3).map((scene) => (
            <div className="mkt-strip-row" key={scene.number}>
              <span className="mkt-strip-label">
                <span className="mkt-scene-no">{scene.number}</span> {scene.duration.toFixed(1)}s
              </span>
              <Waveform seed={`flow-${scene.number}`} variant="dots" height={22} />
            </div>
          ))}
        </div>
      );

    case "captions":
      return (
        <div className="mkt-work">
          {CAPTION_STYLES.slice(0, 3).map((style) => (
            <div className="mkt-strip-row" key={style.id}>
              <span className="mkt-strip-label">{style.name}</span>
              <div className="mkt-capstage">
                <CaptionLine text={DEMO_SCENES[3].caption} style={style} size={14} highlightWord={1} />
              </div>
            </div>
          ))}
        </div>
      );

    case "studio":
      /**
       * The order is the app's order: the preview canvas first, the timeline
       * under it, then the things you can add. See the Video Studio step in
       * src/App.tsx, which renders VideoPreview, then Timeline, then
       * VideoStudio in exactly that sequence.
       */
      return (
        <div className="mkt-work">
          <PlayerFrame
            assetId={DEMO_SCENES[2].assetId}
            caption={DEMO_SCENES[2].caption}
            captionStyle={DEMO_CAPTION_STYLE}
            highlightWord={1}
            progress={0.46}
            badge={`Scene ${DEMO_SCENES[2].number} · ${DEMO_TIMELINE_EXTRAS.filter.name}`}
            grade={DEMO_TIMELINE_EXTRAS.filter.css}
            sizes="(min-width: 950px) 520px, 92vw"
          />
          <TimelineMock playheadAt={0.46} height={22} />
          <div className="mkt-chiprow">
            <span className="mkt-chip is-on"><Icon glyph="◑" /> Filter</span>
            <span className="mkt-chip"><Icon glyph="♪" /> Music</span>
            <span className="mkt-chip"><Icon glyph="✶" /> Sound FX</span>
            <span className="mkt-chip"><Icon glyph="✱" /> Stickers</span>
            <span className="mkt-chip"><Icon glyph="▭" /> Lower third</span>
            <span className="mkt-chip"><Icon glyph="▶" /> Call to action</span>
            <span className="mkt-chip"><Icon glyph="◎" /> Visualiser</span>
          </div>
        </div>
      );

    case "render":
    default:
      return (
        <div className="mkt-work">
          <PlayerFrame
            assetId={DEMO_SCENES[4].assetId}
            caption={DEMO_SCENES[4].caption}
            captionStyle={DEMO_CAPTION_STYLE}
            highlightWord={2}
            progress={1}
            badge={`Rendered · ${formatDuration(DEMO_TOTAL_SECONDS)}`}
            sizes="(min-width: 950px) 520px, 92vw"
          />
          <div className="mkt-chiprow">
            <span className="mkt-chip is-on">MP4 · 1080p · 30 fps</span>
            <span className="mkt-chip">Frame-exact offline render</span>
            <span className="mkt-chip">Saved to Vault</span>
          </div>
        </div>
      );
  }
}

export default function IdeaToVideo() {
  const [active, setActive] = useState(1);
  const { setRef, onKeyDown } = useRovingTabs(WORKFLOW_STAGES.length, active, setActive);
  const stage = WORKFLOW_STAGES[active];

  return (
    <Section id="workflow" tone="white">
      <SectionHead
        id="workflow"
        eyebrow="From idea to video"
        title={`${WORKFLOW_STAGES.length} steps, one project.`}
        lead="Pick a step to see the part of Scenering that handles it — they are the studio's own tabs, in its own order. Everything here is the same project, carried the whole way from a block of text to an exported file."
      />

      <div className="mkt-split">
        <div>
          <div className="mkt-rail" role="tablist" aria-label="Workflow stages" onKeyDown={onKeyDown}>
            {WORKFLOW_STAGES.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                ref={setRef(index)}
                className="mkt-opt"
                aria-selected={active === index}
                aria-controls="workflow-panel"
                id={`workflow-tab-${entry.id}`}
                tabIndex={active === index ? 0 : -1}
                onClick={() => setActive(index)}
              >
                <span className="mkt-opt-no">{entry.number}</span>
                {entry.name}
              </button>
            ))}
          </div>

          <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 14 }}>
            <h3 className="mkt-h3">{stage.message}</h3>
            <p className="mkt-lead" style={{ fontSize: 14.5, marginTop: 8 }}>
              {stage.body}
            </p>
            <p className="mkt-small" style={{ marginTop: 10 }}>
              <em>“{stage.thought}”</em>
            </p>
          </div>
        </div>

        <figure style={{ margin: 0 }}>
          <div
            id="workflow-panel"
            role="tabpanel"
            aria-labelledby={`workflow-tab-${stage.id}`}
            tabIndex={-1}
          >
            <AppFrame title={`${DEMO_PROJECT.title} · ${stage.name}`} phase={stage.id as ProjectPhase}>
              <StagePanel id={stage.id} />
            </AppFrame>
          </div>
          <FigureNote>
            <Pill>{HONESTY.conceptLabel}</Pill>
            <span>
              Step {stage.number} — {stage.name} · the <b>{stage.appTab}</b> tab in the studio
            </span>
          </FigureNote>
        </figure>
      </div>
    </Section>
  );
}
