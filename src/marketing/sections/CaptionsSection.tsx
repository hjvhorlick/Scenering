import { useEffect, useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import CaptionLine from "../components/CaptionLine";
import PlayerFrame from "../components/PlayerFrame";
import { CAPTION_STYLES, loadCaptionFonts } from "../../data/caption-styles";
import { DEMO_SCENES } from "../demo-project";
import { HONESTY, LIVE_COUNTS, MESSAGES } from "../product-facts";
import { PLAN_CONFIG, isPlanCaptionIncluded } from "../../config/plans";
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

/**
 * Which styles Free includes comes from the plan configuration, not from a
 * list typed on the website — the hand-written one here named three while
 * the plan allowed two, so the page was quietly over-promising.
 */
const freeStyles = CAPTION_STYLES.filter((style) => isPlanCaptionIncluded("free", style.id));
const freeStyleCount = PLAN_CONFIG.free.limits.captionStyles ?? freeStyles.length;

export default function CaptionsSection() {
  const scene = DEMO_SCENES[3];
  const [styleId, setStyleId] = useState(freeStyles[0]?.id ?? CAPTION_STYLES[0].id);
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
        lead={`${LIVE_COUNTS.captionStyles} styles across ${LIVE_COUNTS.captionCategories} families — word-by-word highlighting or a clean subtitle line, in your own colours.`}
      />

      <div className="mkt-split is-reverse">
        <div>
          <ul className="mkt-list">
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Timed to the narration.</b> Caption timing comes from the generated audio, not from a guess at
                reading speed.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Word-by-word or line-by-line.</b> Karaoke highlighting for social cuts, a steady subtitle
                otherwise.
              </span>
            </li>
            <li>
              <span className="mkt-tick" aria-hidden="true"><Icon glyph="✓" /></span>
              <span>
                <b>Yours to adjust.</b> Size, position, case, text and highlight colour, background box or none.
              </span>
            </li>
            <li>
              <span className="mkt-tick is-lock" aria-hidden="true"><Icon glyph="🔒" /></span>
              <span>
                <b>{freeStyleCount} styles on Free, all {LIVE_COUNTS.captionStyles} on SceneFlow.</b> Nothing is
                watermarked to make a point.
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
            {/* The Captions step is five panels, in this order, each with its
                own heading: Caption Playback Style, Background Framing, Live
                Caption Preview, Subtitle Visual Style Presets, and the
                per-scene toggles. See src/components/CaptionsStudio.tsx. The
                first two offer their choice as a pair of cards, each with the
                app's own title and line of explanation. */}
            <div className="mkt-work">
              <div>
                <p className="mkt-panelhead">
                  <span><Icon glyph="🎤" /> Caption Playback Style</span>
                  <span className="mkt-panelstate">Dynamic Sync</span>
                </p>
                <div className="mkt-cardgrid" aria-hidden="true">
                  <span className="mkt-card is-on">
                    <span className="mkt-card-title"><Icon glyph="✨" /> Karaoke Mode</span>
                    <span className="mkt-card-note">
                      Active word highlights and glows dynamically in sync with narration.
                    </span>
                  </span>
                  <span className="mkt-card">
                    <span className="mkt-card-title"><Icon glyph="📝" /> Normal Mode</span>
                    <span className="mkt-card-note">
                      Clean, traditional subtitles showing complete sentences with uniform color.
                    </span>
                  </span>
                </div>
              </div>

              <div>
                <p className="mkt-panelhead">
                  <span><Icon glyph="🖼" /> Background Framing</span>
                  <span className="mkt-panelstate">No Box</span>
                </p>
                <div className="mkt-cardgrid" aria-hidden="true">
                  <span className="mkt-card is-on">
                    <span className="mkt-card-title"><Icon glyph="🔲" /> Transparent</span>
                    <span className="mkt-card-note">
                      Pure text with high-contrast outlines and drop-shadows. No background box.
                    </span>
                  </span>
                  <span className="mkt-card">
                    <span className="mkt-card-title"><Icon glyph="⬛" /> Blocked Box</span>
                    <span className="mkt-card-note">
                      Translucent dark rounded pill behind text for maximum cinematic legibility.
                    </span>
                  </span>
                </div>
              </div>

              <div>
                <p className="mkt-panelhead">
                  <span><Icon glyph="👁" /> Live Caption Preview</span>
                </p>
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
              </div>

              <p className="mkt-panelhead" style={{ marginBottom: 0 }}>
                <span><Icon glyph="🎨" /> Subtitle Visual Style Presets</span>
                <span className="mkt-panelstate">Click to preview style</span>
              </p>

              <div style={{ display: "grid", gap: 8 }}>
                {CAPTION_STYLES.map((entry) => {
                  const free = isPlanCaptionIncluded("free", entry.id);
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

              <div>
                <p className="mkt-panelhead" style={{ marginBottom: 2 }}>
                  <span><Icon glyph="📜" /> Scene Subtitles & On/Off Toggles</span>
                </p>
                <p className="mkt-small" style={{ margin: "0 0 9px" }}>
                  Enable or disable caption overlays individually per scene.
                </p>
                <div style={{ display: "grid", gap: 7 }} aria-hidden="true">
                  {DEMO_SCENES.slice(0, 3).map((item) => (
                    <div
                      className="mkt-strip-row"
                      key={item.number}
                      style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}
                    >
                      <span className="mkt-strip-label">
                        Scene {item.number} · {item.caption}
                      </span>
                      <span className="mkt-pill is-live" style={{ fontSize: 9.5 }}>
                        Captions on
                      </span>
                    </div>
                  ))}
                </div>
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
