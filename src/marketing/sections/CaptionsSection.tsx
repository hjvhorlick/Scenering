import { useEffect, useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import CaptionLine from "../components/CaptionLine";
import PlayerFrame from "../components/PlayerFrame";
import { CAPTION_STYLES, loadCaptionFonts } from "../../data/caption-styles";
import { DEMO_SCENES } from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import Icon from "../../components/icons/Icon";

/**
 * Captions.
 *
 * Every style on this page is rendered from the same recipe the video
 * renderer burns in — typeface, case, tracking, colours, outline and shadow
 * all come from `src/data/caption-styles.ts`. If a style is added to the app
 * it appears here; the count in the heading is the length of that array.
 *
 * Styles outside the Free set carry a quiet lock. The Free set is shown
 * working and complete, not crippled.
 */

/** Caption styles included with Free — a packaging decision, kept here. */
const FREE_STYLE_IDS = ["newsroom_clean", "cinema_classic", "poster_impact"];

export default function CaptionsSection() {
  const scene = DEMO_SCENES[3];
  const [styleId, setStyleId] = useState(FREE_STYLE_IDS[0]);
  const style = CAPTION_STYLES.find((entry) => entry.id === styleId) ?? CAPTION_STYLES[0];

  // The caption typefaces are web fonts; load them once this section exists
  // so the previews are honest rather than approximated in a system font.
  useEffect(() => {
    loadCaptionFonts();
  }, []);

  return (
    <Section id="captions">
      <SectionHead
        id="captions"
        eyebrow="05 · Captions"
        title={MESSAGES.captions}
        lead={`${LIVE_COUNTS.captionStyles} styles across ${LIVE_COUNTS.captionCategories} families — classical, formal, modern, artsy and fun. Word-by-word highlighting or a clean subtitle line, in your own colours if you want them.`}
      />

      <div className="mkt-split is-reverse">
        <div>
          <ul className="mkt-list">
            <li>
              <span className="mkt-tick" aria-hidden="true">
                ✓
              </span>
              <span>
                <b>Timed to the narration.</b> Caption timing comes from the generated audio, not from a guess at
                reading speed.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true">
                ✓
              </span>
              <span>
                <b>Word-by-word or line-by-line.</b> Karaoke highlighting for social cuts, a steady subtitle for
                documentary work.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true">
                ✓
              </span>
              <span>
                <b>Yours to adjust.</b> Size, position, case, text and highlight colour, background box or none.
              </span>
            </li>
            <li>
              <span className="mkt-tick is-lock" aria-hidden="true">
                🔒
              </span>
              <span>
                <b>{FREE_STYLE_IDS.length} styles on Free, all {LIVE_COUNTS.captionStyles} on SceneFlow.</b> The Free
                set is complete and unmarked — nothing is watermarked to make a point.
              </span>
            </li>
          </ul>

          <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 16 }}>
            <p className="mkt-strip-label" style={{ marginBottom: 10 }}>
              {style.category} · {style.name}
            </p>
            <p className="mkt-small">{style.description}</p>
          </div>
        </div>

        <figure style={{ margin: 0 }}>
          <AppFrame title="Where Cities Begin · Captions" phase="captions">
            <div className="mkt-work">
              <PlayerFrame
                assetId={scene.assetId}
                caption={scene.caption}
                captionStyle={style}
                highlightWord={2}
                progress={0.52}
                badge="Karaoke · word by word"
                captionSize={17}
                sizes="(min-width: 950px) 520px, 92vw"
              />

              <div style={{ display: "grid", gap: 8 }}>
                {CAPTION_STYLES.map((entry) => {
                  const free = FREE_STYLE_IDS.includes(entry.id);
                  const on = entry.id === style.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="mkt-strip-row"
                      onClick={() => setStyleId(entry.id)}
                      aria-pressed={on}
                      style={{
                        cursor: "pointer",
                        textAlign: "left",
                        borderColor: on ? "var(--mkt-accent-line)" : undefined,
                        boxShadow: on ? "0 0 0 3px var(--mkt-accent-soft)" : undefined,
                      }}
                    >
                      <span className="mkt-strip-label">
                        {entry.name}
                        {free ? (
                          <span className="mkt-pill is-live" style={{ fontSize: 9.5 }}>
                            Free
                          </span>
                        ) : (
                          <span className="mkt-pill is-plain" style={{ fontSize: 9.5 }}>
                            <Icon glyph="🔒" /> SceneFlow
                          </span>
                        )}
                      </span>
                      <span className="mkt-capstage">
                        <CaptionLine text={scene.caption} style={entry} size={15} highlightWord={2} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </AppFrame>
          <FigureNote>
            <Pill>{HONESTY.conceptLabel}</Pill>
            <span>Styles rendered from the app’s caption catalogue — same fonts, colours and outlines.</span>
          </FigureNote>
        </figure>
      </div>
    </Section>
  );
}
