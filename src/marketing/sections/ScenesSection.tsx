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
        lead="Scenes follow your sentences, and each one lasts exactly as long as its own narration."
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
                <b>Narration sets the timing.</b> Each scene is fitted to its audio, so there are no silent gaps —
                and re-wording a line re-times it.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Every card is editable.</b> Rewrite it, swap or upload the visual, crop it, change the motion.
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
