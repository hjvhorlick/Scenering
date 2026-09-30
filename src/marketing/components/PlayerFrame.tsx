import type { ReactNode } from "react";
import { MarketingImage } from "./primitives";
import CaptionLine from "./CaptionLine";
import type { CaptionStyleDef } from "../../data/caption-styles";

/**
 * A video preview frame: the still, the caption burned over it, a progress
 * bar and an optional badge.
 *
 * It is a preview, not a video player — there is no fake play button that
 * does nothing. When a real demonstration clip is registered for an asset the
 * site plays that instead (muted, lazy, with this frame as the poster); until
 * then this is honest about being a preview of one frame.
 */
export default function PlayerFrame({
  assetId,
  caption,
  captionStyle,
  highlightWord,
  progress = 0,
  badge,
  vertical = false,
  sizes = "(min-width: 900px) 520px, 92vw",
  eager = false,
  captionSize = 15,
  grade,
  children,
}: {
  assetId: string;
  caption?: string;
  captionStyle?: CaptionStyleDef;
  highlightWord?: number;
  /** 0–1. */
  progress?: number;
  badge?: ReactNode;
  vertical?: boolean;
  sizes?: string;
  eager?: boolean;
  captionSize?: number;
  /** The project's colour grade, as CSS, from the app's filter catalogue. */
  grade?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`mkt-player${vertical ? " is-vertical" : ""}`}>
      <MarketingImage assetId={assetId} sizes={sizes} eager={eager} vertical={vertical} grade={grade} />
      <span className="mkt-player-shade" aria-hidden="true" />
      {caption && captionStyle && (
        <span className="mkt-player-cap">
          <CaptionLine text={caption} style={captionStyle} size={captionSize} highlightWord={highlightWord} />
        </span>
      )}
      {badge && <span className="mkt-player-badge">{badge}</span>}
      <span className="mkt-player-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
      </span>
      {children}
    </div>
  );
}
