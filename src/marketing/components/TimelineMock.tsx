import { MarketingImage } from "./primitives";
import { DEMO_SCENES, DEMO_TOTAL_SECONDS, DEMO_TIMELINE_EXTRAS, formatDuration } from "../demo-project";
import Icon from "../../components/icons/Icon";

/**
 * The Video Studio timeline, laid out the way `src/components/Timeline.tsx`
 * lays it out.
 *
 * This used to show six lanes — Scenes, Narration, Music, Sound FX, Captions
 * and Effects. The app has three. Narration is not a lane because narration
 * belongs to the scene and sets its length; captions are not a lane at all,
 * they are configured in the Captions phase and burned into the picture; and
 * music and sound effects are not separate lanes, they are both things you
 * drop into Sound. Showing six lanes advertised a kind of per-track editing
 * that does not exist in the product.
 *
 * What the app actually shows, top to bottom:
 *
 *   header      ▶ play · ‹ › step · 0:12 / 0:42 · zoom · Expand/Contract
 *   ‹  ruler
 *      Scenes      the scene blocks, width proportional to duration
 *      Visual FX   stickers, lower thirds, calls to action, text  ›
 *      Sound       music and sound effects
 *
 * with the three lane names pinned to the left edge on little dark chips so
 * they stay put while the track area scrolls sideways. The last two lanes
 * only appear when the timeline is expanded, which is the state worth
 * showing, and each carries the app's own wording when it is empty.
 */

/** The app's three lanes. Named as the app names them. */
export type TimelineLane = "scenes" | "visual" | "sound";

const ALL_LANES: TimelineLane[] = ["scenes", "visual", "sound"];

export default function TimelineMock({
  lanes = ALL_LANES,
  items = 99,
  playheadAt = 0.42,
  showRuler = true,
  showHeader = true,
  height = 26,
}: {
  lanes?: TimelineLane[];
  /**
   * How many of the demonstration project's overlay items have been placed.
   * The staged sections count this up to show a timeline being filled in;
   * the lanes themselves never appear or disappear, because in the app they
   * do not.
   */
  items?: number;
  /** 0–1 across the whole project. */
  playheadAt?: number;
  showRuler?: boolean;
  showHeader?: boolean;
  height?: number;
}) {
  const total = DEMO_TOTAL_SECONDS;
  const pct = (seconds: number) => `${(seconds / total) * 100}%`;
  const clamped = Math.min(1, Math.max(0, playheadAt));
  const show = (lane: TimelineLane) => lanes.includes(lane);

  /** Overlay items in the order the demonstration project places them. */
  const visualItems = [
    { key: "lower", glyph: "▭", label: "Lower third", from: DEMO_TIMELINE_EXTRAS.lowerThird.from, to: DEMO_TIMELINE_EXTRAS.lowerThird.to },
    { key: "sticker", glyph: "✱", label: "Sticker", from: DEMO_TIMELINE_EXTRAS.sticker.from, to: DEMO_TIMELINE_EXTRAS.sticker.to },
    { key: "cta", glyph: "▶", label: "Subscribe", from: DEMO_TIMELINE_EXTRAS.cta.from, to: DEMO_TIMELINE_EXTRAS.cta.to },
  ].slice(0, Math.max(0, items));

  const soundItems = [
    { key: "music", glyph: "♪", label: `${DEMO_TIMELINE_EXTRAS.music.name} · ${DEMO_TIMELINE_EXTRAS.music.detail}`, from: 0, to: total },
    { key: "sfx", glyph: "✶", label: DEMO_TIMELINE_EXTRAS.soundEffect.name, from: DEMO_TIMELINE_EXTRAS.soundEffect.at, to: DEMO_TIMELINE_EXTRAS.soundEffect.at + total * 0.16 },
  ].slice(0, Math.max(0, items - 3));

  const overlayLane = (
    lane: TimelineLane,
    label: string,
    glyph: string,
    placed: { key: string; glyph: string; label: string; from: number; to: number }[],
    empty: string,
  ) => (
    <div className="mkt-tl-lane" style={{ height }}>
      <span className="mkt-tl-chip">
        <Icon glyph={glyph} /> {label}
      </span>
      {placed.length === 0 ? (
        <span className="mkt-tl-empty">{empty}</span>
      ) : (
        placed.map((item) => (
          <span
            key={item.key}
            className={`mkt-tl-block is-${lane}`}
            style={{ left: pct(item.from), width: pct(item.to - item.from) }}
          >
            <Icon glyph={item.glyph} /> {item.label}
          </span>
        ))
      )}
    </div>
  );

  return (
    <div className="mkt-tl" style={{ ["--mkt-play" as string]: clamped }}>
      {/* ---- header: transport, then zoom and expand, exactly as the app ---- */}
      {showHeader && (
        <div className="mkt-tl-head" aria-hidden="true">
          <div className="mkt-tl-transport">
            <span className="mkt-tl-play t-btn-hero">
              <Icon glyph="▶" />
            </span>
            <span className="mkt-tl-step t-btn-hero-ghost">‹</span>
            <span className="mkt-tl-step t-btn-hero-ghost">›</span>
            <span className="mkt-tl-time">
              <b>{formatDuration(total * clamped)}</b>
              <i>/</i>
              <span>{formatDuration(total)}</span>
            </span>
          </div>

          <div className="mkt-tl-right">
            <span className="mkt-tl-zoom">
              <span className="mkt-tl-zoom-btn">−</span>
              <span className="mkt-tl-zoom-rail">
                <span className="mkt-tl-zoom-knob" />
              </span>
              <span className="mkt-tl-zoom-btn">+</span>
              <span className="mkt-tl-zoom-pct">100%</span>
            </span>
            <span className="mkt-tl-expand t-btn-hero-ghost">
              <Icon glyph="▲" /> Contract
            </span>
          </div>
        </div>
      )}

      {/* ---- track area: a step arrow either side of the scrolling view ---- */}
      <div className="mkt-tl-area">
        <span className="mkt-tl-arrow t-btn-hero-ghost" aria-hidden="true">‹</span>

        <div className="mkt-tl-view">
          {showRuler && (
            <div className="mkt-tl-ruler" aria-hidden="true">
              {[0, 0.25, 0.5, 0.75].map((at) => (
                <span key={at} className="mkt-tl-tick" style={{ left: `${at * 100}%` }}>
                  {formatDuration(total * at)}
                </span>
              ))}
            </div>
          )}

          {show("scenes") && (
            <div className="mkt-tl-lane is-scenes" style={{ height: height + 8 }}>
              <span className="mkt-tl-chip">
                <Icon glyph="📝" /> Scenes
              </span>
              {DEMO_SCENES.map((scene) => (
                <span
                  key={scene.number}
                  className="mkt-tl-clip"
                  style={{ width: pct(scene.duration) }}
                  title={`Scene ${scene.number} · ${scene.duration.toFixed(1)}s`}
                >
                  <MarketingImage assetId={scene.assetId} sizes="120px" />
                </span>
              ))}
            </div>
          )}

          {show("visual") &&
            overlayLane(
              "visual",
              "Visual FX",
              "🎞️",
              visualItems,
              "No visual effects yet — add stickers, text, visualisers…",
            )}

          {show("sound") &&
            overlayLane("sound", "Sound", "🔊", soundItems, "No sounds yet — add music or sound effects…")}

          <span className="mkt-tl-playhead" aria-hidden="true" />
        </div>

        <span className="mkt-tl-arrow t-btn-hero-ghost" aria-hidden="true">›</span>
      </div>
    </div>
  );
}
