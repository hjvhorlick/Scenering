import { useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import SceneCard from "../components/SceneCard";
import { DEMO_PROJECT, DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { HONESTY, MESSAGES } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * The Scenes board.
 *
 * The point this section has to land: scenes follow *meaning and narration*.
 * Each card shows its own duration, and they are all different, because a
 * scene lasts as long as the line it narrates. There is no fixed interval,
 * no "new picture every ten seconds".
 */
export default function ScenesSection() {
  const [selected, setSelected] = useState(3);

  return (
    <Section id="scenes">
      <SectionHead
        id="scenes"
        eyebrow="02 · Scenes"
        title={MESSAGES.scenes}
        lead="Your script is divided into scenes that follow the sentences, and every scene keeps the length of its own narration. Longer line, longer scene."
      />

      <div className="mkt-split is-reverse">
        <div>
          <ul className="mkt-list">
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Divided by meaning, not by a timer.</b> Scene lengths below run from{" "}
                {Math.min(...DEMO_SCENES.map((s) => s.duration)).toFixed(1)}s to{" "}
                {Math.max(...DEMO_SCENES.map((s) => s.duration)).toFixed(1)}s — there is no fixed interval.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Narration sets the timing.</b> When the voice is generated, each scene is fitted to the audio, so
                there are no silent gaps at the end of a scene.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Every card is editable.</b> Rewrite the text, swap the visual, drop in your own clip, crop and
                reposition, change the motion — one scene or all of them.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Nothing is locked in.</b> Change a scene after narration and the timing follows the new line.
              </span>
            </li>
          </ul>

          <div className="mkt-stats" style={{ marginTop: 20 }}>
            <div className="mkt-stat">
              <b>{DEMO_SCENES.length}</b>
              <span>scenes in this project</span>
            </div>
            <div className="mkt-stat">
              <b>{formatDuration(DEMO_TOTAL_SECONDS)}</b>
              <span>total runtime</span>
            </div>
          </div>
        </div>

        <figure style={{ margin: 0 }}>
          <AppFrame title={`${DEMO_PROJECT.title} · Scenes`} phase="scenes">
            <div style={{ display: "grid", gap: 10 }}>
              {DEMO_SCENES.map((scene, index) => (
                <SceneCard
                  key={scene.number}
                  scene={scene}
                  selected={index === selected}
                  onSelect={() => setSelected(index)}
                  compact={index !== selected}
                />
              ))}
            </div>
          </AppFrame>
          <FigureNote>
            <Pill>{HONESTY.conceptLabel}</Pill>
            <span>Select a card to see the scene controls — the studio behaves the same way.</span>
          </FigureNote>
        </figure>
      </div>
    </Section>
  );
}
