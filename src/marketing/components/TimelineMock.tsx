import { MarketingImage } from "./primitives";
import { DEMO_SCENES, DEMO_TOTAL_SECONDS, DEMO_TIMELINE_EXTRAS, formatDuration } from "../demo-project";
import Icon from "../../components/icons/Icon";

/**
 * The Video Studio timeline.
 *
 * One lane per thing that can be on a Scenering timeline: the scenes
 * themselves, narration, music, sound effects, captions and the overlay
 * effects. Lane widths are the real scene durations of the demonstration
 * project, so the proportions are honest — scene 02 is wider because its
 * narration is longer.
 */

export type TimelineTrack = "scenes" | "voice" | "music" | "sfx" | "captions" | "effects";

const ALL_TRACKS: TimelineTrack[] = ["scenes", "voice", "music", "sfx", "captions", "effects"];

export default function TimelineMock({
  tracks = ALL_TRACKS,
  playheadAt = 0.42,
  showRuler = true,
  height = 26,
}: {
  tracks?: TimelineTrack[];
  /** 0–1 across the whole project. */
  playheadAt?: number;
  showRuler?: boolean;
  height?: number;
}) {
  const total = DEMO_TOTAL_SECONDS;
  const pct = (seconds: number) => `${(seconds / total) * 100}%`;
  const lane = (children: React.ReactNode, tall = false) => (
    <div className="mkt-track-lane" style={{ height: tall ? height + 8 : height }}>
      {children}
    </div>
  );

  const show = (track: TimelineTrack) => tracks.includes(track);
  const clamped = Math.min(1, Math.max(0, playheadAt));

  return (
    <div className="mkt-timeline" style={{ ["--mkt-play" as string]: clamped }}>
      {showRuler && (
        <div className="mkt-ruler" aria-hidden="true">
          <span>0:00</span>
          <span>{formatDuration(total * 0.25)}</span>
          <span>{formatDuration(total * 0.5)}</span>
          <span>{formatDuration(total * 0.75)}</span>
          <span>{formatDuration(total)}</span>
        </div>
      )}

      {show("scenes") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Scenes</span>
          {lane(
            DEMO_SCENES.map((scene) => (
              <span
                key={scene.number}
                className="mkt-clip is-scene"
                style={{ width: pct(scene.duration) }}
                title={`Scene ${scene.number} · ${scene.duration.toFixed(1)}s`}
              >
                <MarketingImage assetId={scene.assetId} sizes="120px" />
              </span>
            )),
            true
          )}
        </div>
      )}

      {show("voice") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Narration</span>
          {lane(
            DEMO_SCENES.map((scene) => (
              <span key={scene.number} className="mkt-clip is-voice" style={{ width: pct(scene.duration) }}>
                🎙️ {scene.duration.toFixed(1)}s
              </span>
            ))
          )}
        </div>
      )}

      {show("music") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Music</span>
          {lane(
            <span className="mkt-clip is-music" style={{ width: "100%" }}>
              ♪ {DEMO_TIMELINE_EXTRAS.music.name} · {DEMO_TIMELINE_EXTRAS.music.detail}
            </span>
          )}
        </div>
      )}

      {show("sfx") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Sound FX</span>
          {lane(
            <>
              <span className="mkt-clip is-empty" style={{ width: pct(DEMO_TIMELINE_EXTRAS.soundEffect.at) }} />
              <span className="mkt-clip is-fx" style={{ width: "16%" }}>
                ✶ {DEMO_TIMELINE_EXTRAS.soundEffect.name}
              </span>
              <span className="mkt-clip is-empty" style={{ flex: "1 1 auto" }} />
            </>
          )}
        </div>
      )}

      {show("captions") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Captions</span>
          {lane(
            DEMO_SCENES.map((scene) => (
              <span key={scene.number} className="mkt-clip is-caption" style={{ width: pct(scene.duration) }}>
                {scene.caption}
              </span>
            ))
          )}
        </div>
      )}

      {show("effects") && (
        <div className="mkt-track">
          <span className="mkt-track-label">Effects</span>
          {lane(
            <>
              <span
                className="mkt-clip is-fx"
                style={{ width: pct(DEMO_TIMELINE_EXTRAS.lowerThird.to - DEMO_TIMELINE_EXTRAS.lowerThird.from) }}
              >
                <Icon glyph="▭" /> Lower third
              </span>
              <span
                className="mkt-clip is-empty"
                style={{ width: pct(DEMO_TIMELINE_EXTRAS.sticker.from - DEMO_TIMELINE_EXTRAS.lowerThird.to) }}
              />
              <span
                className="mkt-clip is-fx"
                style={{ width: pct(DEMO_TIMELINE_EXTRAS.sticker.to - DEMO_TIMELINE_EXTRAS.sticker.from) }}
              >
                <Icon glyph="✱" /> Sticker
              </span>
              <span
                className="mkt-clip is-empty"
                style={{ width: pct(DEMO_TIMELINE_EXTRAS.cta.from - DEMO_TIMELINE_EXTRAS.sticker.to) }}
              />
              <span
                className="mkt-clip is-fx"
                style={{ width: pct(DEMO_TIMELINE_EXTRAS.cta.to - DEMO_TIMELINE_EXTRAS.cta.from) }}
              >
                <Icon glyph="▶" /> Subscribe
              </span>
              <span className="mkt-clip is-empty" style={{ flex: "1 1 auto" }} />
            </>
          )}
        </div>
      )}

      <span className="mkt-playhead" aria-hidden="true" />
    </div>
  );
}
