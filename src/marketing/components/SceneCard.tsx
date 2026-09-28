import { MarketingImage } from "./primitives";
import { DEMO_VOICE, type DemoScene } from "../demo-project";
import Icon from "../../components/icons/Icon";

/**
 * The scene card — the single most recognisable object in Scenering, and the
 * unit the whole website is built from.
 *
 * It carries exactly what the studio's card carries: the scene number, the
 * line of script, the chosen visual, the duration, whether narration exists,
 * and the controls that let the creator change any of it.
 *
 * Note what the duration is *not*: a fixed interval. Every card shows its own
 * length because the scene lasts as long as its narration does.
 */
export default function SceneCard({
  scene,
  selected = false,
  showVisual = true,
  showNarration = true,
  showActions = true,
  onSelect,
  onReplace,
  replaceLabel = "Replace",
  compact = false,
}: {
  scene: DemoScene;
  selected?: boolean;
  showVisual?: boolean;
  showNarration?: boolean;
  showActions?: boolean;
  onSelect?: () => void;
  onReplace?: () => void;
  replaceLabel?: string;
  compact?: boolean;
}) {
  const body = (
    <>
      {showVisual ? (
        <MarketingImage assetId={scene.assetId} sizes="(min-width: 900px) 180px, 45vw">
          <span className="mkt-thumb-tag">{scene.duration.toFixed(1)}s</span>
        </MarketingImage>
      ) : (
        <span className="mkt-thumb is-pending" role="img" aria-label="No visual chosen yet">
          Searching…
        </span>
      )}

      <div className="mkt-scene-body">
        <div className="mkt-scene-top">
          <span className="mkt-scene-no">{scene.number}</span>
          {showNarration ? (
            <span className="mkt-pill is-accent">
              <span className="mkt-dot" aria-hidden="true" />
              Narrated
            </span>
          ) : (
            <span className="mkt-pill is-plain">No narration yet</span>
          )}
          {showVisual && <span className="mkt-pill is-plain">{scene.motion}</span>}
        </div>

        <p className="mkt-scene-text">{scene.text}</p>

        {showNarration && !compact && (
          <div className="mkt-scene-narr">
            <span className="mkt-scene-narr-ico" aria-hidden="true">🎙</span>
            <span className="mkt-small">
              {DEMO_VOICE.name} · {scene.duration.toFixed(1)}s of narration
            </span>
          </div>
        )}

        <div className="mkt-scene-meta">
          <span className="mkt-small">{scene.duration.toFixed(1)}s</span>
          {showVisual && <span className="mkt-small">· {scene.source}</span>}
        </div>

        {showActions && (
          <div className="mkt-scene-actions">
            <button type="button" className="mkt-mini-btn" onClick={onReplace}>
              ⟳ {replaceLabel}
            </button>
            <button type="button" className="mkt-mini-btn">
              <Icon glyph="✎" /> Edit text
            </button>
            <button type="button" className="mkt-mini-btn">
              ⤢ Crop
            </button>
          </div>
        )}
      </div>
    </>
  );

  if (!onSelect) {
    return <div className={`mkt-scene${selected ? " is-selected" : ""}`}>{body}</div>;
  }

  return (
    <div
      className={`mkt-scene${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {body}
    </div>
  );
}
